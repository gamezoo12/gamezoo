import { VerifiedReviewerBadge } from '../../components/VerifiedReviewerBadge';
import { useEffect, useState } from 'react';
import { ArrowLeft, Crown, RotateCcw, Trophy } from 'lucide-react';
import { worldGcCompetitionAPI } from '../../lib/api';
import { MemoryBoard3D, MemoryTile } from '../../components/games/premium/boards';

const defaultRewards = { '1': 5, '2': 4, '3': 3, '4': 2, '5': 1 };

const levelOptions = [...Array.from({ length: 10 }, (_, index) => [`L${index + 1}`, `Level ${index + 1}`]), ['champion', 'Champion Level']];
const gcOptions = Array.from({ length: 50 }, (_, index) => index + 4);

function formatTime(value) {
  if (value == null) return '—';
  const centiseconds = Math.floor(Math.max(0, Number(value)) / 10);
  const seconds = Math.floor(centiseconds / 100);
  const mins = Math.floor(seconds / 60);
  return `${String(mins).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
}

function encourage(rank, gapMs, slowerThanBest) {
  if (slowerThanBest) return 'That was slower than your personal best. Try again and beat your record.';
  if (rank === 1) return 'You are currently in 1st place. Keep defending your position!';
  if (rank > 1 && gapMs != null) return `You are in ${rank}${rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'} place, ${formatTime(gapMs)} behind the next rank. Try again!`;
  if (rank > 0) return `You are currently in ${rank}${rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'} place. Keep improving your time!`;
  return 'Your time is recorded. Keep playing to set your leaderboard position.';
}

const Card = ({ position, symbol, revealed, matched, disabled, onClick }) =>
  <MemoryTile symbol={symbol} faceUp={revealed} matched={matched} disabled={disabled} onClick={() => onClick(position)} testId={`memory-card-${position}`} />;

export default function EveryLevelWorld({ gcNumber, onExit }) {
  const [progress, setProgress] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState('L1');
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [matched, setMatched] = useState([]);
  const [mismatch, setMismatch] = useState([]);
  const [clickCount, setClickCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [result, setResult] = useState(null);
  const [leaderboardGC, setLeaderboardGC] = useState(gcNumber);
  const [leaderboardLevel, setLeaderboardLevel] = useState('L1');
  const [leaderboard, setLeaderboard] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    worldGcCompetitionAPI.progress(gcNumber).then((data) => {
      if (!active) return;
      setProgress(data);
      const recommended = data.levels.find((row) => row.playable && !row.passed)
        || data.levels.find((row) => row.action === 'retry')
        || data.levels.find((row) => row.playable);
      if (recommended) setSelectedLevel(recommended.level === 'champion' ? 'champion' : `L${recommended.level}`);
    }).catch((requestError) => {
      if (active) setError(requestError?.response?.data?.detail || 'Could not load progression.');
    });
    return () => { active = false; };
  }, [gcNumber]);

  useEffect(() => {
    let active = true;
    worldGcCompetitionAPI.leaderboard(leaderboardGC, leaderboardLevel).then((data) => {
      if (active) setLeaderboard(data);
    }).catch((requestError) => {
      if (!active) return;
      setLeaderboard(null);
      setError(requestError?.response?.data?.detail || 'Leaderboard unavailable.');
    });
    return () => { active = false; };
  }, [leaderboardGC, leaderboardLevel]);
  useEffect(() => {
    if (!session || result || !startedAt) return undefined;
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const timer = window.setInterval(tick, 10);
    return () => window.clearInterval(timer);
  }, [session, result, startedAt]);

  const startLevel = async () => {
    setBusy(true); setError(''); setResult(null); setRevealed({}); setMatched([]); setMismatch([]); setClickCount(0);
    try {
      const prepared = await worldGcCompetitionAPI.startMemoryMatch(gcNumber, selectedLevel);
      const begun = await worldGcCompetitionAPI.beginMemoryMatch(prepared.session_id);
      const next = { ...prepared, started_at: begun.started_at };
      setSession(next);
      setStartedAt(new Date(begun.started_at).getTime());
      setElapsed(0);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Could not start this level.');
    } finally { setBusy(false); }
  };

  const clickCard = async (position) => {
    if (!session || busy || revealed[position] != null || matched.includes(position) || mismatch.length) return;
    setBusy(true);
    try {
      const response = await worldGcCompetitionAPI.clickMemoryMatch(session.session_id, position);
      const nextRevealed = { ...revealed, [position]: response.symbol };
      setRevealed(nextRevealed);
      setClickCount(response.click_count);
      setMatched(response.matched_positions || []);
      if (response.match === false) {
        const first = session.last_position;
        const positions = Object.keys(revealed).filter((key) => !matched.includes(Number(key)));
        const previous = positions[positions.length - 1];
        const pair = previous == null ? [position] : [Number(previous), position];
        setMismatch(pair);
        setSession((current) => ({ ...current, last_position: position, previous_position: previous }));
        window.setTimeout(() => {
          setRevealed((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !pair.includes(Number(key)))));
          setMismatch([]);
        }, 700);
      } else {
        setSession((current) => ({ ...current, last_position: position }));
      }
      if (response.complete) {
        const completedLevel = selectedLevel;
        setSession(null);
        setStartedAt(null);
        setElapsed(response.duration_ms);
        const board = await worldGcCompetitionAPI.leaderboard(gcNumber, completedLevel);
        setLeaderboard(board);
        const ownBest = board.personal_best_ms ?? response.personal_best_ms;
        const latestProgress = await worldGcCompetitionAPI.progress(gcNumber);
        setProgress(latestProgress);
        const completed = latestProgress.levels.find((row) =>
          (row.level === 'champion' ? 'champion' : `L${row.level}`) === completedLevel);
        const nextLevel = latestProgress.levels.find((row) => row.playable && !row.passed &&
          (row.level === 'champion' || completedLevel !== 'champion' && Number(row.level) > Number(completedLevel.slice(1))));
        setResult({ ...response, level: completedLevel, nextLevel: nextLevel?.level,
          action: completed?.action, duration_ms: response.duration_ms, personal_best_ms: ownBest,
          rank: response.rank, reward: board.rewards,
          champion_prize_tokens: response.champion_prize_tokens,
          accumulated_bonus_tokens: response.accumulated_bonus_tokens });
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Could not record that card.');
    } finally { setBusy(false); }
  };

  const currentProgress = progress?.levels.find((row) => (row.level === 'champion' ? 'champion' : `L${row.level}`) === selectedLevel);
  const leaderboardRows = leaderboard?.leaderboard || [];
  const isSlower = Boolean(result && result.personal_best_ms != null && result.duration_ms > result.personal_best_ms);
  const reward = result?.rank > 0 && result.rank <= 5 ? Number(result.reward?.[String(result.rank)] || 0) : 0;

  return <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-8" data-testid="every-level-world">
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-black text-slate-950">GC{gcNumber} · Every Level + Champion</h1><p className="text-sm text-slate-600">Memory Match · unlimited free attempts · stopwatch ranking</p></div>
        <button type="button" onClick={onExit} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold"><ArrowLeft className="h-4 w-4" /> World map</button>
      </header>

      {error && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4" aria-label="Memory Match game">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="w-56"><span className="mb-1 block text-xs font-bold text-slate-600">Level progression</span>
              <select value={selectedLevel} onChange={(event) => { setSelectedLevel(event.target.value); setResult(null); }} disabled={Boolean(session)} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm">
                {levelOptions.map(([value, name]) => {
                  const row = progress?.levels.find((item) => (item.level === 'champion' ? 'champion' : `L${item.level}`) === value);
                  return <option key={value} value={value} disabled={!row?.playable}>{name}{row?.passed ? ' · Passed' : ''}{!row?.opened ? ' · Scheduled' : ''}</option>;
                })}
              </select>
            </label>
            <div className="text-right"><div className="text-xs font-bold uppercase text-slate-500">Stopwatch</div><div className="font-mono text-3xl font-black tabular-nums" data-testid="memory-stopwatch">{formatTime(elapsed)}</div></div>
          </div>

          {!session && !result && <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">Match every pair. The timer counts up with no time limit; completion time is measured by the server. Retries are free while the level remains open.</div>}

          {session && <MemoryBoard3D count={session.cards.length} level={null} stats={[['Pairs', `${matched.length / 2}/${session.cards.length / 2}`]]}>
            {session.cards.map((position) => <Card key={position} position={position} symbol={revealed[position]} revealed={revealed[position] != null} matched={matched.includes(position)} disabled={busy || Boolean(mismatch.length)} onClick={clickCard} />)}
          </MemoryBoard3D>}

          {result && <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4" data-testid="memory-result">
            <div className="flex items-center gap-2 text-lg font-black text-emerald-950"><Trophy className="h-5 w-5" /> Level Passed</div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-emerald-800">This attempt</dt><dd className="font-mono font-bold">{formatTime(result.duration_ms)}</dd></div>
              <div><dt className="text-emerald-800">Clicks</dt><dd className="font-bold">{result.click_count}</dd></div>
              <div><dt className="text-emerald-800">Personal best</dt><dd className="font-mono font-bold">{formatTime(result.personal_best_ms)}</dd></div>
              <div><dt className="text-emerald-800">Current rank</dt><dd className="font-bold">{result.rank ? `#${result.rank}` : '—'}</dd></div>
            </dl>
            {result.level === 'champion' ? <p className="text-sm font-semibold text-emerald-950">Current Top 5 estimate: {result.champion_prize_tokens ?? 0} Champion Tokens + {result.accumulated_bonus_tokens ?? 0} finalized Bonus Tokens. Final Champion rewards are credited only after the Champion Level closes.</p>
              : <p className="text-sm font-semibold text-emerald-950">Provisional Bonus Tokens: {reward}. Not credited to your wallet; final only after this level closes.</p>}
            <p className="text-sm text-emerald-900">{encourage(result.rank, result.gap_to_next_ms, isSlower)}</p>
            <div className="flex flex-wrap gap-2">
              {result.nextLevel && result.action === 'next_level' && <button type="button" onClick={() => { setResult(null); setSelectedLevel(result.nextLevel === 'champion' ? 'champion' : `L${result.nextLevel}`); }} className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-bold text-white">Next Level</button>}
              <button type="button" onClick={() => { setResult(null); startLevel(); }} disabled={!currentProgress?.playable || result.action === 'next_level'} className="inline-flex items-center gap-2 rounded-md border border-emerald-800 px-4 py-2 text-sm font-bold text-emerald-950 disabled:opacity-40"><RotateCcw className="h-4 w-4" /> Retry</button>
            </div>
          </div>}

          {!result && !session && <button type="button" onClick={startLevel} disabled={busy || !currentProgress?.playable} className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40" data-testid="memory-start">{currentProgress?.action === 'retry' ? 'Retry' : 'Start level'}</button>}
          {session && <div className="flex justify-between text-xs text-slate-500"><span>Clicks: {clickCount}</span><span>{matched.length / 2} / {session.card_count / 2} pairs matched</span></div>}
        </section>

        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4" aria-label="Level leaderboard">
          <div className="flex flex-wrap gap-2">
            <label className="min-w-28 flex-1"><span className="mb-1 block text-xs font-bold text-slate-600">Champion Selection / GC</span>
              <select value={leaderboardGC} onChange={(event) => setLeaderboardGC(Number(event.target.value))} className="h-10 w-full rounded-md border border-slate-300 px-2 text-sm">{gcOptions.map((gc) => <option key={gc} value={gc}>GC{gc}</option>)}</select>
            </label>
            <label className="min-w-36 flex-1"><span className="mb-1 block text-xs font-bold text-slate-600">Level Selection</span>
              <select value={leaderboardLevel} onChange={(event) => setLeaderboardLevel(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-2 text-sm">{levelOptions.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
            </label>
          </div>
          <div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">GC{leaderboardGC} · {levelOptions.find(([value]) => value === leaderboardLevel)?.[1]}</h2><span className="text-xs text-slate-500">Fastest successful time wins</span></div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-700" data-testid="leaderboard-rewards">
            {leaderboardLevel === 'champion'
              ? (leaderboard?.champion_rewards || []).map((award) => <span key={award.rank} className="rounded border border-amber-200 bg-amber-50 px-2 py-1">{award.rank}: {award.champion_prize_tokens} Champion + {award.accumulated_bonus_tokens} Bonus Tokens</span>)
              : [1, 2, 3, 4, 5].map((rank) => <span key={rank} className="rounded border border-amber-200 bg-amber-50 px-2 py-1">{rank}: {leaderboard?.rewards?.[String(rank)] ?? defaultRewards[String(rank)]} Bonus Tokens</span>)}
          </div>
          <ol className="divide-y divide-slate-100" data-testid="every-level-leaderboard">
            {(leaderboard?.leaderboard || []).slice(0, 20).map((row) => <li key={row.user_id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="flex items-center gap-2"><b className="w-7 text-slate-500">#{row.rank}</b>{row.rank === 1 && <Crown className="h-4 w-4 text-amber-600" />}{row.user_name}<VerifiedReviewerBadge show={row.verified_reviewer} testid={`fw-every-verified-${row.rank}`} /></span><span className="font-mono font-semibold tabular-nums">{formatTime(row.duration_ms)}</span></li>)}
            {!leaderboardRows.length && <li className="py-6 text-center text-sm text-slate-500">No successful times yet.</li>}
          </ol>
          <div className="text-xs text-slate-500">{leaderboard?.reward_status === 'finalized' ? 'Finalized leaderboard and locked rewards.' : 'Ranks and rewards are provisional until the next level opens.'}</div>
        </section>
      </div>
    </div>
  </main>;
}