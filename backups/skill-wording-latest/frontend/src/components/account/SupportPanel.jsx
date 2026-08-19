import { useEffect, useState } from 'react';
import { supportAPI } from '../../lib/api';
import { MessageCircle, Plus, Send, ChevronLeft, Clock, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { useToast } from '../../hooks/use-toast';

const CATEGORIES = [
  { id: 'account',  label: 'Account issue' },
  { id: 'payment',  label: 'Payment / Wallet' },
  { id: 'ticket',   label: 'Ticket / Draw' },
  { id: 'game',     label: 'Game / Score' },
  { id: 'kyc',      label: 'KYC / Verification' },
  { id: 'other',    label: 'Other' },
];

const STATUS_TONE = {
  open:            'bg-emerald-100 text-emerald-700',
  awaiting_user:   'bg-amber-100  text-amber-800',
  closed:          'bg-slate-200  text-slate-600',
};

export default function SupportPanel() {
  const [cases, setCases] = useState([]);
  const [view, setView] = useState('list');  // list | new | detail
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ category: 'account', subject: '', message: '' });
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = () => supportAPI.mine().then(r => setCases(r.cases || [])).catch(() => setCases([]));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (form.subject.length < 3 || form.message.length < 10) {
      return toast({ title: 'Add a longer subject + message (min 10 chars).' });
    }
    setBusy(true);
    try {
      const r = await supportAPI.create(form);
      toast({ title: 'Case created', description: `We'll reply as soon as possible. Ref: ${r.case_id}` });
      setForm({ category: 'account', subject: '', message: '' });
      setView('list');
      await load();
    } catch (err) {
      toast({ title: 'Could not create case', description: err?.response?.data?.detail || 'Try again.' });
    } finally { setBusy(false); }
  };

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await supportAPI.reply(selected.case_id, reply);
      setReply('');
      const r = await supportAPI.mine();
      setCases(r.cases || []);
      setSelected(r.cases.find(c => c.case_id === selected.case_id));
      toast({ title: 'Reply sent' });
    } catch (err) {
      toast({ title: 'Reply failed', description: err?.response?.data?.detail || 'Try again.' });
    } finally { setBusy(false); }
  };

  const openCase = (c) => { setSelected(c); setView('detail'); };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 md:p-6" data-testid="support-panel">
      {view === 'list' && (
        <>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-[#6C2BFF]" />
              <h3 className="font-display font-bold text-lg">Support cases</h3>
            </div>
            <Button data-testid="support-new-btn" onClick={() => setView('new')} className="pl-btn-purple text-white">
              <Plus className="w-4 h-4 mr-1" /> New case
            </Button>
          </div>
          {cases.length === 0 ? (
            <div className="py-10 text-center">
              <MessageCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">You haven&apos;t opened any support cases yet.</p>
              <Button data-testid="support-empty-new" onClick={() => setView('new')} className="mt-4 pl-btn-gold text-slate-900">Open your first case</Button>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100" data-testid="support-list">
              {cases.map(c => (
                <li key={c.case_id}>
                  <button onClick={() => openCase(c)} className="w-full py-3 flex items-center justify-between gap-3 hover:bg-slate-50 -mx-2 px-2 rounded text-left" data-testid={`case-${c.case_id}`}>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{c.subject}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {CATEGORIES.find(x => x.id === c.category)?.label || c.category} · {new Date(c.updated_at || c.created_at).toLocaleDateString('en-GB')} · {c.messages?.length || 0} message{c.messages?.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${STATUS_TONE[c.status] || STATUS_TONE.open}`}>{(c.status || 'open').replace('_', ' ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {view === 'new' && (
        <form onSubmit={create} className="space-y-3" data-testid="support-new-form">
          <button type="button" onClick={() => setView('list')} className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Back</button>
          <h3 className="font-display font-extrabold text-xl text-slate-900">Open a support case</h3>
          <div>
            <Label className="mb-1 block">Category</Label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    data-testid="support-category" className="w-full h-10 rounded-md border border-slate-200 px-3">
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="mb-1 block">Subject</Label>
            <Input data-testid="support-subject" required value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Brief title" />
          </div>
          <div>
            <Label className="mb-1 block">Message</Label>
            <Textarea data-testid="support-message" required minLength={10} rows={6} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Include order IDs, ticket numbers, or screenshots via a link…" />
          </div>
          <Button type="submit" disabled={busy} data-testid="support-submit" className="pl-btn-gold text-slate-900 font-extrabold">
            {busy ? 'Sending…' : 'Submit case'}
          </Button>
        </form>
      )}

      {view === 'detail' && selected && (
        <div data-testid="support-detail">
          <button type="button" onClick={() => { setView('list'); load(); }} className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 mb-2"><ChevronLeft className="w-3 h-3" /> Back to cases</button>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <h3 className="font-display font-extrabold text-xl text-slate-900 min-w-0 break-words">{selected.subject}</h3>
            <span className={`text-xs px-2 py-1 rounded-full ${STATUS_TONE[selected.status] || STATUS_TONE.open}`}>{(selected.status || 'open').replace('_', ' ')}</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">Ref: <span className="font-mono">{selected.case_id}</span> · {CATEGORIES.find(x => x.id === selected.category)?.label}</p>
          <div className="space-y-3">
            {(selected.messages || []).map((m, idx) => (
              <div key={`${selected.case_id}-${idx}`} className={`p-3 rounded-lg ${m.author === 'admin' ? 'bg-[#6C2BFF]/5 border border-[#6C2BFF]/20' : 'bg-slate-50 border border-slate-100'}`}>
                <div className="flex items-center gap-2 mb-1 text-xs text-slate-500">
                  {m.author === 'admin' ? <Check className="w-3 h-3 text-[#6C2BFF]" /> : <Clock className="w-3 h-3" />}
                  <span className="font-semibold">{m.author === 'admin' ? 'Support Team' : 'You'}</span>
                  <span>· {new Date(m.at).toLocaleString('en-GB')}</span>
                </div>
                <div className="text-sm text-slate-800 whitespace-pre-wrap break-words">{m.body}</div>
              </div>
            ))}
          </div>
          {selected.status !== 'closed' && (
            <form onSubmit={send} className="mt-4 flex gap-2">
              <Textarea rows={2} value={reply} onChange={e => setReply(e.target.value)} placeholder="Add another message…" data-testid="support-reply-input" />
              <Button type="submit" disabled={busy || !reply.trim()} data-testid="support-reply-send" className="pl-btn-purple text-white">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
