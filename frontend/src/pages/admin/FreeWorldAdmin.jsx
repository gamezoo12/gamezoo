import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Globe2,
  RefreshCw,
  Rocket,
  Trophy,
  Users,
  X,
  Search,
} from 'lucide-react';

import { worldAdminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

// Fixed production launch target: 15 September 2026, 00:00 Europe/London.
// 15 Sep is inside British Summer Time (UTC+1) → send +01:00 offset.
// The backend re-validates against WORLD_SEASON_START_MUST_BE_UK_MIDNIGHT.
const SEASON_START_LOCAL_ISO = '2026-09-15T00:00:00+01:00';
const SEASON_START_LABEL = '15 September 2026, 00:00 Europe/London';
const CONFIRM_PHRASE = 'CONFIRM SEASON LAUNCH';

const ukDate = (value, withTime = true) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};

const STATUS_STYLES = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SCHEDULED: 'bg-amber-100 text-amber-800',
  LIVE: 'bg-emerald-100 text-emerald-800',
  COMPLETED: 'bg-indigo-100 text-indigo-800',
  scheduled: 'bg-amber-100 text-amber-800',
  live: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-indigo-100 text-indigo-800',
};

function StatusPill({ status, testid }) {
  const key = status || 'DRAFT';
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide ${
        STATUS_STYLES[key] || 'bg-slate-100 text-slate-700'
      }`}
    >
      {String(key)}
    </span>
  );
}

function Stat({ label, value, testid }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div
        data-testid={testid}
        className="text-sm font-extrabold text-slate-900 mt-1"
      >
        {value}
      </div>
    </div>
  );
}

export default function FreeWorldAdmin() {
  const { toast } = useToast();

  const [busy, setBusy] = useState(false);
  const [contests, setContests] = useState([]);
  const [activeNumber, setActiveNumber] = useState(null);
  const [serverTime, setServerTime] = useState(null);
  const [schedule, setSchedule] = useState(null);

  const [launchOpen, setLaunchOpen] = useState(false);
  const [launchConfirm, setLaunchConfirm] = useState('');
  const [launching, setLaunching] = useState(false);

  // Free World Users
  const [users, setUsers] = useState([]);
  const [usersMeta, setUsersMeta] = useState({ page: 1, total: 0, total_pages: 1 });
  const [usersLoading, setUsersLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [completedFilter, setCompletedFilter] = useState('');
  const [championFilter, setChampionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState(null);

  const c1 = useMemo(
    () => contests.find((c) => c.contest_number === 1) || null,
    [contests],
  );

  const seasonStatus = useMemo(() => {
    if (!c1) return 'DRAFT';
    if (c1.status !== 'active') {
      if (schedule?.championships?.length &&
          schedule.championships.every((c) => c.status === 'completed')) {
        return 'COMPLETED';
      }
      return 'DRAFT';
    }
    const now = serverTime ? new Date(serverTime) : new Date();
    const start = c1.start_at ? new Date(c1.start_at) : null;
    if (start && now < start) return 'SCHEDULED';
    return 'LIVE';
  }, [c1, schedule, serverTime]);

  const canLaunch = seasonStatus === 'DRAFT';

  const loadCore = useCallback(async () => {
    setBusy(true);
    try {
      const [contestsRes, scheduleRes] = await Promise.all([
        worldAdminAPI.contests(),
        worldAdminAPI.seasonSchedule(SEASON_START_LOCAL_ISO),
      ]);
      setContests(contestsRes.contests || []);
      setActiveNumber(contestsRes.active_contest_number ?? null);
      setServerTime(contestsRes.server_time || scheduleRes.server_time);
      setSchedule(scheduleRes);
    } catch (e) {
      toast({
        title: 'Failed to load Free World',
        description: e?.response?.data?.detail || 'Please retry.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = { page, page_size: 25 };
      if (search.trim()) params.search = search.trim();
      if (levelFilter) params.level = Number(levelFilter);
      if (completedFilter) params.completed = completedFilter === 'yes';
      if (championFilter === 'yes') params.champion = true;
      const res = await worldAdminAPI.users(params);
      setUsers(res.items || []);
      setUsersMeta({
        page: res.page,
        total: res.total,
        total_pages: res.total_pages,
      });
    } catch (e) {
      toast({
        title: 'Failed to load users',
        description: e?.response?.data?.detail || 'Please retry.',
        variant: 'destructive',
      });
    } finally {
      setUsersLoading(false);
    }
  }, [page, search, levelFilter, completedFilter, championFilter, toast]);

  useEffect(() => { loadCore(); }, [loadCore]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const activeSched = useMemo(
    () => (schedule?.championships || []).find(
      (c) => c.championship_number === (activeNumber || 1),
    ) || null,
    [schedule, activeNumber],
  );

  const submitLaunch = async () => {
    if (launchConfirm.trim() !== CONFIRM_PHRASE) return;
    setLaunching(true);
    try {
      await worldAdminAPI.activate({
        contest_number: 1,
        start_at: SEASON_START_LOCAL_ISO,
      });
      toast({
        title: 'Season 1 scheduled',
        description: `Scheduled for ${SEASON_START_LABEL}.`,
      });
      setLaunchOpen(false);
      setLaunchConfirm('');
      await loadCore();
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast({
        title: 'Launch failed',
        description: (typeof d === 'string' ? d : d?.message) || 'Please retry.',
        variant: 'destructive',
      });
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="free-world-admin">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#6C2BFF] font-extrabold uppercase tracking-widest text-xs">
            <Globe2 className="w-4 h-4" />
            Free World
          </div>
          <h1 className="font-display font-extrabold text-3xl text-slate-900 mt-1">
            Season Control
          </h1>
          <p className="text-sm text-slate-500 mt-2 max-w-3xl">
            Locked 100-Championship season format. Level 1–10 and Champion
            configuration are fixed in the backend and are not editable here.
          </p>
        </div>
        <Button variant="outline" onClick={loadCore} disabled={busy}
          data-testid="free-world-refresh">
          <RefreshCw className={`w-4 h-4 mr-2 ${busy ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* SECTION 1 — SEASON CONTROL */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5"
        data-testid="section-season-control">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-extrabold text-lg text-slate-900 flex items-center gap-2">
            <Rocket className="w-5 h-5 text-[#6C2BFF]" /> Season Control
          </h2>
          <StatusPill status={seasonStatus} testid="season-status" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Season" value="1" testid="season-number" />
          <Stat label="Championships" value="100" testid="season-championships" />
          <Stat label="Active Championship"
            value={activeNumber || '—'} testid="season-active-champ" />
          <Stat label="Active stage/level"
            value={activeSched ? activeSched.status : '—'}
            testid="season-active-stage" />
          <Stat label="Season scheduled start"
            value={ukDate(c1?.start_at)} testid="season-start" />
          <Stat label="Current championship start"
            value={ukDate(activeSched?.start_at)} testid="season-current-start" />
          <Stat label="Current championship end"
            value={ukDate(activeSched?.champion_closes_at)} testid="season-current-end" />
          <Stat label="Next championship start"
            value={ukDate(activeSched?.next_start_at)} testid="season-next-start" />
        </div>

        <div className="mt-5">
          {canLaunch ? (
            <Button
              onClick={() => setLaunchOpen(true)}
              data-testid="launch-season-button"
              className="bg-[#6C2BFF] hover:bg-[#5a22d6] text-white font-extrabold"
            >
              <Rocket className="w-4 h-4 mr-2" />
              LAUNCH / SCHEDULE FREE WORLD SEASON
            </Button>
          ) : (
            <div className="inline-flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
              data-testid="season-scheduled-banner">
              <span className="font-black text-emerald-800 uppercase tracking-wide text-sm">
                Season 1 {seasonStatus === 'LIVE' ? 'Live' : 'Scheduled'}
              </span>
              <span className="text-sm text-emerald-700">
                {ukDate(c1?.start_at)}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 3 — CURRENT CHAMPIONSHIP */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5"
        data-testid="section-current-championship">
        <h2 className="font-extrabold text-lg text-slate-900 flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-amber-500" /> Current Championship
        </h2>
        {activeNumber && activeSched ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Championship" value={`#${activeNumber}`}
              testid="current-champ-number" />
            <Stat label="Stage status" value={activeSched.status}
              testid="current-champ-status" />
            <Stat label="Start" value={ukDate(activeSched.start_at)} />
            <Stat label="Closes" value={ukDate(activeSched.champion_closes_at)} />
          </div>
        ) : (
          <p className="text-sm text-slate-500" data-testid="current-champ-none">
            No championship is currently active. Once the season reaches its
            scheduled start, the backend scheduler transitions Championship 1
            automatically.
          </p>
        )}
      </section>

      {/* SECTION 2 — SEASON SCHEDULE (read-only 100 championships) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5"
        data-testid="section-season-schedule">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-extrabold text-lg text-slate-900">
            Season Schedule — 100 Championships
          </h2>
          <span className="text-xs text-slate-400">
            {schedule?.scheduled ? 'Scheduled' : 'Preview'} · times Europe/London
          </span>
        </div>
        <div className="overflow-auto max-h-[420px] rounded-xl border border-slate-100"
          data-testid="season-schedule-table">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-500 text-[11px] uppercase">
              <tr>
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">L1 start</th>
                <th className="text-left px-3 py-2">L10 start</th>
                <th className="text-left px-3 py-2">Champion open</th>
                <th className="text-left px-3 py-2">Champion close</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(schedule?.championships || []).map((c) => (
                <tr key={c.championship_number}
                  className="border-t border-slate-100 hover:bg-slate-50"
                  data-testid={`schedule-row-${c.championship_number}`}>
                  <td className="px-3 py-2 font-bold">{c.championship_number}</td>
                  <td className="px-3 py-2">{ukDate(c.l1_start)}</td>
                  <td className="px-3 py-2">{ukDate(c.l10_start)}</td>
                  <td className="px-3 py-2">{ukDate(c.champion_opens_at)}</td>
                  <td className="px-3 py-2">{ukDate(c.champion_closes_at)}</td>
                  <td className="px-3 py-2"><StatusPill status={c.status} /></td>
                </tr>
              ))}
              {!(schedule?.championships || []).length && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  No schedule available.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* PART 2 — FREE WORLD USERS (read-only) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5"
        data-testid="section-free-world-users">
        <h2 className="font-extrabold text-lg text-slate-900 flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-[#6C2BFF]" /> Free World Users
          <span className="text-xs font-normal text-slate-400">(read-only)</span>
        </h2>

        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              data-testid="users-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); loadUsers(); } }}
              placeholder="Search public ID, email or name"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <select data-testid="users-filter-level" value={levelFilter}
            onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
            <option value="">All levels</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>Level {n}</option>
            ))}
          </select>
          <select data-testid="users-filter-completed" value={completedFilter}
            onChange={(e) => { setCompletedFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
            <option value="">Any completion</option>
            <option value="yes">Completed all</option>
            <option value="no">Not completed</option>
          </select>
          <select data-testid="users-filter-champion" value={championFilter}
            onChange={(e) => { setChampionFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm">
            <option value="">Any</option>
            <option value="yes">Champion ready</option>
          </select>
          <Button variant="outline" onClick={() => { setPage(1); loadUsers(); }}
            data-testid="users-apply">Apply</Button>
        </div>

        <div className="overflow-auto rounded-xl border border-slate-100"
          data-testid="users-table">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
              <tr>
                <th className="text-left px-3 py-2">Public ID</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Email</th>
                <th className="text-left px-3 py-2">Level</th>
                <th className="text-left px-3 py-2">Completed</th>
                <th className="text-left px-3 py-2">Champion</th>
                <th className="text-left px-3 py-2">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {usersLoading && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  Loading…</td></tr>
              )}
              {!usersLoading && users.map((u) => (
                <tr key={u.user_id}
                  onClick={() => setSelectedUser(u)}
                  className="border-t border-slate-100 hover:bg-violet-50 cursor-pointer"
                  data-testid={`users-row-${u.user_id}`}>
                  <td className="px-3 py-2 font-mono text-xs">{u.public_id || '—'}</td>
                  <td className="px-3 py-2">{u.name || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{u.email || '—'}</td>
                  <td className="px-3 py-2 font-bold">{u.current_level}</td>
                  <td className="px-3 py-2">{u.completed_count}/10</td>
                  <td className="px-3 py-2">{u.champion_ready ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2 text-slate-500">{ukDate(u.last_activity)}</td>
                </tr>
              ))}
              {!usersLoading && !users.length && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400"
                  data-testid="users-empty">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3 text-sm">
          <span className="text-slate-500" data-testid="users-total">
            {usersMeta.total} users
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              data-testid="users-prev">Prev</Button>
            <span data-testid="users-page">
              Page {usersMeta.page} / {usersMeta.total_pages}
            </span>
            <Button variant="outline" size="sm"
              disabled={page >= usersMeta.total_pages}
              onClick={() => setPage((p) => p + 1)}
              data-testid="users-next">Next</Button>
          </div>
        </div>
      </section>

      {/* Launch confirmation dialog */}
      {launchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          data-testid="launch-dialog"
          onClick={() => !launching && setLaunchOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="font-extrabold text-xl text-slate-900">Season 1</h3>
            <div className="mt-3 space-y-1 text-sm text-slate-700">
              <div><b>100 Championships</b></div>
              <div>Start: <b>{SEASON_START_LABEL}</b></div>
            </div>
            <p className="mt-3 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
              Championship 1 Level 1 will open automatically at the scheduled
              start time. Championships 2–100 will be derived automatically from
              the Season schedule. This schedules the season — it does not open
              Championship 1 before the scheduled time.
            </p>
            <label className="block mt-4 text-xs font-bold text-slate-500 uppercase">
              Type “{CONFIRM_PHRASE}” to confirm
            </label>
            <input
              data-testid="launch-confirm-input"
              value={launchConfirm}
              onChange={(e) => setLaunchConfirm(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
              placeholder={CONFIRM_PHRASE}
            />
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" disabled={launching}
                onClick={() => { setLaunchOpen(false); setLaunchConfirm(''); }}
                data-testid="launch-cancel">Cancel</Button>
              <Button className="flex-1 bg-[#6C2BFF] hover:bg-[#5a22d6] text-white"
                disabled={launching || launchConfirm.trim() !== CONFIRM_PHRASE}
                onClick={submitLaunch}
                data-testid="launch-confirm-button">
                {launching ? 'Scheduling…' : 'Schedule Season'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* User detail drawer (read-only) */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40"
          data-testid="user-detail-drawer"
          onClick={() => setSelectedUser(null)}>
          <div className="w-full max-w-md h-full bg-white p-6 overflow-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg text-slate-900">Player progress</h3>
              <button onClick={() => setSelectedUser(null)} data-testid="drawer-close">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {[
                ['Public ID', selectedUser.public_id],
                ['Name', selectedUser.name],
                ['Email', selectedUser.email],
                ['Current championship', selectedUser.current_championship],
                ['Champion stage', selectedUser.champion_stage],
                ['Current level', selectedUser.current_level],
                ['Highest unlocked', selectedUser.highest_unlocked_level],
                ['Completed levels', (selectedUser.completed_levels || []).join(', ') || '—'],
                ['All levels completed', selectedUser.all_levels_completed ? 'Yes' : 'No'],
                ['Champion ready', selectedUser.champion_ready ? 'Yes' : 'No'],
                ['Qualified', selectedUser.qualified ? 'Yes' : 'No'],
                ['Winner status', selectedUser.winner_status || '—'],
                ['Last activity', ukDate(selectedUser.last_activity)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-slate-100 py-2">
                  <span className="text-slate-500">{k}</span>
                  <span className="font-semibold text-slate-900 text-right">{String(v ?? '—')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
