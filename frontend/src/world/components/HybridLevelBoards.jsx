import { useEffect, useState } from 'react';
import { Crown, X } from 'lucide-react';
import { worldGcCompetitionAPI } from '../../lib/api';
import { GAME_CATALOG } from '../../lib/gameCatalog';

const fmt = (ms) => {
  if (ms == null) return '—';
  const cs = Math.floor(Math.max(0, Number(ms)) / 10);
  const s = Math.floor(cs / 100);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
const gameName = (id) => (id === 'colour_match' ? 'Colour Match' : id === 'number_sequence' ? 'Number Sequence' : GAME_CATALOG.find((g) => g.id === id)?.label || id);

export function useHybridLevelBoards(gcNumber) {
  const [boards, setBoards] = useState(null);
  useEffect(() => {
    if (!gcNumber || gcNumber < 4) return undefined;
    let active = true;
    Promise.all(Array.from({ length: 10 }, (_, i) => worldGcCompetitionAPI.levelBoard(gcNumber, i + 1).catch(() => null)))
      .then((rows) => { if (active) setBoards(rows); });
    return () => { active = false; };
  }, [gcNumber]);
  return boards;
}

export default function HybridLevelBoards({ gcNumber, boards, onClose }) {
  const enabled = (boards || []).filter((b) => b?.enabled);
  const [level, setLevel] = useState(enabled[0]?.level || 1);
  const board = enabled.find((b) => b.level === level) || enabled[0];
  if (!board) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onClose} data-testid="hybrid-level-boards">
      <section className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 text-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-black">GC{gcNumber} · Level leaderboards</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist">
          {enabled.map((b) => <button key={b.level} type="button" role="tab" aria-selected={b.level === board.level} onClick={() => setLevel(b.level)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${b.level === board.level ? 'bg-[#6C2BFF] text-white' : 'bg-slate-100 text-slate-700'}`} data-testid={`hybrid-level-tab-${b.level}`}>L{b.level}</button>)}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-slate-50 p-2"><dt className="text-slate-500">Game</dt><dd className="font-bold" data-testid="hybrid-level-game">{gameName(board.game_id)}</dd></div>
          <div className="rounded-lg bg-slate-50 p-2"><dt className="text-slate-500">Status</dt><dd className="font-bold" data-testid="hybrid-level-status">{board.status}</dd></div>
          <div className="rounded-lg bg-slate-50 p-2"><dt className="text-slate-500">Your best</dt><dd className="font-mono font-bold">{fmt(board.mine?.personal_best_ms)}</dd></div>
          <div className="rounded-lg bg-slate-50 p-2"><dt className="text-slate-500">Your rank</dt><dd className="font-bold" data-testid="hybrid-level-rank">{board.mine?.rank ? `#${board.mine.rank}` : '—'}</dd></div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]" data-testid="hybrid-level-rewards">
          {[1, 2, 3, 4, 5].map((r) => <span key={r} className="rounded border border-amber-200 bg-amber-50 px-2 py-1">#{r}: {board.rewards?.[String(r)] ?? 0} Bonus Tokens</span>)}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">{board.reward_status === 'finalized' ? 'Finalized rewards.' : 'Provisional rewards; credited only after finalization.'}</p>
        <ol className="mt-3 divide-y divide-slate-100" data-testid="hybrid-level-leaderboard">
          {board.leaderboard.map((row) => <li key={row.rank} className="flex items-center justify-between py-1.5 text-sm">
            <span className="flex items-center gap-2"><b className="w-7 text-slate-500">#{row.rank}</b>{row.rank === 1 && <Crown className="h-4 w-4 text-amber-600" />}{row.user_name}</span>
            <span className="font-mono font-semibold tabular-nums">{fmt(row.duration_ms)}</span></li>)}
          {!board.leaderboard.length && <li className="py-5 text-center text-sm text-slate-500">No successful times yet.</li>}
        </ol>
      </section>
    </div>
  );
}
