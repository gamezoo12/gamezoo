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
  Clock,
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

const fmtCountdown = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return 'opening now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d > 0 ? d + 'd ' : ''}${pad(h)}:${pad(m)}:${pad(ss)}`;
};

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

  // User Progress Manager (Phase 1)
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState(null);
  const [editReason, setEditReason] = useState('');

  // Phase 3 · extensions
  const [extending, setExtending] = useState(false);

  // Phase 4 · per-(stage, level) attempt config
  const [slcOverrides, setSlcOverrides] = useState([]);
  const [slcDefault, setSlcDefault] = useState(3);
  const [slcStage, setSlcStage] = useState('');
  const [slcLevel, setSlcLevel] = useState('');
  const [slcAttempts, setSlcAttempts] = useState('');
  const [slcSaving, setSlcSaving] = useState(false);

  // Live countdown to C1 open (server-authoritative base + local ticking).
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [serverOffset, setServerOffset] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (serverTime) setServerOffset(new Date(serverTime).getTime() - Date.now());
  }, [serverTime]);

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

  const cancelSchedule = async () => {
    if (!window.confirm('Cancel the scheduled Season 1? It has not gone live yet.')) return;
    setLaunching(true);
    try {
      await worldAdminAPI.deactivate();
      toast({ title: 'Schedule cancelled' });
      await loadCore();
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast({
        title: 'Cancel failed',
        description: (typeof d === 'string' ? d : d?.message) || 'Please retry.',
        variant: 'destructive',
      });
    } finally {
      setLaunching(false);
    }
  };

  const openUser = useCallback(async (u) => {
    setSelectedUser(u);
    setDetail(null);
    setEdit(null);
    setEditReason('');
    setDetailLoading(true);
    try {
      const res = await worldAdminAPI.userProgress(u.user_id);
      setDetail(res);
      setEdit({
        current_level: res.progress.current_level,
        highest_unlocked_level: res.progress.highest_unlocked_level,
        champion_stage: res.progress.champion_stage,
        champion_ready: res.progress.champion_ready,
        completed_levels: [...(res.progress.completed_levels || [])],
      });
    } catch (e) {
      toast({
        title: 'Failed to load progress',
        description: e?.response?.data?.detail || 'Please retry.',
        variant: 'destructive',
      });
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  const closeUser = () => {
    setSelectedUser(null);
    setDetail(null);
    setEdit(null);
    setEditReason('');
  };

  const toggleCompleted = (lvl) => {
    setEdit((prev) => {
      const set = new Set(prev.completed_levels);
      if (set.has(lvl)) set.delete(lvl); else set.add(lvl);
      return { ...prev, completed_levels: Array.from(set).sort((a, b) => a - b) };
    });
  };

  const allTen = edit &&
    edit.completed_levels.length === 10 &&
    edit.completed_levels.every((l, i) => l === i + 1);

  const saveProgress = async () => {
    if (!selectedUser || !edit) return;
    if (edit.champion_ready && !allTen) {
      toast({
        title: 'Cannot enable Champion ready',
        description: 'All 10 levels must be marked completed first.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const res = await worldAdminAPI.editUserProgress(selectedUser.user_id, {
        current_level: edit.current_level,
        highest_unlocked_level: edit.highest_unlocked_level,
        champion_stage: edit.champion_stage,
        champion_ready: edit.champion_ready,
        completed_levels: edit.completed_levels,
        reason: editReason.trim() || undefined,
      });
      toast({
        title: res.updated ? 'Progress updated' : 'No changes',
        description: res.updated
          ? `${res.changes.length} field(s) changed.`
          : 'Nothing to save.',
      });
      if (res.updated) {
        const fresh = await worldAdminAPI.userProgress(selectedUser.user_id);
        setDetail(fresh);
        setEditReason('');
        loadUsers();
      }
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast({
        title: 'Update failed',
        description: (typeof d === 'string' ? d : d?.message) || 'Please retry.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const extendContest = async (number) => {
    setExtending(true);
    try {
      const res = await worldAdminAPI.extendContest(number, 1);
      toast({
        title: `Championship ${number} extended +24h`,
        description: 'Downstream championships shifted automatically.',
      });
      await loadCore();
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast({
        title: 'Extend failed',
        description: (typeof d === 'string' ? d : d?.message) || 'Please retry.',
        variant: 'destructive',
      });
    } finally {
      setExtending(false);
    }
  };

  const resetExtensions = async () => {
    if (!window.confirm('Clear all championship extensions? Schedules revert to the base calendar.')) return;
    setExtending(true);
    try {
      await worldAdminAPI.resetExtensions();
      toast({ title: 'Extensions cleared' });
      await loadCore();
    } catch (e) {
      toast({ title: 'Reset failed', variant: 'destructive' });
    } finally {
      setExtending(false);
    }
  };

  const loadStageLevelConfig = useCallback(async () => {
    try {
      const res = await worldAdminAPI.stageLevelConfig();
      setSlcOverrides(res.overrides || []);
      setSlcDefault(res.default_free_attempts ?? 3);
    } catch (e) {
      // non-blocking
    }
  }, []);

  useEffect(() => { loadStageLevelConfig(); }, [loadStageLevelConfig]);

  const saveStageLevelConfig = async () => {
    const stage = Number(slcStage);
    const level = Number(slcLevel);
    const attempts = Number(slcAttempts);
    if (!(stage >= 1 && stage <= 100) || !(level >= 1 && level <= 10) ||
        !(attempts >= 0 && attempts <= 20)) {
      toast({
        title: 'Check your inputs',
        description: 'Championship 1–100, Level 1–10, attempts 0–20.',
        variant: 'destructive',
      });
      return;
    }
    setSlcSaving(true);
    try {
      await worldAdminAPI.setStageLevelConfig({
        champion_stage: stage,
        level,
        initial_free_attempts: attempts,
      });
      toast({ title: `Override set for C${stage} L${level}` });
      setSlcStage(''); setSlcLevel(''); setSlcAttempts('');
      await loadStageLevelConfig();
    } catch (e) {
      toast({ title: 'Failed to set override', variant: 'destructive' });
    } finally {
      setSlcSaving(false);
    }
  };

  const clearStageLevelConfig = async (stage, level) => {
    try {
      await worldAdminAPI.setStageLevelConfig({
        champion_stage: stage,
        level,
        initial_free_attempts: null,
      });
      toast({ title: `Override cleared for C${stage} L${level}` });
      await loadStageLevelConfig();
    } catch (e) {
      toast({ title: 'Failed to clear override', variant: 'destructive' });
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
            <div className="space-y-3">
              {seasonStatus === 'SCHEDULED' && c1?.start_at && (
                <div data-testid="c1-countdown-banner"
                  className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                  <div className="text-sm text-amber-900">
                    Championship 1 opens in{' '}
                    <b data-testid="c1-countdown" className="font-mono font-black">
                      {fmtCountdown(new Date(c1.start_at).getTime() - (nowMs + serverOffset))}
                    </b>
                    {' '}· {ukDate(c1.start_at)} (Europe/London)
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
                  data-testid="season-scheduled-banner">
                  <span className="font-black text-emerald-800 uppercase tracking-wide text-sm">
                    Season 1 {seasonStatus === 'LIVE' ? 'Live' : 'Scheduled'}
                  </span>
                  <span className="text-sm text-emerald-700">
                    {ukDate(c1?.start_at)}
                  </span>
                </div>
                {seasonStatus === 'SCHEDULED' && (
                  <>
                    <Button variant="outline" onClick={() => setLaunchOpen(true)}
                      data-testid="reschedule-season-button">
                      Reschedule
                    </Button>
                    <Button variant="outline"
                      className="text-rose-600 border-rose-200 hover:bg-rose-50"
                      disabled={launching}
                      onClick={cancelSchedule}
                      data-testid="cancel-schedule-button">
                      Cancel schedule
                    </Button>
                  </>
                )}
              </div>
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
          <div className="flex items-center gap-3">
            {Object.keys(schedule?.championship_extensions || {}).length > 0 && (
              <Button variant="outline" size="sm" onClick={resetExtensions}
                disabled={extending}
                data-testid="reset-extensions-btn">
                Reset extensions
              </Button>
            )}
            <span className="text-xs text-slate-400">
              {schedule?.scheduled ? 'Scheduled' : 'Preview'} · times Europe/London
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Extending a championship by 24h pushes its Champion close later and
          automatically shifts every later championship by the same amount.
          The live scheduler applies the new end time within ~60 seconds.
        </p>
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
                <th className="text-left px-3 py-2">Ext</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2"></th>
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
                  <td className="px-3 py-2">
                    {c.extension_days > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold"
                        data-testid={`schedule-ext-${c.championship_number}`}>
                        +{c.extension_days}d
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2"><StatusPill status={c.status} /></td>
                  <td className="px-3 py-2">
                    {c.status !== 'completed' && (
                      <Button variant="outline" size="sm"
                        disabled={extending}
                        onClick={() => extendContest(c.championship_number)}
                        data-testid={`extend-btn-${c.championship_number}`}>
                        +24h
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!(schedule?.championships || []).length && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  No schedule available.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* PART 2.5 — PER-CHAMPIONSHIP+LEVEL ATTEMPT CONFIG (Phase 4) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5"
        data-testid="section-stage-level-config">
        <h2 className="font-extrabold text-lg text-slate-900 flex items-center gap-2 mb-1">
          <Trophy className="w-5 h-5 text-[#6C2BFF]" /> Per-Championship Attempt Limits
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Override the free-attempt allowance for a specific Championship + Level.
          Leave unset to use the default ({slcDefault} free attempts).
        </p>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="block">
            <span className="text-[11px] font-bold uppercase text-slate-500">Championship</span>
            <input type="number" min={1} max={100} value={slcStage}
              onChange={(e) => setSlcStage(e.target.value)}
              data-testid="slc-stage"
              className="w-28 mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase text-slate-500">Level (1–10)</span>
            <input type="number" min={1} max={10} value={slcLevel}
              onChange={(e) => setSlcLevel(e.target.value)}
              data-testid="slc-level"
              className="w-24 mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase text-slate-500">Free attempts</span>
            <input type="number" min={0} max={20} value={slcAttempts}
              onChange={(e) => setSlcAttempts(e.target.value)}
              data-testid="slc-attempts"
              className="w-28 mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
          </label>
          <Button className="bg-[#6C2BFF] hover:bg-[#5a22d6] text-white"
            disabled={slcSaving} onClick={saveStageLevelConfig}
            data-testid="slc-save">
            {slcSaving ? 'Saving…' : 'Set override'}
          </Button>
        </div>
        <div className="overflow-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
              <tr>
                <th className="text-left px-3 py-2">Championship</th>
                <th className="text-left px-3 py-2">Level</th>
                <th className="text-left px-3 py-2">Free attempts</th>
                <th className="text-left px-3 py-2"></th>
              </tr>
            </thead>
            <tbody data-testid="slc-list">
              {(slcOverrides || []).map((o) => (
                <tr key={`${o.champion_stage}-${o.level}`}
                  className="border-t border-slate-100"
                  data-testid={`slc-row-${o.champion_stage}-${o.level}`}>
                  <td className="px-3 py-2 font-bold">C{o.champion_stage}</td>
                  <td className="px-3 py-2">L{o.level}</td>
                  <td className="px-3 py-2">{o.initial_free_attempts}</td>
                  <td className="px-3 py-2">
                    <Button variant="outline" size="sm"
                      onClick={() => clearStageLevelConfig(o.champion_stage, o.level)}
                      data-testid={`slc-clear-${o.champion_stage}-${o.level}`}>
                      Clear
                    </Button>
                  </td>
                </tr>
              ))}
              {!(slcOverrides || []).length && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400"
                  data-testid="slc-empty">
                  No overrides — all championships use the default.
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
          <span className="text-xs font-normal text-slate-400">(click a row to view & edit)</span>
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
                  onClick={() => openUser(u)}
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

      {/* User Progress Manager drawer (editable, audited) */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40"
          data-testid="user-detail-drawer"
          onClick={closeUser}>
          <div className="w-full max-w-lg h-full bg-white p-6 overflow-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg text-slate-900">User Progress Manager</h3>
              <button onClick={closeUser} data-testid="drawer-close">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm">
              <div className="font-bold text-slate-900">
                {selectedUser.name || '—'}
                <span className="font-mono text-xs text-slate-400 ml-2">
                  {selectedUser.public_id || ''}
                </span>
              </div>
              <div className="text-slate-500">{selectedUser.email || '—'}</div>
              {detail?.current_championship != null && (
                <div className="text-slate-500 mt-1 text-xs">
                  Current global Championship: <b>{detail.current_championship}</b>
                </div>
              )}
              {detail?.user && (
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]"
                  data-testid="user-activity">
                  <div className="rounded-lg bg-white border border-slate-100 p-2">
                    <div className="uppercase text-slate-400 font-bold">Last login</div>
                    <div className="text-slate-700 mt-0.5">{ukDate(detail.user.last_login_at)}</div>
                  </div>
                  <div className="rounded-lg bg-white border border-slate-100 p-2">
                    <div className="uppercase text-slate-400 font-bold">Last visit</div>
                    <div className="text-slate-700 mt-0.5">{ukDate(detail.user.last_visit_at)}</div>
                  </div>
                  <div className="rounded-lg bg-white border border-slate-100 p-2">
                    <div className="uppercase text-slate-400 font-bold">Last play</div>
                    <div className="text-slate-700 mt-0.5">{ukDate(detail.user.last_gameplay_at)}</div>
                  </div>
                </div>
              )}
            </div>

            {detailLoading && (
              <div className="mt-6 text-center text-slate-400 text-sm"
                data-testid="drawer-loading">Loading progress…</div>
            )}

            {!detailLoading && edit && (
              <div className="mt-5 space-y-5" data-testid="progress-editor">
                {/* Championship + levels */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-slate-500">
                      Championship (1–{detail?.limits?.max_championship || 100})
                    </span>
                    <input type="number" min={1}
                      max={detail?.limits?.max_championship || 100}
                      data-testid="edit-champion-stage"
                      value={edit.champion_stage}
                      onChange={(e) => setEdit((p) => ({
                        ...p, champion_stage: Number(e.target.value),
                      }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-slate-500">
                      Current level (1–10)
                    </span>
                    <input type="number" min={1} max={10}
                      data-testid="edit-current-level"
                      value={edit.current_level}
                      onChange={(e) => setEdit((p) => ({
                        ...p, current_level: Number(e.target.value),
                      }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-slate-500">
                      Highest unlocked (1–10)
                    </span>
                    <input type="number" min={1} max={10}
                      data-testid="edit-highest-level"
                      value={edit.highest_unlocked_level}
                      onChange={(e) => setEdit((p) => ({
                        ...p, highest_unlocked_level: Number(e.target.value),
                      }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </label>
                </div>

                {/* Completed levels */}
                <div>
                  <span className="text-[11px] font-bold uppercase text-slate-500">
                    Completed levels ({edit.completed_levels.length}/10)
                  </span>
                  <div className="mt-2 grid grid-cols-5 gap-2" data-testid="edit-completed-grid">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((lvl) => {
                      const on = edit.completed_levels.includes(lvl);
                      return (
                        <button key={lvl} type="button"
                          data-testid={`edit-completed-${lvl}`}
                          onClick={() => toggleCompleted(lvl)}
                          className={`py-2 rounded-lg text-sm font-bold border transition-colors ${
                            on
                              ? 'bg-[#6C2BFF] text-white border-[#6C2BFF]'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                          }`}>
                          {lvl}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Champion ready */}
                <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                  <span className="text-sm">
                    <span className="font-bold text-slate-900">Champion ready</span>
                    <span className="block text-xs text-slate-500">
                      Only enabled when all 10 levels are completed.
                    </span>
                  </span>
                  <input type="checkbox"
                    data-testid="edit-champion-ready"
                    checked={edit.champion_ready}
                    disabled={!allTen}
                    onChange={(e) => setEdit((p) => ({
                      ...p, champion_ready: e.target.checked,
                    }))}
                    className="w-5 h-5 accent-[#6C2BFF] disabled:opacity-40" />
                </label>

                {/* Reason */}
                <label className="block">
                  <span className="text-[11px] font-bold uppercase text-slate-500">
                    Reason (optional — recorded in audit log)
                  </span>
                  <textarea rows={2}
                    data-testid="edit-reason"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="Why are you making this change?"
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                </label>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={closeUser}
                    data-testid="edit-cancel">Close</Button>
                  <Button className="flex-1 bg-[#6C2BFF] hover:bg-[#5a22d6] text-white"
                    disabled={saving} onClick={saveProgress}
                    data-testid="edit-save">
                    {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>

                {/* Audit trail */}
                <div className="pt-2 border-t border-slate-100">
                  <h4 className="text-sm font-extrabold text-slate-900 mb-2">
                    Audit trail
                  </h4>
                  {!(detail?.audit || []).length && (
                    <div className="text-xs text-slate-400" data-testid="audit-empty">
                      No manual edits yet.
                    </div>
                  )}
                  <div className="space-y-2" data-testid="audit-list">
                    {(detail?.audit || []).map((a, idx) => (
                      <div key={idx}
                        className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs">
                        <div className="flex justify-between text-slate-500">
                          <span className="font-semibold text-slate-700">
                            {a.actor_email || a.actor_user_id || 'admin'}
                          </span>
                          <span>{ukDate(a.created_at)}</span>
                        </div>
                        <div className="mt-1 text-slate-600">
                          {(a.changes || []).map((c, i) => (
                            <div key={i}>
                              <b>{c.field}</b>: {JSON.stringify(c.before)} → {JSON.stringify(c.after)}
                            </div>
                          ))}
                        </div>
                        {a.reason && (
                          <div className="mt-1 italic text-slate-500">“{a.reason}”</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
