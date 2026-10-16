import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageSquareText, Send, TicketCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supportAPI } from '../../lib/api';

const statusLabel = status => ({ open: 'Open', in_progress: 'In Progress', awaiting_user: 'In Progress', resolved: 'Resolved', closed: 'Closed' }[status] || status || 'Open');
const when = value => value ? new Date(value).toLocaleString('en-GB') : '—';

export default function MySupportTickets({ user, onBack, focusCaseId = null }) {
  const [cases, setCases] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const focusedRef = useRef(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const data = await supportAPI.mine();
      const items = data.cases || [];
      setCases(items);
      // Resolve the focus target outside the state updater (StrictMode double-invokes updaters).
      const focusMatch = focusCaseId && !focusedRef.current ? items.find(item => item.case_id === focusCaseId) : null;
      if (focusMatch) focusedRef.current = true;
      setSelected(current => {
        if (current) return items.find(item => item.case_id === current.case_id) || null;
        return focusMatch || null;
      });
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load your tickets. Please sign in and try again.');
    } finally { setLoading(false); }
  }, [user, focusCaseId]);

  useEffect(() => { load(); }, [load]);

  const sendReply = async event => {
    event.preventDefault();
    if (!selected || !reply.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await supportAPI.reply(selected.case_id, reply.trim());
      setReply('');
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Your reply was not sent. Please try again.');
    } finally { setBusy(false); }
  };

  if (!user) return <div className="pl-support-ticket-view"><button type="button" onClick={onBack} className="pl-support-back"><ArrowLeft size={14} />Support options</button><div className="pl-support-signed-out"><TicketCheck size={26} /><b>Sign in to view support tickets</b><p>Your tickets are private to your account. You can still talk to the AI assistant or create a guest ticket.</p><Link className="pl-support-submit px-4 py-2" to="/login">Sign in</Link></div></div>;

  return (
    <div className="pl-support-ticket-view" data-testid="support-my-tickets-view">
      <button type="button" onClick={() => selected ? setSelected(null) : onBack()} className="pl-support-back"><ArrowLeft size={14} />{selected ? 'All my tickets' : 'Support options'}</button>
      {error && <p className="pl-support-error" role="alert">{error}</p>}
      {loading && <p className="pl-support-loading" role="status">Loading your tickets…</p>}
      {!loading && !selected && <>
        <div className="pl-support-ticket-heading"><TicketCheck size={20} /><div><b>My Support Tickets</b><small>Only tickets linked to your account are shown.</small></div></div>
        {cases.length ? <div className="pl-support-ticket-list">{cases.map(item => <button type="button" key={item.case_id} onClick={() => setSelected(item)}><span><b>{item.subject}</b><small>{item.case_id} · {when(item.updated_at || item.created_at)}</small></span><em>{statusLabel(item.status)}</em></button>)}</div> : <p className="pl-support-empty">No support tickets yet.</p>}
      </>}
      {selected && <>
        <div className="pl-support-ticket-heading"><MessageSquareText size={19} /><div><b>{selected.subject}</b><small>{selected.case_id} · {statusLabel(selected.status)}</small></div></div>
        <div className="pl-support-user-thread">{(selected.messages || []).map((message, index) => <article key={`${selected.case_id}_${index}`} className={message.author === 'admin' ? 'is-support' : ''}><div><b>{message.author === 'admin' ? 'Prize League Customer Support' : message.author === 'assistant' ? 'AI Assistant' : 'You'}</b><time>{when(message.at)}</time></div><p>{message.body}</p></article>)}</div>
        {selected.status !== 'closed' && <form className="pl-support-chat-input" onSubmit={sendReply}><textarea value={reply} onChange={event => setReply(event.target.value)} placeholder="Reply to support…" aria-label="Reply to support" maxLength={5000} rows={1} /><button type="submit" disabled={busy || !reply.trim()} aria-label="Send reply" title="Send reply"><Send size={17} /></button></form>}
      </>}
    </div>
  );
}
