import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, History, ImagePlus, Pencil, Trophy } from 'lucide-react';
import { adminAPI, drawStudioAPI, paidWinnersAPI } from '../../lib/api';
import { COMPETITION_SECTIONS, competitionSectionOf } from '../../lib/competitionSections';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import PaidWinnersPublishing from '../../components/production/PaidWinnersPublishing';

const errText = (e) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg).join('; ') : 'Request failed'; };
const money = (v) => `£${Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TYPE = { winnings: 'Winnings Tokens', bonus: 'Bonus Tokens', winning_bonus: 'Winning Bonus Tokens', topup: 'Top-Up Tokens', other: 'Other prize' };
const BADGE = { pending: 'bg-amber-400/15 text-amber-200', approved: 'bg-sky-400/15 text-sky-200', credited: 'bg-emerald-400/15 text-emerald-200', rejected: 'bg-rose-400/15 text-rose-200' };
const field = 'mt-1 h-10 w-full rounded-lg border border-white/15 bg-[#0b0724] px-3 text-sm text-white';
const pill = (on) => `rounded-full px-4 py-2 text-sm font-black capitalize transition-colors ${on ? 'bg-amber-400 text-[#1a1033]' : 'bg-white/5 text-white/70 hover:bg-white/10'}`;

export function EditDialog({ winner, onClose, onSaved }) {
  const [form, setForm] = useState({ prize_amount: winner.prize_amount, reward_type: ['bonus', 'winning_bonus'].includes(winner.reward_type) ? winner.reward_type : 'winnings', reason: '' });
  const [err, setErr] = useState('');
  const save = async () => {
    try {
      const payload = { ...form, prize_amount: Number(form.prize_amount) };
      if (winner.kind === 'draw' && winner.source === 'draw_studio') await drawStudioAPI.editWinner(winner.winner_id, payload);
      else await paidWinnersAPI.adjustWinnerPrize(winner.winner_id, payload);
      onSaved();
    } catch (e) { setErr(errText(e)); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-white/10 bg-[#120c33] text-white" data-testid="winner-edit-dialog">
        <DialogHeader><DialogTitle>Edit proposed reward · ticket #{winner.ticket_number}</DialogTitle></DialogHeader>
        <p className="text-xs text-indigo-200/70">The winning ticket and winner are fixed by the draw and can't be changed. Changes are checked against the approved prize budget.</p>
        <label className="text-xs text-indigo-200/80">Reward amount (£ / tokens)<input type="number" min="0.01" step="0.01" className={field} value={form.prize_amount} onChange={(e) => setForm({ ...form, prize_amount: e.target.value })} data-testid="winner-edit-amount" /></label>
        <label className="text-xs text-indigo-200/80">Reward type<select className={field} value={form.reward_type} onChange={(e) => setForm({ ...form, reward_type: e.target.value })} data-testid="winner-edit-type"><option value="winnings">Winnings Tokens</option><option value="winning_bonus">Winning Bonus Tokens</option><option value="bonus">Bonus Tokens</option></select></label>
        <label className="text-xs text-indigo-200/80">Reason (required)<textarea className={`${field} h-20 py-2`} maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} data-testid="winner-edit-reason" /></label>
        {err && <p className="text-sm text-rose-300" role="alert" data-testid="winner-edit-error">{err}</p>}
        <button type="button" disabled={form.reason.trim().length < 5} onClick={save} className="h-10 rounded-xl bg-amber-400 text-sm font-black text-[#1a1033] disabled:opacity-40" data-testid="winner-edit-save">Save change</button>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ winner, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { drawStudioAPI.winnerAudit(winner.winner_id).then((r) => setRows(r.audit)).catch(() => setRows([])); }, [winner.winner_id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto border-white/10 bg-[#120c33] text-white" data-testid="winner-history-dialog">
        <DialogHeader><DialogTitle>Audit trail · ticket #{winner.ticket_number}</DialogTitle></DialogHeader>
        {(winner.edit_history || []).map((h, i) => <div key={i} className="rounded-lg bg-white/5 p-2 text-xs"><b>{new Date(h.at).toLocaleString('en-GB')}</b> · {h.by}<br />{money(h.from.prize_amount)} {TYPE[h.from.reward_type]} → {money(h.to.prize_amount)} {TYPE[h.to.reward_type]}<br /><i>“{h.reason}”</i></div>)}
        {rows?.map((r) => <div key={r.audit_id} className="text-xs text-indigo-100">{new Date(r.at).toLocaleString('en-GB')} · <b>{r.action.replace('_', ' ')}</b> · {r.actor_email}</div>)}
        {rows && !rows.length && !(winner.edit_history || []).length && <p className="text-xs text-indigo-200/60">No changes recorded yet.</p>}
      </DialogContent>
    </Dialog>
  );
}

function WalletCell({ w, wallet, setWallet }) {
  if (w.status === 'credited') return w.reward_type === 'other'
    ? <span>Fulfilled: {w.other_prize_description || 'Other prize'}</span>
    : TYPE[w.credited_wallet || w.reward_type] || w.reward_type;
  if (w.reward_type === 'other') return <div><div>Other prize</div><div className="text-[10px] text-indigo-200/60">{w.other_prize_description}</div></div>;
  return (
    <>
      <select value={wallet} onChange={(e) => setWallet(e.target.value)} className="h-8 rounded-lg border border-white/15 bg-[#0b0724] px-2 text-xs" data-testid={`winner-wallet-${w.winner_id}`}>
        {Object.entries(TYPE).filter(([key]) => key !== 'other').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {w.kind === 'leaderboard' && Number(w.prize_bonus_tokens) > 0 && <div className="text-[10px] text-indigo-200/60">+ {w.prize_bonus_tokens} Winning Bonus</div>}
    </>
  );
}

function WinnerPhotoDialog({ winner, onClose, onSaved }) {
  const [imageUrl, setImageUrl] = useState(winner.winner_image_url || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setError('');
    try { const result = await adminAPI.uploadHomepageImage(file); setImageUrl(result.url || ''); }
    catch (e) { setError(errText(e)); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError('');
    try { await paidWinnersAPI.setWinnerPhoto(winner.winner_id, imageUrl.trim()); onSaved(); }
    catch (e) { setError(errText(e)); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-white/10 bg-[#120c33] text-white" data-testid="winner-photo-dialog">
        <DialogHeader><DialogTitle>Winner photo · {winner.user_full_name || winner.user_name}</DialogTitle></DialogHeader>
        <p className="text-xs text-indigo-200/70">Upload the final winner image or leave it empty for the automatic placeholder.</p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 p-3 text-sm font-bold text-indigo-100">
          <ImagePlus className="h-4 w-4" /> {busy ? 'Uploading...' : imageUrl ? 'Replace image' : 'Upload winner image'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={upload} data-testid="winner-photo-file" />
        </label>
        {imageUrl && <img src={imageUrl} alt="Winner preview" className="max-h-48 w-full object-contain bg-black/20" />}
        <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="Or paste https://... /api/uploads/..." className={field} data-testid="winner-photo-url" />
        {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
        <button type="button" disabled={busy} onClick={save} className="h-10 rounded-lg bg-amber-400 text-sm font-black text-[#1a1033] disabled:opacity-40">{busy ? 'Saving...' : 'Save photo'}</button>
      </DialogContent>
    </Dialog>
  );
}

function WinnerRow({ w, onEdit, onHistory, onPhoto, onApprove, onVisible, onReject, busy }) {
  const studio = w.kind === 'draw';
  const [wallet, setWallet] = useState(w.reward_type === 'other' ? 'other' : 'winnings');
  return (
    <tr className="border-t border-white/5 text-sm" data-testid={`winner-row-${w.winner_id}`}>
      <td className="px-3 py-3"><div className="font-bold text-white">{w.contest_title || w.contest_id}</div><div className="text-[11px] text-indigo-200/60"><b className={studio ? 'text-fuchsia-300' : 'text-sky-300'}>{studio ? 'Draw' : 'Leaderboard'}</b> · {studio ? `Round ${Number(w.draw_round_index) + 1} · ${w.draw_round_name}` : w.prize_title}</div></td>
      <td className="px-3 py-3 font-black text-amber-300">#{w.ticket_number}</td>
      <td className="px-3 py-3"><div className="text-white">{w.user_full_name || w.user_name}</div><div className="text-[11px] text-indigo-200/60">@{w.username || '—'} · {w.user_id}</div></td>
      <td className="px-3 py-3 font-bold text-white" data-testid={`winner-amount-${w.winner_id}`}>{w.reward_type === 'other' ? <div>{w.other_prize_description}<div className="text-[10px] text-indigo-200/60">Estimated value {money(w.prize_amount)}</div></div> : money(w.prize_amount)}</td>
      <td className="px-3 py-3 text-indigo-100" data-testid={`winner-type-${w.winner_id}`}><WalletCell w={w} wallet={wallet} setWallet={setWallet} /></td>
      <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black capitalize ${BADGE[w.status]}`} data-testid={`winner-status-${w.winner_id}`}>{w.status}</span></td>
      <td className="px-3 py-3"><div className="flex justify-end gap-1">
        {w.status !== 'credited' && w.status !== 'rejected' && w.reward_type !== 'other' && <button type="button" onClick={() => onEdit(w)} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Adjust winning prize" data-testid={`winner-edit-${w.winner_id}`}><Pencil className="h-4 w-4" /></button>}
        {studio && <button type="button" onClick={() => onHistory(w)} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Audit trail" data-testid={`winner-history-${w.winner_id}`}><History className="h-4 w-4" /></button>}
        <button type="button" onClick={() => onPhoto(w)} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Edit winner photo" data-testid={`winner-photo-${w.winner_id}`}><ImagePlus className="h-4 w-4" /></button>
        <button type="button" onClick={() => onVisible(w)} className="rounded-full bg-white/10 p-2 hover:bg-white/20" title={w.public_visible ? 'Shown on public Winners page once published' : 'Hidden from public Winners page'} aria-label="Toggle public visibility" data-testid={`winner-visible-${w.winner_id}`}>{w.public_visible ? <Eye className="h-4 w-4 text-emerald-300" /> : <EyeOff className="h-4 w-4 text-rose-300" />}</button>
        {studio && w.status === 'pending' && <button type="button" disabled={busy} onClick={() => onReject(w)} className="rounded-full border border-rose-400/50 px-3 py-1.5 text-xs font-black text-rose-200 disabled:opacity-40" data-testid={`winner-reject-${w.winner_id}`}>Reject</button>}
        {!['credited', 'rejected'].includes(w.status) && <button type="button" disabled={busy} onClick={() => onApprove(w, wallet)} className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-black text-[#04210f] disabled:opacity-40" data-testid={`winner-approve-${w.winner_id}`}><CheckCircle2 className="h-3.5 w-3.5" />{wallet === 'other' ? 'Mark fulfilled' : w.status === 'approved' ? 'Finish credit' : 'Approve & credit'}</button>}
      </div></td>
    </tr>
  );
}

function Approvals() {
  const [kind, setKind] = useState('all');
  const [activeSection, setActiveSection] = useState('mega');
  const [activeContest, setActiveContest] = useState('');
  const [tab, setTab] = useState('all');
  const [data, setData] = useState({ winners: [], counts: {} });
  const [edit, setEdit] = useState(null);
  const [hist, setHist] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(['', '']);
  const load = useCallback(() => paidWinnersAPI.winners({ status: 'all', kind }).then(setData).catch((e) => setMsg([errText(e), ''])), [kind]);
  useEffect(() => { load(); }, [load]);

  const completed = (data.winners || []).filter(winner => ['closed', 'drawn', 'archived', 'closed_no_entries'].includes(winner.contest_status));
  const sectionWinners = completed.filter(winner => competitionSectionOf({ category: winner.contest_category }) === activeSection);
  const contests = [...new Map(sectionWinners.map(winner => [winner.contest_id, {
    contest_id: winner.contest_id,
    title: winner.contest_title || winner.contest_id,
    image: winner.contest_image,
    status: winner.contest_status,
  }])).values()].sort((a, b) => a.title.localeCompare(b.title));
  useEffect(() => {
    if (!contests.some(contest => contest.contest_id === activeContest)) setActiveContest(contests[0]?.contest_id || '');
  }, [activeSection, activeContest, data.winners]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibleWinners = sectionWinners.filter(winner => (!activeContest || winner.contest_id === activeContest) && (tab === 'all' || winner.status === tab));

  const approve = async (w, wallet) => {
    const recipient = w.user_full_name || w.user_name;
    const confirmText = wallet === 'other'
      ? `Confirm that “${w.other_prize_description || 'Other prize'}” has been arranged for ${recipient}? This will mark the prize fulfilled without a wallet credit.`
      : `Approve and credit ${money(w.prize_amount)} as ${TYPE[wallet]} to ${recipient}? This is credited once and cannot be undone here.`;
    if (!window.confirm(confirmText)) return;
    setBusy(true); setMsg(['', '']);
    try {
      await paidWinnersAPI.approve(w.winner_id, wallet);
      setMsg(['', wallet === 'other' ? `Marked “${w.other_prize_description || 'Other prize'}” fulfilled for ${recipient}.` : `Credited ${money(w.prize_amount)} ${TYPE[wallet]} to ${recipient}.`]);
      await load();
    } catch (e) { setMsg([errText(e), '']); } finally { setBusy(false); }
  };
  const reject = async (w) => {
    if (!window.confirm(`Reject this draw result for ${w.user_full_name || w.user_name}? It will never be credited or published.`)) return;
    setBusy(true); setMsg(['', '']);
    try { await paidWinnersAPI.reject(w.winner_id); setMsg(['', 'Result rejected.']); await load(); }
    catch (e) { setMsg([errText(e), '']); } finally { setBusy(false); }
  };
  const setVisible = async (w) => {
    try { await paidWinnersAPI.setWinnerVisible(w.winner_id, !w.public_visible); setMsg(['', w.public_visible ? 'Winner hidden from the public Winners page.' : 'Winner shown on the public Winners page.']); await load(); } catch (e) { setMsg([errText(e), '']); }
  };

  return (
    <>
      <div className="mt-4 grid grid-cols-4 overflow-hidden border border-white/15" data-testid="admin-winner-section-tabs">
        {COMPETITION_SECTIONS.map(section => (
          <button key={section.key} type="button" onClick={() => { setActiveSection(section.key); setActiveContest(''); }} className={`min-w-0 px-1 py-3 text-[10px] font-black uppercase sm:text-sm ${activeSection === section.key ? 'bg-amber-400 text-[#1a1033]' : 'bg-white/5 text-white/60'}`} data-testid={`admin-winner-section-${section.key}`}>
            {section.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[['all', 'All winners'], ['draw', 'Draw winners'], ['leaderboard', 'Skill winners']].map(([k, l]) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${kind === k ? 'bg-white text-[#1a1033]' : 'bg-white/5 text-white/60'}`} data-testid={`winners-kind-${k}`}>{l}</button>)}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="completed-contest-list">
        {contests.map(contest => <button key={contest.contest_id} type="button" onClick={() => setActiveContest(contest.contest_id)} className={`flex min-h-16 items-center gap-2 overflow-hidden border p-2 text-left ${activeContest === contest.contest_id ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/5'}`}>
          {contest.image ? <img src={contest.image} alt="" className="h-12 w-16 shrink-0 object-cover" /> : <div className="h-12 w-16 shrink-0 bg-white/5" />}
          <span className="min-w-0"><span className="block truncate text-xs font-black text-white">{contest.title}</span><span className="text-[10px] uppercase text-indigo-200/60">{contest.status} · {sectionWinners.filter(w => w.contest_id === contest.contest_id).length} winners</span></span>
        </button>)}
      </div>
      {!contests.length && <div className="mt-3 border border-white/10 bg-white/5 p-5 text-center text-sm text-indigo-200/60">No completed {COMPETITION_SECTIONS.find(section => section.key === activeSection)?.label || 'contest'} competitions yet.</div>}
      <div className="mt-3 flex flex-wrap gap-2" role="tablist">
        {['all', 'pending', 'approved', 'credited'].map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={pill(tab === k)} data-testid={`winners-tab-${k}`}>{k}</button>)}
      </div>
      {msg[0] && <div role="alert" className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200" data-testid="winners-error">{msg[0]}</div>}
      {msg[1] && <div role="status" className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-200" data-testid="winners-notice">{msg[1]}</div>}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full min-w-[960px] text-left">
          <thead className="text-[10px] font-black uppercase tracking-wider text-indigo-200/60"><tr>{['Contest & round', 'Ticket', 'Winner', 'Amount', 'Wallet', 'Status', ''].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
          <tbody>{visibleWinners.map((w) => <WinnerRow key={w.winner_id} w={w} busy={busy} onEdit={setEdit} onHistory={setHist} onPhoto={setPhoto} onApprove={approve} onReject={reject} onVisible={setVisible} />)}</tbody>
        </table>
        {!visibleWinners.length && <p className="py-14 text-center text-sm text-indigo-200/60" data-testid="winners-empty">No winners in this completed contest.</p>}
      </div>
      {edit && <EditDialog winner={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setMsg(['', 'Reward updated. The change and reason were added to the audit trail.']); load(); }} />}
      {hist && <HistoryDialog winner={hist} onClose={() => setHist(null)} />}
      {photo && <WinnerPhotoDialog winner={photo} onClose={() => setPhoto(null)} onSaved={() => { setPhoto(null); setMsg(['', 'Winner photo updated.']); load(); }} />}
    </>
  );
}

export default function WinnersApprovals() {
  const [section, setSection] = useState('approvals');
  return (
    <div className="-m-4 min-h-screen bg-[#07041a] p-4 pb-32 text-white sm:-m-6 sm:p-8 sm:pb-32" data-testid="winners-approvals-page">
      <h1 className="flex items-center gap-3 text-4xl font-black tracking-tight"><Trophy className="h-9 w-9 text-amber-300" />Winners &amp; Approvals</h1>
      <p className="mt-2 max-w-2xl text-sm text-indigo-200/70">Paid World leaderboard and draw winners only. Check each reward, choose the wallet (Winnings by default), then approve to credit it exactly once. Use Publish to control what the public Winners page shows.</p>
      <div className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-4">
        {[['approvals', 'Approvals'], ['publish', 'Publish to Winners page']].map(([k, l]) => <button key={k} type="button" onClick={() => setSection(k)} className={pill(section === k)} data-testid={`winners-section-${k}`}>{l}</button>)}
      </div>
      {section === 'publish' ? <PaidWinnersPublishing /> : <Approvals />}
    </div>
  );
}
