import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Trophy, Dice5, Hand, ShieldCheck, ScrollText, Lock, AlertTriangle } from 'lucide-react';

/**
 * Admin — Random-ticket Winner Selection.
 * Flow: pick contest → view paid tickets → draw or manual → preview → publish (locks).
 * Post-publish corrections require a 20+ char reason and are recorded in the audit log.
 */
export default function WinnerSelectionAdmin() {
  const { toast } = useToast();
  const [contests, setContests] = useState([]);
  const [selCid, setSelCid] = useState('');
  const [tickets, setTickets] = useState([]);
  const [audit, setAudit] = useState([]);
  const [ct, setCt] = useState(null);
  const [manualTn, setManualTn] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [correctTn, setCorrectTn] = useState('');
  const [correctReason, setCorrectReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { adminAPI.contests().then(cs => setContests(cs.filter(c => (c.entry_mode || 'skill_game') === 'random_tickets'))).catch(() => {}); }, []);

  const load = async (cid) => {
    if (!cid) return;
    setSelCid(cid);
    setCt(contests.find(c => c.contest_id === cid) || null);
    const [t, a] = await Promise.all([
      adminAPI.wsEligibleTickets(cid).catch(() => ({ tickets: [] })),
      adminAPI.wsAudit(cid).catch(() => ({ logs: [] })),
    ]);
    setTickets(t.tickets || []);
    setAudit(a.logs || []);
    // Reload the fresh contest doc (preview state may have changed)
    const cs = await adminAPI.contests();
    setCt(cs.find(c => c.contest_id === cid) || null);
    setContests(cs.filter(c => (c.entry_mode || 'skill_game') === 'random_tickets'));
  };

  const doDraw = async () => {
    if (!window.confirm('Run a random draw? This selects a preview winner — you still need to publish afterwards.')) return;
    setBusy(true);
    try { const r = await adminAPI.wsDraw(selCid); toast({ title: `Drew ticket #${r.winner_ticket_number}` }); await load(selCid); }
    catch (e) { toast({ title: 'Draw failed', description: e?.response?.data?.detail }); }
    finally { setBusy(false); }
  };

  const doManual = async () => {
    if (!manualTn || manualReason.length < 10) { toast({ title: 'Provide a ticket number + 10+ char reason' }); return; }
    setBusy(true);
    try { const r = await adminAPI.wsManual(selCid, parseInt(manualTn), manualReason); toast({ title: `Manual pick: #${r.winner_ticket_number}` }); setManualTn(''); setManualReason(''); await load(selCid); }
    catch (e) { toast({ title: 'Manual pick failed', description: e?.response?.data?.detail }); }
    finally { setBusy(false); }
  };

  const doPublish = async () => {
    if (!window.confirm('PUBLISH the winner? This is public and cannot be silently changed — corrections will require a reason and appear in the audit log.')) return;
    setBusy(true);
    try { await adminAPI.wsPublish(selCid); toast({ title: '🔒 Winner published + locked' }); await load(selCid); }
    catch (e) { toast({ title: 'Publish failed', description: e?.response?.data?.detail }); }
    finally { setBusy(false); }
  };

  const doCorrect = async () => {
    if (!correctTn || correctReason.length < 20) { toast({ title: 'Post-publish correction requires a ticket number + 20+ char reason' }); return; }
    if (!window.confirm('Post-publish correction? This will be visible in the audit log.')) return;
    setBusy(true);
    try { const r = await adminAPI.wsCorrect(selCid, parseInt(correctTn), correctReason); toast({ title: `Corrected: #${r.previous_ticket_number} → #${r.new_ticket_number}` }); setCorrectTn(''); setCorrectReason(''); await load(selCid); }
    catch (e) { toast({ title: 'Correction failed', description: e?.response?.data?.detail }); }
    finally { setBusy(false); }
  };

  const published = ct?.winner_published;
  const previewTn = ct?.preview_winning_ticket_number;

  return (
    <div className="space-y-6" data-testid="winner-selection-page">
      <div>
        <h2 className="font-display text-2xl font-extrabold flex items-center gap-2"><Trophy className="w-6 h-6 text-[#6C2BFF]" /> Winner Selection</h2>
        <p className="text-slate-500 text-sm mt-1">Random-ticket contests only. Full audit log kept. Publication locks the winner.</p>
      </div>

      <div>
        <label className="text-xs uppercase font-bold tracking-widest text-slate-500">Select contest</label>
        <select value={selCid} onChange={e => load(e.target.value)} data-testid="ws-contest-picker" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">— pick a random-ticket contest —</option>
          {contests.map(c => <option key={c.contest_id} value={c.contest_id}>{c.title} · {c.tickets_sold}/{c.tickets_total} sold {c.winner_published ? '· 🔒 published' : ''}</option>)}
        </select>
      </div>

      {ct && (
        <>
          {/* Preview / published card */}
          <div className={`rounded-2xl p-5 border ${published ? 'bg-emerald-50 border-emerald-200' : previewTn ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
            {published ? (
              <>
                <div className="flex items-center gap-2 text-emerald-800 font-bold"><Lock className="w-4 h-4" /> Winner published & locked</div>
                <div className="mt-2 text-sm">Ticket <b>#{ct.winning_ticket_number}</b> · method: {ct.winner_method} · user: {ct.winner_user_id}</div>
              </>
            ) : previewTn ? (
              <>
                <div className="flex items-center gap-2 text-amber-800 font-bold"><AlertTriangle className="w-4 h-4" /> Preview only — not yet public</div>
                <div className="mt-2 text-sm">Ticket <b>#{previewTn}</b> · method: {ct.preview_method}{ct.preview_reason ? ` · reason: "${ct.preview_reason}"` : ''}</div>
                <Button onClick={doPublish} disabled={busy} className="mt-3 pl-btn-gold" data-testid="ws-publish"><Lock className="w-4 h-4 mr-1" /> Publish + Lock winner</Button>
              </>
            ) : (
              <div className="text-slate-600 text-sm">No preview yet. Run a random draw or manual pick below.</div>
            )}
          </div>

          {!published && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 p-5">
                <div className="font-bold text-slate-900 flex items-center gap-2"><Dice5 className="w-5 h-5 text-[#6C2BFF]" /> Random draw</div>
                <p className="text-xs text-slate-500 mt-1">Cryptographically-secure random selection from all {tickets.length} paid tickets.</p>
                <Button onClick={doDraw} disabled={busy || tickets.length === 0} data-testid="ws-draw" className="mt-3 pl-btn-purple">Run random draw</Button>
              </div>
              <div className="rounded-2xl border border-slate-200 p-5">
                <div className="font-bold text-slate-900 flex items-center gap-2"><Hand className="w-5 h-5 text-[#6C2BFF]" /> Manual pick</div>
                <div className="grid gap-2 mt-2">
                  <Input placeholder="Ticket number" type="number" value={manualTn} onChange={e => setManualTn(e.target.value)} data-testid="ws-manual-tn" />
                  <Input placeholder="Reason (10+ chars, required)" value={manualReason} onChange={e => setManualReason(e.target.value)} data-testid="ws-manual-reason" />
                  <Button onClick={doManual} disabled={busy} className="bg-slate-900 text-white" data-testid="ws-manual-submit">Set manual winner</Button>
                </div>
              </div>
            </div>
          )}

          {published && (
            <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-5">
              <div className="font-bold text-rose-900 flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Post-publish correction</div>
              <p className="text-xs text-rose-700/70 mt-1">Only use if the published winner is genuinely wrong. This is publicly visible in the audit log.</p>
              <div className="grid gap-2 mt-3">
                <Input placeholder="New winning ticket number" type="number" value={correctTn} onChange={e => setCorrectTn(e.target.value)} />
                <Input placeholder="Reason (20+ chars, required)" value={correctReason} onChange={e => setCorrectReason(e.target.value)} />
                <Button onClick={doCorrect} disabled={busy} className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="ws-correct">Record correction</Button>
              </div>
            </div>
          )}

          {/* Ticket table */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 font-bold bg-slate-50">Paid tickets ({tickets.length})</div>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-white sticky top-0"><tr><th className="text-left px-3 py-2">#</th><th className="text-left px-3 py-2">User</th><th className="text-left px-3 py-2">Email</th></tr></thead>
                <tbody>
                  {tickets.map(t => (
                    <tr key={t.ticket_number} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono font-bold">#{String(t.ticket_number).padStart(4, '0')}</td>
                      <td className="px-3 py-2">{t.user_name}</td>
                      <td className="px-3 py-2 text-slate-500">{t.user_email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit log */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 font-bold bg-slate-50 flex items-center gap-2"><ScrollText className="w-4 h-4" /> Audit log ({audit.length})</div>
            <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {audit.length === 0 ? <li className="p-4 text-sm text-slate-400">No actions yet.</li> : audit.map((a, i) => (
                <li key={i} className="p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${a.action === 'publish' ? 'bg-emerald-100 text-emerald-800' : a.action === 'correct' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>{a.action}</span>
                    <span className="text-slate-500">{new Date(a.at).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-slate-700">Ticket #{a.ticket_number} · by {a.actor_email}{a.reason ? ` · "${a.reason}"` : ''}</div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
