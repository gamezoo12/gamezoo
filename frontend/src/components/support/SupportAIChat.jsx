import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bot, Send, LoaderCircle, UserRound, TicketPlus } from 'lucide-react';
import { supportAPI } from '../../lib/api';

const WELCOME = "Hi! 👋 I'm your Prize League AI Assistant. I can help with games, contests, Free World, leaderboards, wallets, prizes and account questions. What do you need help with?";
const CATEGORIES = [
  ['account', 'Account'], ['payment', 'Payment'], ['ticket', 'Tickets / Draws'],
  ['game', 'Games'], ['kyc', 'Verification'], ['free_world', 'Free World'],
  ['leaderboard', 'Leaderboards'], ['wallet', 'Wallet'], ['other', 'Other'],
];
const stamp = value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function SupportAIChat({ user, aiAvailable, onBack }) {
  const [messages, setMessages] = useState(() => [{ id: 'welcome', role: 'assistant', content: WELCOME, at: new Date().toISOString() }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ticketDraft, setTicketDraft] = useState(null);
  const [ticketForm, setTicketForm] = useState({ category: 'other', subject: '', message: '', name: '', email: '' });
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketConfirmation, setTicketConfirmation] = useState('');
  const [dismissedEscalation, setDismissedEscalation] = useState(null);
  const endRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages, busy, ticketDraft, ticketConfirmation]);

  const send = async event => {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const nextMessages = [...messages, { id: `u_${Date.now()}`, role: 'user', content: text, at: new Date().toISOString() }];
    setMessages(nextMessages);
    setInput('');
    setBusy(true);
    setTicketConfirmation('');
    try {
      const result = await supportAPI.aiChat(text, messages.filter(item => item.id !== 'welcome').slice(-20).map(item => ({ role: item.role, content: item.content })));
      const assistantMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: result.reply,
        at: new Date().toISOString(),
        needsHuman: Boolean(result.needs_human),
        category: result.category || 'other',
        summary: result.summary || '',
      };
      setMessages(current => [...current, assistantMessage]);
      if (result.needs_human) {
        const lastUserMessage = [...nextMessages].reverse().find(item => item.role === 'user')?.content || text;
        setTicketForm({
          category: result.category || 'other',
          subject: lastUserMessage.slice(0, 120),
          message: lastUserMessage,
          name: user?.name || '',
          email: user?.email || '',
        });
      }
    } catch (error) {
      setMessages(current => [...current, {
        id: `e_${Date.now()}`,
        role: 'assistant',
        content: error?.response?.data?.detail || "I couldn't reach support right now. Please try again, or use Email Support from the support menu.",
        at: new Date().toISOString(),
        needsHuman: true,
        category: 'other',
        summary: '',
      }]);
    } finally { setBusy(false); }
  };

  const createTicket = async event => {
    event.preventDefault();
    if (!ticketDraft || ticketBusy) return;
    const conversationHistory = messages.slice(-20).map(item => ({ role: item.role, content: item.content }));
    const payload = {
      category: ticketForm.category,
      subject: ticketForm.subject.trim(),
      message: ticketForm.message.trim(),
      ai_summary: ticketDraft.summary || `AI could not resolve the issue. User reported: ${ticketForm.message.trim().slice(0, 700)}`,
      conversation_history: conversationHistory,
      idempotency_key: ticketDraft.id,
    };
    if (!user) {
      payload.name = ticketForm.name.trim();
      payload.email = ticketForm.email.trim();
    }
    setTicketBusy(true);
    try {
      const result = user ? await supportAPI.create(payload) : await supportAPI.createGuest(payload);
      setTicketConfirmation(result.case_id);
      setTicketDraft(null);
    } catch (error) {
      setTicketConfirmation('');
      setMessages(current => [...current, {
        id: `ticket_error_${Date.now()}`,
        role: 'assistant',
        content: error?.response?.data?.detail || 'The support ticket was not submitted. Please try again.',
        at: new Date().toISOString(),
      }]);
    } finally { setTicketBusy(false); }
  };

  return (
    <div className="pl-support-chat" data-testid="support-ai-chat">
      <button type="button" onClick={onBack} className="pl-support-back"><ArrowLeft size={14} /> Support options</button>
      {aiAvailable === false && <p className="pl-support-error" role="status">AI answers are not configured yet. I can still search approved answers and forward unresolved questions to support.</p>}
      <div ref={scrollRef} className="pl-support-messages" aria-live="polite" aria-label="AI support conversation">
        {messages.map(message => <article key={message.id} className={`pl-support-message-row ${message.role === 'user' ? 'is-user' : ''}`}>
          <span className={`pl-support-message-avatar ${message.role === 'user' ? 'is-user' : ''}`} aria-hidden="true">{message.role === 'user' ? <UserRound size={14} /> : <Bot size={15} />}</span>
          <div className="pl-support-message-content"><div className={`pl-support-bubble ${message.role === 'user' ? 'is-user' : ''}`}><p>{message.content}</p></div><time>{stamp(message.at)}</time>
            {message.needsHuman && dismissedEscalation !== message.id && !ticketConfirmation && (
              <div className="pl-support-escalation" data-testid="support-escalation">
                <button type="button" onClick={() => { setTicketDraft(message); setDismissedEscalation(null); }}><TicketPlus size={15} />Create Support Ticket</button>
                <button type="button" onClick={() => setDismissedEscalation(message.id)}>Continue Chatting</button>
              </div>
            )}
          </div>
        </article>)}
        {busy && <div className="pl-support-message-row"><span className="pl-support-message-avatar"><Bot size={15} /></span><div className="pl-support-bubble pl-support-typing" role="status" aria-label="Assistant is typing"><i /><i /><i /></div></div>}
        {ticketConfirmation && <div className="pl-support-ticket-confirm" role="status" data-testid="support-ticket-confirmation"><b>Ticket created</b><span>Your reference is <code>{ticketConfirmation}</code>.</span><span>Our support team can now review your request.</span></div>}
        {ticketDraft && <form className="pl-support-ticket-form" onSubmit={createTicket} data-testid="support-ticket-confirm-form"><div><b>Send this to Prize League Support?</b><p>Review the details, then confirm to create one ticket.</p></div>
          <label>Category<select value={ticketForm.category} onChange={event => setTicketForm(form => ({ ...form, category: event.target.value }))}>{CATEGORIES.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
          <label>Subject<input required minLength={3} maxLength={200} value={ticketForm.subject} onChange={event => setTicketForm(form => ({ ...form, subject: event.target.value }))} /></label>
          <label>Issue description<textarea required minLength={10} maxLength={5000} rows={3} value={ticketForm.message} onChange={event => setTicketForm(form => ({ ...form, message: event.target.value }))} /></label>
          {!user && <><label>Your name<input required minLength={2} maxLength={100} autoComplete="name" value={ticketForm.name} onChange={event => setTicketForm(form => ({ ...form, name: event.target.value }))} /></label><label>Email for a reply<input required type="email" autoComplete="email" value={ticketForm.email} onChange={event => setTicketForm(form => ({ ...form, email: event.target.value }))} /></label></>}
          <div className="flex gap-2"><button type="button" className="pl-support-cancel" onClick={() => setTicketDraft(null)}>Continue Chatting</button><button type="submit" disabled={ticketBusy} className="pl-support-confirm" data-testid="support-ticket-confirm">{ticketBusy ? 'Submitting…' : 'Create Support Ticket'}</button></div>
        </form>}
        <div ref={endRef} />
      </div>
      <form className="pl-support-chat-input" onSubmit={send}><textarea value={input} onChange={event => setInput(event.target.value)} placeholder="Ask about Prize League…" aria-label="Your message" maxLength={2000} rows={1} disabled={busy || Boolean(ticketDraft)} /><button type="submit" disabled={busy || !input.trim() || Boolean(ticketDraft)} aria-label="Send message" title="Send message">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <Send size={18} />}</button></form>
      <p className="pl-support-privacy-note">Messages are processed by our configured AI provider and are not saved in support history unless you confirm a ticket. Never share passwords, one-time codes, or full payment-card details.</p>
    </div>
  );
}
