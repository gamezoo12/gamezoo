import { Fragment, useCallback, useEffect, useState } from 'react';
import { RefreshCw, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { signupChallengeAdminAPI } from '../../../lib/api';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { errText } from './ChallengeEditor';

const STATUSES = ['', 'eligible', 'started', 'in_progress', 'completed', 'forfeited', 'expired'];
const uk = (d) => (d ? new Date(d).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '-');

export function ParticipantsPanel({ challengeId }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [email, setEmail] = useState('');
  const [open, setOpen] = useState(null);
  const load = useCallback(() => signupChallengeAdminAPI.participants(challengeId, { status: status || undefined, q: q || undefined }).then(setData).catch((e) => toast.error(errText(e))), [challengeId, status, q]);
  useEffect(() => { load(); }, [load]);
  const assign = async () => {
    try { await signupChallengeAdminAPI.assign(challengeId, email); toast.success('Challenge assigned'); setEmail(''); load(); } catch (e) { toast.error(errText(e)); }
  };
  return (
    <div className="space-y-4" data-testid="sc-admin-participants">
      <div className="flex flex-wrap items-end gap-2">
        <Input className="max-w-xs" placeholder="Search name, email, ID" value={q} onChange={(e) => setQ(e.target.value)} data-testid="sc-admin-part-search" />
        <select className="h-10 rounded-md border px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="sc-admin-part-status">
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
        <Button variant="outline" onClick={load} data-testid="sc-admin-part-refresh"><RefreshCw className="h-4 w-4" /></Button>
        <div className="ml-auto flex gap-2">
          <Input className="w-64" placeholder="Assign to existing user (email)" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="sc-admin-assign-email" />
          <Button onClick={assign} disabled={!email} data-testid="sc-admin-assign"><UserPlus className="mr-1 h-4 w-4" />Assign</Button>
        </div>
      </div>
      {data?.note && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{data.note} Winners: {data.winner_count}. {data.prize_distribution?.map((t) => `#${t.rank} ${t.prize}`).join(' · ')}</p>}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{['Rank', 'Player', 'Status', 'Attempts', 'Best time (score)', 'Joined', ''].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>
            {(data?.participants || []).map((p) => (
              <Fragment key={p.participation_id}>
                <tr className="border-t" data-testid={`sc-admin-part-row-${p.participation_id}`}>
                  <td className="px-3 py-2 font-bold">{p.provisional_rank ? `#${p.provisional_rank}` : '-'}</td>
                  <td className="px-3 py-2"><div className="font-semibold">{p.name || p.display_name}{p.excluded && <span className="ml-1 rounded bg-slate-200 px-1 text-[10px]">staff/test</span>}</div><div className="text-xs text-slate-500">{p.email} · {p.public_id} · {p.country}</div></td>
                  <td className="px-3 py-2">{p.status}</td>
                  <td className="px-3 py-2">{p.attempts_finished}/{p.attempts_used}</td>
                  <td className="px-3 py-2 font-bold">{p.best_score ? `${(p.best_score / 1000).toFixed(3)}s` : '-'}</td>
                  <td className="px-3 py-2 text-xs">{uk(p.created_at)}</td>
                  <td className="px-3 py-2"><Button size="sm" variant="ghost" onClick={() => setOpen(open === p.participation_id ? null : p.participation_id)} data-testid={`sc-admin-part-history-${p.participation_id}`}>History</Button></td>
                </tr>
                {open === p.participation_id && (
                  <tr className="bg-slate-50"><td colSpan={7} className="px-3 py-2 text-xs">
                    {p.attempts.length ? p.attempts.map((a) => <div key={a.attempt_id}>Attempt {a.attempt_no}: {a.status} · time {a.score ? `${(a.score / 1000).toFixed(3)}s` : '-'} · {a.correct ?? '-'}/{a.total ?? '-'} · started {uk(a.started_at)}{a.close_reason ? ` · ${a.close_reason}` : ''}</div>) : 'No real attempts yet.'}
                  </td></tr>
                )}
              </Fragment>
            ))}
            {data && !data.participants.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No participants yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const CARDS = [
  ['eligible_signups', 'Eligible signups'], ['impressions', 'Challenge impressions'], ['unique_viewers', 'Unique viewers'],
  ['demo_starts', 'Demo starts'], ['demo_completions', 'Demo completions'], ['real_starts', 'Real challenge starts'],
  ['all_attempts_completed', 'Completed all attempts'], ['close_clicks', 'Close (X) clicks'], ['forfeits', 'Confirmed forfeits'],
  ['avg_time_ms', 'Average time'], ['best_time_ms', 'Fastest time'], ['scored_attempts', 'Verified attempts'],
  ['scorecard_downloads', 'Scorecard downloads'], ['whatsapp_share_clicks', 'WhatsApp share clicks'], ['instagram_share_clicks', 'Instagram share clicks'],
  ['native_share_clicks', 'Native share sheet'], ['community_clicks', 'Community link clicks'], ['copy_link_clicks', 'Copy link / caption'],
  ['referral_visits', 'Referral link visits'], ['referral_signups', 'Signups from shared links'],
];

export function AnalyticsPanel({ challengeId }) {
  const [a, setA] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [source, setSource] = useState('');
  const load = useCallback(() => signupChallengeAdminAPI.analytics(challengeId, {
    from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined, source: source || undefined,
  }).then(setA).catch((e) => toast.error(errText(e))), [challengeId, from, to, source]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-4" data-testid="sc-admin-analytics">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="sc-admin-an-from" /></label>
        <label className="text-xs">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="sc-admin-an-to" /></label>
        <label className="text-xs">Signup source
          <select className="block h-10 rounded-md border px-3 text-sm" value={source} onChange={(e) => setSource(e.target.value)} data-testid="sc-admin-an-source">
            <option value="">All sources</option>{(a?.sources || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <span className="ml-auto text-xs text-slate-500">Game: {a?.game_id}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        {CARDS.map(([k, label]) => <div key={k} className="rounded-xl border bg-white p-3" data-testid={`sc-admin-an-${k}`}><p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p><p className="text-2xl font-black">{a ? (k.endsWith('_ms') ? (a[k] ? `${(a[k] / 1000).toFixed(3)}s` : '-') : (a[k] ?? 0).toLocaleString('en-GB')) : '…'}</p></div>)}
      </div>
      <div className="rounded-xl border p-3 text-sm" data-testid="sc-admin-an-attempts">
        <p className="font-semibold">Attempt completions</p>
        <p className="text-slate-600">{a && Object.keys(a.attempt_completions || {}).length ? Object.entries(a.attempt_completions).sort().map(([n, c]) => `Attempt ${n}: ${c}`).join(' · ') : 'None yet'}</p>
        <p className="mt-1 text-slate-600">Statuses: {a ? Object.entries(a.status_counts || {}).map(([s, c]) => `${s} ${c}`).join(' · ') || '-' : ''}</p>
      </div>
      {a?.note && <p className="text-xs text-slate-500">{a.note}</p>}
    </div>
  );
}
