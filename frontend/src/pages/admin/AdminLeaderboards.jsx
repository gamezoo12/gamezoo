import { useEffect, useMemo, useState } from 'react';
import { Clock3, RefreshCw, Save, Search, ShieldCheck, X } from 'lucide-react';
import { adminAPI } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const seconds = (milliseconds) => (Number(milliseconds || 0) / 1000).toFixed(2);

export default function AdminLeaderboards() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [world, setWorld] = useState('paid');
  const [sources, setSources] = useState({ paid_contests: [], free_world_contests: [] });
  const [contestId, setContestId] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [search, setSearch] = useState('');
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState('');
  const [durationSeconds, setDurationSeconds] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminAPI.leaderboardContests()
      .then((data) => {
        if (cancelled) return;
        const nextSources = {
          paid_contests: data.paid_contests || [],
          free_world_contests: data.free_world_contests || [],
        };
        setSources(nextSources);
        const first = world === 'paid'
          ? nextSources.paid_contests[0]?.contest_id
          : nextSources.free_world_contests[0]?.contest_number;
        setContestId((current) => current || String(first || ''));
      })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.detail || 'Could not load contests.'); })
      .finally(() => { if (!cancelled) setLoadingSources(false); });
    return () => { cancelled = true; };
  }, [world]);

  const contestOptions = world === 'paid' ? sources.paid_contests : sources.free_world_contests;

  useEffect(() => {
    if (!contestId) {
      setLeaderboard([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingBoard(true);
    setError('');
    const request = world === 'paid'
      ? adminAPI.paidLeaderboard(contestId)
      : adminAPI.freeWorldLeaderboard(contestId);
    request.then((data) => {
      if (!cancelled) setLeaderboard(data.leaderboard || []);
    }).catch((e) => {
      if (!cancelled) setError(e?.response?.data?.detail || 'Could not load this leaderboard.');
    }).finally(() => { if (!cancelled) setLoadingBoard(false); });
    return () => { cancelled = true; };
  }, [world, contestId]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return leaderboard;
    return leaderboard.filter((row) => [
      row.user?.name, row.user?.username, row.user?.email, row.user?.public_id,
      row.user_name, row.user_id, row.ticket_id, row.ticket_number,
    ].some((value) => String(value ?? '').toLowerCase().includes(query)));
  }, [leaderboard, search]);

  const beginEdit = (row) => {
    setEditingId(row.score_id);
    setDurationSeconds(seconds(row.duration_ms));
    setReason('');
    setNotice('');
  };

  const cancelEdit = () => {
    setEditingId('');
    setDurationSeconds('');
    setReason('');
  };

  const saveTime = async (row) => {
    const milliseconds = Math.round(Number(durationSeconds) * 1000);
    if (!Number.isInteger(milliseconds) || milliseconds < 100 || milliseconds > 1200000) {
      setError('Enter a time from 0.10 to 1200 seconds.');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Enter a reason with at least 10 characters.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = { duration_ms: milliseconds, reason: reason.trim() };
      if (world === 'paid') await adminAPI.overridePaidLeaderboardTime(row.score_id, payload);
      else await adminAPI.overrideFreeWorldLeaderboardTime(row.score_id, payload);
      setNotice('Leaderboard time updated and audit logged.');
      cancelEdit();
      const data = world === 'paid'
        ? await adminAPI.paidLeaderboard(contestId)
        : await adminAPI.freeWorldLeaderboard(contestId);
      setLeaderboard(data.leaderboard || []);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not update this time.');
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    if (!contestId) return;
    setLoadingBoard(true);
    setError('');
    try {
      const data = world === 'paid'
        ? await adminAPI.paidLeaderboard(contestId)
        : await adminAPI.freeWorldLeaderboard(contestId);
      setLeaderboard(data.leaderboard || []);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load this leaderboard.');
    } finally {
      setLoadingBoard(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-leaderboards">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">All Leaderboards</h1>
          <p className="mt-1 text-sm text-slate-500">Paid contests and Free World verified scores.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          {isSuperAdmin ? 'Super-admin time overrides enabled' : 'Read-only access'}
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 pb-4">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" role="tablist" aria-label="Leaderboard world">
          <button type="button" role="tab" aria-selected={world === 'paid'} onClick={() => { setWorld('paid'); setContestId(''); setSearch(''); }} className={`rounded-md px-4 py-2 text-sm font-bold ${world === 'paid' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Paid World</button>
          <button type="button" role="tab" aria-selected={world === 'free'} onClick={() => { setWorld('free'); setContestId(''); setSearch(''); }} className={`rounded-md px-4 py-2 text-sm font-bold ${world === 'free' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Free World</button>
        </div>
        <label className="min-w-64 flex-1 text-xs font-bold uppercase tracking-wide text-slate-500">
          Contest
          <select value={contestId} onChange={(event) => setContestId(event.target.value)} disabled={loadingSources} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-800">
            <option value="">{loadingSources ? 'Loading contests…' : 'Select a contest'}</option>
            {contestOptions.map((contest) => world === 'paid'
              ? <option key={contest.contest_id} value={contest.contest_id}>{contest.title || contest.contest_id} · {contest.status || 'unknown'}</option>
              : <option key={contest.contest_number} value={contest.contest_number}>Free World contest {contest.contest_number} · {contest.status || 'unknown'}</option>)}
          </select>
        </label>
        <label className="relative min-w-56 flex-1 text-xs font-bold uppercase tracking-wide text-slate-500">
          Search players
          <Search className="absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, ID or ticket" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-medium normal-case tracking-normal text-slate-800" />
        </label>
        <button type="button" onClick={refresh} disabled={!contestId || loadingBoard} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loadingBoard ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>

      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Rank</th><th className="px-4 py-3">Player</th><th className="px-4 py-3">Ticket / Score ID</th><th className="px-4 py-3 text-right">Score</th><th className="px-4 py-3 text-right">Time</th><th className="px-4 py-3 text-right">Attempts</th>{isSuperAdmin && <th className="px-4 py-3 text-right">Action</th>}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map((row) => {
              const name = row.user?.name || row.user?.username || row.user_name || 'Player';
              const identity = row.user?.email || row.user?.public_id || row.user_id;
              const rowId = row.score_id || `${row.ticket_id || row.user_id}-${world}`;
              const editable = isSuperAdmin && Boolean(row.score_id);
              return (
                <tr key={rowId} className="align-top hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-black tabular-nums">#{row.rank}</td>
                  <td className="px-4 py-3"><div className="font-bold text-slate-900">{name}</div><div className="mt-0.5 text-xs text-slate-500">{identity}</div></td>
                  <td className="px-4 py-3 text-xs text-slate-600">{row.ticket_number ? `Ticket #${row.ticket_number}` : row.ticket_id || row.score_id || '—'}{row.duration_override_reason && <div className="mt-1 text-amber-700">Override: {row.duration_override_reason}</div>}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{row.points ?? row.score ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className="font-bold">{seconds(row.duration_ms)}s</span>
                    {row.duration_ms_override != null && <div className="mt-1 text-xs text-amber-700">Original {seconds(row.original_duration_ms)}s</div>}
                    {editingId === row.score_id && (
                      <div className="mt-3 w-72 space-y-2 text-left">
                        <input aria-label="Override time in seconds" type="number" min="0.1" max="1200" step="0.01" value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)} className="w-full rounded-md border px-2 py-1.5 text-sm" />
                        <textarea aria-label="Override reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (at least 10 characters)" rows={2} className="w-full rounded-md border px-2 py-1.5 text-sm" />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={cancelEdit} disabled={saving} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold"><X className="h-3 w-3" /> Cancel</button>
                          <button type="button" onClick={() => saveTime(row)} disabled={saving} className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1 text-xs font-bold text-white disabled:opacity-50"><Save className="h-3 w-3" /> {saving ? 'Saving…' : 'Save audited time'}</button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.attempts ?? '—'}</td>
                  {isSuperAdmin && <td className="px-4 py-3 text-right">{editable && editingId !== row.score_id && <button type="button" onClick={() => beginEdit(row)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><Clock3 className="h-3.5 w-3.5" /> Edit time</button>}</td>}
                </tr>
              );
            })}
            {!loadingBoard && visibleRows.length === 0 && <tr><td colSpan={isSuperAdmin ? 7 : 6} className="px-4 py-12 text-center text-slate-500">{contestId ? 'No leaderboard scores for this contest.' : 'Choose a world and contest to view its leaderboard.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {loadingBoard && <p className="text-center text-sm text-slate-500" role="status">Loading leaderboard…</p>}
      {isSuperAdmin && <p className="text-xs text-slate-500">Timer edits affect leaderboard ranking, retain the original verified time, and are recorded with your reason in the audit log.</p>}
    </div>
  );
}
