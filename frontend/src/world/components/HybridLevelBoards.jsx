import { VerifiedReviewerBadge } from '../../components/VerifiedReviewerBadge';
import { useEffect, useState } from 'react';
import { Clock, Crown, Lock } from 'lucide-react';
import { worldGcCompetitionAPI } from '../../lib/api';
import { GAME_CATALOG } from '../../lib/gameCatalog';

const fmt = (ms) => {
  if (ms == null) return '—';
  const v = Math.max(0, Math.floor(Number(ms)));
  return `${String(Math.floor(v / 60000)).padStart(2, '0')}:${String(Math.floor((v % 60000) / 1000)).padStart(2, '0')}.${String(v % 1000).padStart(3, '0')}`;
};
const gameName = (id) => (id === 'colour_match' ? 'Colour Match' : id === 'number_sequence' ? 'Number Sequence' : GAME_CATALOG.find((g) => g.id === id)?.label || id || '—');
const initials = (n) => (String(n || 'P').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('') || 'P').toUpperCase();

// Loads all 10 level boards for a GC (read-only); levels without Every-Level results come back disabled.
export function useHybridLevelBoards(gcNumber, refreshKey = 0) {
  const [boards, setBoards] = useState(null);
  useEffect(() => {
    setBoards(null);
    if (!gcNumber || gcNumber < 4) { setBoards([]); return undefined; }
    let active = true;
    Promise.all(Array.from({ length: 10 }, (_, i) => worldGcCompetitionAPI.levelBoard(gcNumber, i + 1).catch(() => null)))
      .then((rows) => { if (active) setBoards(rows); });
    return () => { active = false; };
  }, [gcNumber, refreshKey]);
  return boards;
}

export function LevelLeaderboardPanel({ gcNumber, boards, isMine }) {
  const enabled = (boards || []).filter((b) => b?.enabled && b.status !== 'Upcoming');
  const upcoming = (boards || []).filter((b) => b?.enabled && b.status === 'Upcoming').length;
  const [level, setLevel] = useState(null);
  useEffect(() => { setLevel(enabled[0]?.level || null); }, [boards]); // eslint-disable-line react-hooks/exhaustive-deps
  const board = enabled.find((b) => b.level === level);
  if (!boards) return <div className="pl-global-lb-card pl-global-lb-state" data-testid="lb-level-loading"><span className="pl-global-lb-spin" /><p>Loading level rankings…</p></div>;
  return (
    <>
      <div className="pl-global-lb-card" data-testid="lb-level-picker">
        <div className="pl-global-lb-sectlbl">CHOOSE LEVEL · GC{gcNumber || '—'}</div>
        <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const on = enabled.some((b) => b.level === n);
            return <button key={n} type="button" disabled={!on} onClick={() => setLevel(n)} data-testid={`lb-level-btn-${n}`} title={on ? `Level ${n}` : 'No level leaderboard for this level'}
              className={`flex h-11 items-center justify-center gap-1 rounded-xl text-sm font-black transition-colors ${n === level ? 'bg-[#6C2BFF] text-white shadow-lg' : on ? 'bg-[#f1edff] text-[#3b2a85] hover:bg-[#e4dcff]' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`}>
              {!on && <Lock size={11} />}L{n}</button>;
          })}
        </div>
        {!enabled.length && <p className="mt-3 text-sm text-slate-500" data-testid="lb-level-none">No level leaderboards for this GC. {upcoming ? `${upcoming} Every-Level levels are scheduled; rankings appear when each level opens.` : 'Level rankings appear only for Every-Level competitions that have opened.'}</p>}
      </div>
      {board && <div className="pl-global-lb-card pl-global-lb-rankings" data-testid="lb-level-board">
        <div className="pl-global-lb-rankhead"><h2>LEVEL {board.level} RANKINGS</h2><span className="pl-global-lb-updates" data-testid="lb-level-status">{board.status}</span></div>
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-xl bg-[#f7f5ff] p-2"><div className="text-slate-500">Game</div><b data-testid="lb-level-game">{gameName(board.game_id)}</b></div>
          <div className="rounded-xl bg-[#f7f5ff] p-2"><div className="text-slate-500">Your best</div><b className="font-mono" data-testid="lb-level-my-best">{fmt(board.mine?.personal_best_ms)}</b></div>
          <div className="rounded-xl bg-[#f7f5ff] p-2"><div className="text-slate-500">Your rank</div><b data-testid="lb-level-my-rank">{board.mine?.rank ? `#${board.mine.rank}` : '—'}</b></div>
          <div className="rounded-xl bg-[#f7f5ff] p-2"><div className="text-slate-500">Rewards</div><b>{board.reward_status === 'finalized' ? 'Finalized' : 'Provisional'}</b></div>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5 text-[11px]" data-testid="lb-level-rewards">
          {[1, 2, 3, 4, 5].map((r) => <span key={r} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-900">#{r}: {board.rewards?.[String(r)] ?? 0} Bonus Tokens</span>)}
        </div>
        {board.leaderboard.length ? <div className="pl-global-lb-tablewrap" data-testid="lb-level-list">
          {board.leaderboard.map((r) => <div key={r.rank} style={{ gridTemplateColumns: "48px 1fr 110px" }} className={`pl-global-lb-tr ${r.rank <= 3 ? `top top-${r.rank}` : ''} ${isMine?.(r) ? 'is-me' : ''}`} data-testid="lb-level-row">
            <span className="pl-global-lb-rankcell"><b>{r.rank}</b>{r.rank === 1 && <span className="pl-global-lb-rk gold"><Crown size={12} /></span>}</span>
            <span className="pl-global-lb-player"><span className={`pl-global-lb-av r${r.rank <= 3 ? r.rank : ''}`}>{initials(r.user_name)}</span><span className="pl-global-lb-pn">{r.user_name || 'Player'} <VerifiedReviewerBadge show={r.verified_reviewer} testid={`fw-level-verified-${r.rank}`} /></span></span>
            <span className="pl-global-lb-time"><Clock size={12} /> {fmt(r.duration_ms)}</span>
          </div>)}
        </div> : <div className="pl-global-lb-state" data-testid="lb-level-empty"><p>No successful times yet for Level {board.level}.</p></div>}
      </div>}
    </>
  );
}
