import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useToast } from '../../hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import { Mailbox, Plus, ClipboardList } from 'lucide-react';

const STATUSES = [
  { key: 'all',           label: 'All',           colour: 'bg-slate-100 text-slate-700' },
  { key: 'received',      label: 'Received',      colour: 'bg-sky-100 text-sky-700' },
  { key: 'under_review',  label: 'Under review',  colour: 'bg-amber-100 text-amber-700' },
  { key: 'validated',     label: 'Validated',     colour: 'bg-emerald-100 text-emerald-700' },
  { key: 'rejected',      label: 'Rejected',      colour: 'bg-rose-100 text-rose-700' },
  { key: 'allocated',     label: 'Allocated',     colour: 'bg-indigo-100 text-indigo-700' },
  { key: 'duplicate',     label: 'Duplicate',     colour: 'bg-stone-100 text-stone-700' },
  { key: 'late_entry',    label: 'Late entry',    colour: 'bg-orange-100 text-orange-700' },
];

const StatusPill = ({ s }) => {
  const cfg = STATUSES.find(x => x.key === s) || STATUSES[0];
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cfg.colour}`}>{cfg.label}</span>;
};

export default function PostalEntriesAdmin() {
  const { toast } = useToast();
  const [entries, setEntries] = useState([]);
  const [counts, setCounts] = useState({});
  const [activeStatus, setActiveStatus] = useState('all');
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({});

  const refresh = () => {
    const params = activeStatus === 'all' ? {} : { params: { status: activeStatus } };
    api.get('/admin/postal-entries', params).then(r => {
      setEntries(r.data.entries || []);
      setCounts(r.data.counts || {});
    }).catch(() => {});
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [activeStatus]);

  const createEntry = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/admin/postal-entries', form);
      toast({ title: 'Postal entry logged' });
      setShowCreate(false);
      setForm({});
      refresh();
    } catch (err) {
      toast({ title: 'Failed', description: err?.response?.data?.detail });
    } finally { setCreating(false); }
  };

  const setStatus = async (entry, status, extra = {}) => {
    try {
      await api.put(`/admin/postal-entries/${entry.entry_id}`, { status, ...extra });
      toast({ title: `Marked ${status.replace('_', ' ')}` });
      const fresh = await api.get('/admin/postal-entries');
      setEntries(fresh.data.entries || []);
      setCounts(fresh.data.counts || {});
      setSelected(fresh.data.entries.find(x => x.entry_id === entry.entry_id) || null);
    } catch (err) {
      toast({ title: 'Failed', description: err?.response?.data?.detail });
    }
  };

  return (
    <div className="p-6" data-testid="postal-admin">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Mailbox className="w-5 h-5 text-indigo-600" />
          <h1 className="font-display font-extrabold text-2xl">Postal Entries</h1>
        </div>
        <Button onClick={() => setShowCreate(true)} className="pl-btn-purple text-white" data-testid="postal-new-btn">
          <Plus className="w-4 h-4 mr-1" /> Log received entry
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUSES.map(s => {
          const isActive = activeStatus === s.key;
          const n = s.key === 'all'
            ? Object.values(counts).reduce((a, b) => a + b, 0)
            : counts[s.key] || 0;
          return (
            <button
              key={s.key}
              onClick={() => setActiveStatus(s.key)}
              data-testid={`postal-tab-${s.key}`}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                isActive
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : `${s.colour} border-transparent hover:bg-white hover:border-slate-200`
              }`}
            >
              {s.label} <span className="ml-1 opacity-75">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {entries.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            No postal entries in this queue.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left p-3">Received</th>
                <th className="text-left p-3">Entrant</th>
                <th className="text-left p-3">Contest</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.entry_id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(e)}>
                  <td className="p-3 text-slate-500 whitespace-nowrap">{e.received_at ? new Date(e.received_at).toLocaleString('en-GB') : '—'}</td>
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">{e.entrant_name}</div>
                    <div className="text-xs text-slate-500">{e.entrant_email || e.entrant_public_id || '—'}</div>
                  </td>
                  <td className="p-3 text-slate-700">{e.contest_slug || '—'}</td>
                  <td className="p-3"><StatusPill s={e.status} /></td>
                  <td className="p-3 text-right"><span className="text-xs text-slate-400">Click to review</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail drawer / dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.entrant_name} · <StatusPill s={selected?.status} /></DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-500">Email:</span> {selected.entrant_email || '—'}</div>
                <div><span className="text-slate-500">Public ID:</span> {selected.entrant_public_id || '—'}</div>
                <div><span className="text-slate-500">Contest:</span> {selected.contest_slug || '—'}</div>
                <div><span className="text-slate-500">Envelope ref:</span> {selected.envelope_reference || '—'}</div>
                <div><span className="text-slate-500">Skill answer:</span> {selected.skill_answer || '—'}</div>
                <div><span className="text-slate-500">Postmarked:</span> {selected.postmark_date ? new Date(selected.postmark_date).toLocaleDateString('en-GB') : '—'}</div>
              </div>
              <div>
                <Label>Internal notes</Label>
                <textarea
                  className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                  rows={3}
                  defaultValue={selected.internal_notes || ''}
                  onBlur={e => setStatus(selected, selected.status, { internal_notes: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {['under_review', 'validated', 'rejected', 'allocated', 'duplicate', 'late_entry'].map(s => (
                  <Button key={s} size="sm" variant={selected.status === s ? 'default' : 'outline'} onClick={() => setStatus(selected, s)}>
                    Mark {s.replace('_', ' ')}
                  </Button>
                ))}
              </div>
              {selected.audit?.length > 0 && (
                <div className="pt-3 border-t">
                  <div className="text-xs font-bold uppercase text-slate-500 mb-1">Audit trail</div>
                  <ul className="text-xs space-y-1">
                    {selected.audit.map((a, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-slate-400">{new Date(a.at).toLocaleString('en-GB')}</span>
                        <span className="text-slate-700"><strong>{a.status || 'note'}</strong> by {a.reviewer}</span>
                        {a.note && <span className="text-slate-500">— {a.note}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log received postal entry</DialogTitle></DialogHeader>
          <form onSubmit={createEntry} className="space-y-2">
            <div>
              <Label>Entrant name</Label>
              <Input required value={form.entrant_name || ''} onChange={e => setForm(f => ({ ...f, entrant_name: e.target.value }))} data-testid="postal-form-name" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Email</Label><Input value={form.entrant_email || ''} onChange={e => setForm(f => ({ ...f, entrant_email: e.target.value }))} /></div>
              <div><Label>Public ID</Label><Input placeholder="PLxxxxx" value={form.entrant_public_id || ''} onChange={e => setForm(f => ({ ...f, entrant_public_id: e.target.value }))} /></div>
            </div>
            <div><Label>Contest slug</Label><Input value={form.contest_slug || ''} onChange={e => setForm(f => ({ ...f, contest_slug: e.target.value }))} /></div>
            <div><Label>Envelope reference / postmark</Label><Input value={form.envelope_reference || ''} onChange={e => setForm(f => ({ ...f, envelope_reference: e.target.value }))} /></div>
            <div><Label>Skill answer supplied</Label><Input value={form.skill_answer || ''} onChange={e => setForm(f => ({ ...f, skill_answer: e.target.value }))} /></div>
            <Button type="submit" className="w-full pl-btn-purple text-white mt-2" disabled={creating}>
              {creating ? 'Saving…' : 'Log entry'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
