import { useCallback, useEffect, useState } from 'react';
import { LifeBuoy, Sparkles, Search, Send, Plus, Trash2, Save, UserRound, Clock3, MessageSquareText, BookOpen, ArrowLeft } from 'lucide-react';
import { adminAPI } from '../../lib/api';
import { useToast } from '../../hooks/use-toast';

const STATUS_OPTIONS = [
  ['open', 'Open'],
  ['in_progress', 'In Progress'],
  ['resolved', 'Resolved'],
  ['closed', 'Closed'],
];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const CATEGORIES = ['account', 'payment', 'ticket', 'game', 'kyc', 'free_world', 'leaderboard', 'wallet', 'other'];
const MANUAL_TEMPLATES = [
  ['Request details', 'Hello,\n\nThank you for contacting us. To look into this properly, could you please share the contest name, the date it happened and any reference or error message you saw?\n\nKind regards,\nPrize League Customer Support'],
  ['Basic troubleshooting', 'Hello,\n\nThank you for letting us know. Please refresh the page, log out and back in, and try again in another browser. If it still happens, reply with your device and browser details.\n\nKind regards,\nPrize League Customer Support'],
];
const when = value => value ? new Date(value).toLocaleString('en-GB') : '—';

export default function SupportTicketsAdmin() {
  const { toast } = useToast();
  const [tab, setTab] = useState('tickets');
  const [cases, setCases] = useState([]);
  const [counts, setCounts] = useState({});
  const [staff, setStaff] = useState([]);
  const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [sugg, setSugg] = useState(null);
  const [suggBusy, setSuggBusy] = useState(false);
  const [suggAttempt, setSuggAttempt] = useState(0);
  const [editingSugg, setEditingSugg] = useState(null);
  const [knowledge, setKnowledge] = useState([]);
  const [editingKnowledge, setEditingKnowledge] = useState(null);
  const [knowledgeForm, setKnowledgeForm] = useState({ title: '', answer: '', active: true });
  const [knowledgeBusy, setKnowledgeBusy] = useState(false);

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminAPI.supportCasesSearch({
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        search: search.trim() || undefined,
      });
      setCases(data.cases || []);
      setCounts(data.counts || {});
      setStaff(data.staff || []);
      setSelected(current => current ? (data.cases || []).find(row => row.case_id === current.case_id) || null : null);
    } catch (error) {
      toast({ title: 'Could not load support tickets', description: error?.response?.data?.detail || 'Please try again.' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, search, toast]);

  const loadKnowledge = useCallback(async () => {
    try {
      const data = await adminAPI.supportKnowledge();
      setKnowledge(data.items || []);
    } catch (error) {
      toast({ title: 'Could not load support knowledge', description: error?.response?.data?.detail || 'Please try again.' });
    }
  }, [toast]);

  useEffect(() => { loadCases(); }, [loadCases]);
  useEffect(() => { if (tab === 'knowledge') loadKnowledge(); }, [tab, loadKnowledge]);

  const runCaseAction = async (action, success) => {
    if (!selected) return;
    try {
      await action();
      await loadCases();
      toast({ title: success });
    } catch (error) {
      toast({ title: 'Update failed', description: error?.response?.data?.detail || 'Please try again.' });
    }
  };

  const selectedId = selected?.case_id;
  useEffect(() => { setSugg(null); setSuggAttempt(0); setEditingSugg(null); }, [selectedId]);

  const loadSuggestions = async (attempt = 0) => {
    if (!selected) return;
    setSuggBusy(true);
    setEditingSugg(null);
    try {
      setSugg(await adminAPI.supportSuggestions(selected.case_id, attempt));
      setSuggAttempt(attempt);
    } catch (error) {
      toast({ title: 'Could not generate suggestions', description: error?.response?.data?.detail || 'Please try again.' });
    } finally { setSuggBusy(false); }
  };

  const updateSuggText = (id, text) => setSugg(cur => ({ ...cur, suggestions: cur.suggestions.map(s => s.id === id ? { ...s, text } : s) }));

  const sendReply = async event => {
    event.preventDefault();
    if (!reply.trim() || !selected) return;
    const message = reply.trim();
    try {
      const result = await adminAPI.supportReply(selected.case_id, message);
      setReply('');
      await loadCases();
      if (result.email_client_required && selected.user_email) {
        const mailto = `mailto:${encodeURIComponent(selected.user_email)}?subject=${encodeURIComponent(`Prize League Support · ${selected.case_id}`)}&body=${encodeURIComponent(message)}`;
        window.location.href = mailto;
        toast({ title: 'Reply saved; email draft opened', description: 'Send the draft in your email application to deliver it to the guest.' });
      } else {
        toast({ title: 'Reply sent to user' });
      }
    } catch (error) {
      toast({ title: 'Reply failed', description: error?.response?.data?.detail || 'Please try again.' });
    }
  };

  const addNote = async event => {
    event.preventDefault();
    if (!note.trim() || !selected) return;
    await runCaseAction(async () => {
      await adminAPI.supportNote(selected.case_id, note.trim());
      setNote('');
    }, 'Internal note added');
  };

  const startKnowledgeEdit = item => {
    setEditingKnowledge(item?.knowledge_id || null);
    setKnowledgeForm(item ? { title: item.title, answer: item.answer, active: item.active !== false } : { title: '', answer: '', active: true });
  };

  const saveKnowledge = async event => {
    event.preventDefault();
    setKnowledgeBusy(true);
    try {
      if (editingKnowledge) await adminAPI.updateSupportKnowledge(editingKnowledge, knowledgeForm);
      else await adminAPI.createSupportKnowledge(knowledgeForm);
      setEditingKnowledge(null);
      setKnowledgeForm({ title: '', answer: '', active: true });
      await loadKnowledge();
      toast({ title: 'Approved answer saved' });
    } catch (error) {
      toast({ title: 'Could not save answer', description: error?.response?.data?.detail || 'Please try again.' });
    } finally { setKnowledgeBusy(false); }
  };

  const removeKnowledge = async id => {
    if (!window.confirm('Delete this approved support answer?')) return;
    try {
      await adminAPI.deleteSupportKnowledge(id);
      await loadKnowledge();
      toast({ title: 'Approved answer deleted' });
    } catch (error) {
      toast({ title: 'Delete failed', description: error?.response?.data?.detail || 'Please try again.' });
    }
  };

  return (
    <div className="max-w-[1500px] space-y-5" data-testid="support-admin-page">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-500 via-blue-600 to-fuchsia-600 text-white shadow-lg"><LifeBuoy size={22} /></span>
          <div><h1 className="font-display text-2xl font-extrabold text-slate-900">Customer Support</h1><p className="text-sm text-slate-500">Tickets and approved AI answers</p></div>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1" role="tablist" aria-label="Support management views">
          <button type="button" role="tab" aria-selected={tab === 'tickets'} onClick={() => { setTab('tickets'); setSelected(null); }} className={`rounded-md px-3 py-2 text-sm font-bold ${tab === 'tickets' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><MessageSquareText size={15} className="mr-1 inline" />Tickets</button>
          <button type="button" role="tab" aria-selected={tab === 'knowledge'} onClick={() => { setTab('knowledge'); setSelected(null); }} className={`rounded-md px-3 py-2 text-sm font-bold ${tab === 'knowledge' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><BookOpen size={15} className="mr-1 inline" />Knowledge</button>
        </div>
      </header>

      {tab === 'tickets' && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Ticket counts">
            {STATUS_OPTIONS.map(([key, label]) => <div key={key} className="flex items-center justify-between border-b-2 border-slate-200 px-2 py-3"><span className="text-sm font-semibold text-slate-600">{label}</span><b className="font-display text-2xl text-slate-900">{counts[key] || 0}</b></div>)}
          </section>
          <div className={`grid min-h-[560px] gap-5 ${selected ? 'xl:grid-cols-[minmax(320px,0.82fr)_minmax(500px,1.5fr)]' : ''}`}>
            <section className="min-w-0" data-testid="support-ticket-list">
              <div className="mb-3 flex flex-wrap gap-2">
                <label className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ID, name, email or subject" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm" /></label>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All statuses</option>{STATUS_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
                <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All priorities</option>{PRIORITIES.map(value => <option key={value} value={value}>{value}</option>)}</select>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase text-slate-500"><span>Ticket / User</span><span>Status</span></div>
                <div className="max-h-[70vh] overflow-y-auto">
                  {loading && <p className="p-6 text-center text-sm text-slate-500">Loading tickets…</p>}
                  {!loading && cases.map(ticket => <button type="button" key={ticket.case_id} onClick={() => setSelected(ticket)} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-100 px-3 py-3 text-left hover:bg-cyan-50/60 ${selected?.case_id === ticket.case_id ? 'bg-cyan-50' : ''}`} data-testid={`support-ticket-${ticket.case_id}`}>
                    <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{ticket.subject}</span><span className="mt-1 block truncate text-xs text-slate-500">{ticket.user_name || 'Guest'} · {ticket.user_email || 'No email'}</span><span className="mt-1 block font-mono text-[10px] text-slate-400">{ticket.case_id} · {ticket.category}</span></span>
                    <span className="text-right"><span className={`block rounded-full px-2 py-1 text-[10px] font-bold ${ticket.priority === 'urgent' || ticket.priority === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{ticket.priority || 'normal'}</span><span className="mt-1 block text-[10px] text-slate-500">{(ticket.status || 'open').replace('_', ' ')}</span></span>
                  </button>)}
                  {!loading && !cases.length && <p className="p-8 text-center text-sm text-slate-500">No matching tickets.</p>}
                </div>
              </div>
            </section>

            {selected && (
              <section className="min-w-0 border-t border-slate-200 pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0" data-testid="support-ticket-detail">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                  <div className="min-w-0"><button type="button" onClick={() => setSelected(null)} className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 xl:hidden"><ArrowLeft size={14} />Back to tickets</button><div className="font-mono text-xs text-cyan-700">{selected.case_id}</div><h2 className="mt-1 break-words font-display text-xl font-extrabold text-slate-900">{selected.subject}</h2><span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${selected.user_id ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{selected.user_id ? 'Registered user' : 'Guest / Unverified'}</span><dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm"><dt className="text-slate-500">Full name</dt><dd className="break-words text-slate-800">{selected.user_name || '—'}</dd><dt className="text-slate-500">Username</dt><dd className="break-words text-slate-800">{selected.username || '—'}</dd><dt className="text-slate-500">Email</dt><dd className="break-words text-slate-800">{selected.user_email || '—'}</dd><dt className="text-slate-500">User ID</dt><dd className="break-all font-mono text-xs text-slate-800">{selected.user_id ? `${selected.user_id}${selected.user_public_id ? ` (${selected.user_public_id})` : ''}` : '—'}</dd></dl></div>
                  <time className="inline-flex items-center gap-1 text-xs text-slate-500"><Clock3 size={14} />{when(selected.created_at)}</time>
                </div>
                <div className="grid gap-2 py-3 sm:grid-cols-3">
                  <label className="text-[11px] font-bold uppercase text-slate-500">Status<select value={selected.status || 'open'} onChange={e => runCaseAction(() => adminAPI.supportStatus(selected.case_id, e.target.value), 'Ticket status updated')} className="mt-1 block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-medium normal-case text-slate-800">{STATUS_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                  <label className="text-[11px] font-bold uppercase text-slate-500">Priority<select value={selected.priority || 'normal'} onChange={e => runCaseAction(() => adminAPI.supportPriority(selected.case_id, e.target.value), 'Priority updated')} className="mt-1 block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-medium normal-case text-slate-800">{PRIORITIES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label className="text-[11px] font-bold uppercase text-slate-500">Assigned<select value={selected.assigned_admin_id || ''} onChange={e => runCaseAction(() => adminAPI.supportAssign(selected.case_id, e.target.value || null), 'Ticket assignment updated')} className="mt-1 block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-medium normal-case text-slate-800"><option value="">Unassigned</option>{staff.map(person => <option key={person.user_id} value={person.user_id}>{person.name || person.email} ({person.role})</option>)}</select></label>
                </div>
                <div className="space-y-3 border-y border-slate-200 py-4">
                  <div><h3 className="mb-1 text-xs font-bold uppercase text-slate-500">Issue description</h3><p className="whitespace-pre-wrap break-words text-sm text-slate-800">{selected.description || selected.messages?.[0]?.body}</p></div>
                  {selected.ai_summary && <div><h3 className="mb-1 text-xs font-bold uppercase text-slate-500">AI conversation summary</h3><p className="whitespace-pre-wrap text-sm text-slate-700">{selected.ai_summary}</p></div>}
                  {!!selected.conversation_history?.length && <details><summary className="cursor-pointer text-xs font-bold text-cyan-800">View submitted AI conversation</summary><div className="mt-2 max-h-48 space-y-2 overflow-auto">{selected.conversation_history.map((item, index) => <div key={index} className="rounded-md bg-slate-50 p-2 text-xs"><b>{item.role === 'assistant' ? 'Assistant' : 'User'}</b><p className="mt-1 whitespace-pre-wrap">{item.content}</p></div>)}</div></details>}
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto py-4" aria-label="Full ticket conversation">{(selected.messages || []).map((message, index) => <article key={`${selected.case_id}-${index}`} className={`rounded-lg border p-3 ${message.author === 'admin' ? 'border-blue-100 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}><div className="mb-1 flex justify-between gap-2 text-[11px] text-slate-500"><span className="font-bold">{message.author === 'admin' ? message.author_name || 'Support' : message.author === 'user' ? selected.user_name || 'User' : 'AI Assistant'}</span><time>{when(message.at)}</time></div><p className="whitespace-pre-wrap break-words text-sm text-slate-800">{message.body}</p></article>)}</div>
                <form onSubmit={sendReply} className="flex gap-2 border-t border-slate-200 pt-3"><textarea value={reply} onChange={e => setReply(e.target.value)} required maxLength={5000} rows={2} placeholder="Reply to the user…" className="min-w-0 flex-1 rounded-lg border border-slate-200 p-3 text-sm" /><button type="submit" disabled={!reply.trim()} aria-label="Send reply" title="Send reply" className="grid h-10 w-10 shrink-0 place-items-center self-end rounded-lg bg-cyan-700 text-white disabled:opacity-40"><Send size={17} /></button></form>
                <section className="mt-3 space-y-2" aria-label="Smart reply suggestions" data-testid="support-suggestions">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => loadSuggestions(sugg ? suggAttempt + 1 : 0)} disabled={suggBusy} className="inline-flex h-8 items-center gap-1 rounded-md border border-cyan-300 px-3 text-xs font-bold text-cyan-800 disabled:opacity-50" data-testid="suggest-generate"><Sparkles size={14} />{suggBusy ? 'Generating…' : sugg ? 'Regenerate' : 'Suggest replies'}</button>
                    {MANUAL_TEMPLATES.map(([label, text]) => <button key={label} type="button" onClick={() => setReply(text)} className="h-8 rounded-md border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50">Template: {label}</button>)}
                  </div>
                  {sugg && <p className="text-[11px] text-slate-500">{sugg.has_verified_data ? `Based on verified data: ${sugg.verified_data_used.join(', ')}. Review before sending.` : 'No verified account data was available, so these are guidance suggestions, not confirmed fixes.'} Nothing is sent until you press Send.</p>}
                  {sugg?.suggestions.map(s => <article key={s.id} className="rounded-lg border border-slate-200 bg-white p-3" data-testid={`suggestion-${s.tone}`}>
                    <div className="mb-1 flex items-center justify-between gap-2"><b className="text-xs text-slate-700">{s.label}</b><span className={`rounded px-2 py-0.5 text-[10px] font-bold ${s.basis === 'verified_data' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{s.basis === 'verified_data' ? 'Uses verified data' : 'Guidance only'}</span></div>
                    {editingSugg === s.id ? <textarea value={s.text} onChange={e => updateSuggText(s.id, e.target.value)} rows={8} maxLength={5000} className="w-full rounded-md border border-slate-200 p-2 text-sm" /> : <p className="whitespace-pre-wrap text-sm text-slate-800">{s.text}</p>}
                    <div className="mt-2 flex gap-2"><button type="button" onClick={() => { setReply(s.text); toast({ title: 'Reply copied to the box. Review it, then press Send.' }); }} className="h-8 rounded-md bg-cyan-700 px-3 text-xs font-bold text-white">Use This Reply</button><button type="button" onClick={() => setEditingSugg(editingSugg === s.id ? null : s.id)} className="h-8 rounded-md border border-slate-200 px-3 text-xs">{editingSugg === s.id ? 'Done' : 'Edit'}</button></div>
                  </article>)}
                </section>
                <form onSubmit={addNote} className="mt-3 flex gap-2"><textarea value={note} onChange={e => setNote(e.target.value)} required maxLength={3000} rows={2} placeholder="Internal note (not visible to user)" className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-amber-50/40 p-3 text-sm" /><button type="submit" disabled={!note.trim()} aria-label="Add internal note" title="Add internal note" className="grid h-10 w-10 shrink-0 place-items-center self-end rounded-lg border border-amber-300 text-amber-800 disabled:opacity-40"><Plus size={17} /></button></form>
                {!!selected.internal_notes?.length && <div className="mt-3 space-y-2">{selected.internal_notes.map((item, index) => <div key={index} className="rounded-md border border-amber-100 bg-amber-50 p-2 text-xs"><b>{item.author_name || 'Staff'} · {when(item.at)}</b><p className="mt-1 whitespace-pre-wrap">{item.note}</p></div>)}</div>}
              </section>
            )}
          </div>
        </>
      )}

      {tab === 'knowledge' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.4fr)]">
          <form onSubmit={saveKnowledge} className="h-fit space-y-4 border-b border-slate-200 pb-5 xl:border-b-0 xl:border-r xl:pr-6" data-testid="support-knowledge-form">
            <div><h2 className="font-display text-lg font-extrabold">{editingKnowledge ? 'Edit approved answer' : 'Add approved answer'}</h2><p className="mt-1 text-xs text-slate-500">The assistant can only use these approved answers to state Prize League policy.</p></div>
            <label className="block text-xs font-bold text-slate-600">Question or topic<input value={knowledgeForm.title} onChange={e => setKnowledgeForm(form => ({ ...form, title: e.target.value }))} required minLength={3} maxLength={160} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900" /></label>
            <label className="block text-xs font-bold text-slate-600">Approved answer<textarea value={knowledgeForm.answer} onChange={e => setKnowledgeForm(form => ({ ...form, answer: e.target.value }))} required minLength={10} maxLength={6000} rows={8} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal text-slate-900" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={knowledgeForm.active} onChange={e => setKnowledgeForm(form => ({ ...form, active: e.target.checked }))} />Active in AI answers</label>
            <div className="flex gap-2"><button type="submit" disabled={knowledgeBusy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white"><Save size={15} />{knowledgeBusy ? 'Saving…' : 'Save answer'}</button>{editingKnowledge && <button type="button" onClick={() => startKnowledgeEdit(null)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm">Cancel</button>}</div>
          </form>
          <section className="min-w-0" data-testid="support-knowledge-list"><h2 className="mb-3 flex items-center gap-2 font-display text-lg font-extrabold"><BookOpen size={18} />Approved answers <span className="text-sm font-normal text-slate-500">{knowledge.length}</span></h2><div className="divide-y divide-slate-200">{knowledge.map(item => <article key={item.knowledge_id} className="py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{item.title}</h3><span className={`rounded px-2 py-0.5 text-[10px] font-bold ${item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{item.active ? 'Active' : 'Inactive'}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{item.answer}</p></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => startKnowledgeEdit(item)} aria-label={`Edit ${item.title}`} title="Edit answer" className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Save size={15} /></button><button type="button" onClick={() => removeKnowledge(item.knowledge_id)} aria-label={`Delete ${item.title}`} title="Delete answer" className="rounded-md border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button></div></div></article>)}{!knowledge.length && <p className="py-10 text-center text-sm text-slate-500">No approved answers yet.</p>}</div></section>
        </div>
      )}
    </div>
  );
}
