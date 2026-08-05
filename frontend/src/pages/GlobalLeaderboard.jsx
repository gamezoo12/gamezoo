import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gamesAPI, contestsAPI } from '../lib/api';
import { Crown, Flame, Zap, Target, Zap as SpeedIcon, TrendingUp, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Global leaderboard — 2026-08 redesign.
 * Aesthetic: deep-purple stage, gold spotlight on the winner, gradient number
 * tiles for #2/#3, magnetic hover on rows, live-refresh every 15s. Replaces
 * the previous mixed-teal/orange design.
 */
export default function GlobalLeaderboard() {
  const [rows, setRows] = useState([]);
  const [contests, setContests] = useState([]);
  const [tab, setTab] = useState('global');
  const { user } = useAuth();

  useEffect(() => {
    const load = () => gamesAPI.globalLeaderboard(50).then(r => setRows(r?.leaderboard || [])).catch(() => {});
    load();
    contestsAPI.list().then(list => setContests(list.filter(c => c.game_type))).catch(() => {});
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#0B0D1F]" data-testid="global-leaderboard-page">
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8 md:py-12">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl mb-6 border border-white/5" style={{
          background: 'radial-gradient(120% 100% at 0% 0%, #6C2BFF33 0%, transparent 50%), radial-gradient(120% 100% at 100% 100%, #FFD54A22 0%, transparent 55%), linear-gradient(180deg, #161433 0%, #0B0D1F 100%)',
        }}>
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-[#FFD54A]/10 blur-3xl" />
          <div className="absolute -left-20 -bottom-20 w-72 h-72 rounded-full bg-[#6C2BFF]/25 blur-3xl" />
          <div className="relative p-6 md:p-10">
            <div className="text-[#FFD54A]/90 text-[11px] uppercase tracking-[0.35em] font-bold flex items-center gap-2">
              <Flame className="w-4 h-4" /> Prize League leaderboard
            </div>
            <h1 className="font-display text-4xl md:text-6xl font-black text-white mt-3 leading-[0.95]">
              Top players. <span className="bg-gradient-to-r from-[#FFE68A] via-[#FFD54A] to-[#FF9A3C] bg-clip-text text-transparent">Live.</span>
            </h1>
            <p className="text-white/60 text-sm md:text-base mt-3 max-w-xl">
              Every score across every contest — normalized to 100. Auto-refreshes every 15 seconds. Tie-break: accuracy → speed.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 -mx-1 px-1 no-scrollbar" data-testid="leaderboard-tabs">
          <TabPill active={tab === 'global'} onClick={() => setTab('global')} testid="tab-global">
            <Zap className="w-3.5 h-3.5" /> Global
          </TabPill>
          {contests.map(c => (
            <TabPill
              key={c.contest_id}
              active={tab === c.contest_id}
              onClick={() => setTab(c.contest_id)}
              testid={`tab-contest-${c.contest_id}`}
            >
              {c.title.length > 22 ? `${c.title.slice(0, 22)}…` : c.title}
            </TabPill>
          ))}
        </div>

        {tab === 'global' ? <GlobalBoard rows={rows} user={user} /> : <ContestBoard contestId={tab} user={user} />}
      </div>
    </div>
  );
}

function TabPill({ active, onClick, testid, children }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider whitespace-nowrap transition ${
        active
          ? 'bg-[#FFD54A] text-slate-900 shadow-[0_6px_24px_-6px_#FFD54A88]'
          : 'bg-white/5 text-white/70 border border-white/10 hover:text-white hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

function GlobalBoard({ rows, user }) {
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  return (
    <>
      {top3.length > 0 && <Podium top3={top3} user={user} />}
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-6 rounded-2xl bg-[#161433]/70 border border-white/5 overflow-hidden backdrop-blur">
          <ul className="divide-y divide-white/5" data-testid="global-list">
            {rest.map(p => (
              <BoardRow
                key={p.user_id}
                rank={p.rank}
                name={p.user_name}
                sub={`${p.contests_played} contest${p.contests_played !== 1 ? 's' : ''} · ${(p.total_points || 0).toLocaleString()} pts`}
                score={p.normalized_score}
                isMe={user && p.user_id === user.user_id}
              />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function ContestBoard({ contestId, user }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const load = () => gamesAPI.leaderboard(contestId, 100).then(r => setRows(r?.entries || r?.leaderboard || [])).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [contestId]);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  return (
    <div data-testid="contest-board">
      {top3.length > 0 && <Podium top3={top3} user={user} />}
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-6 rounded-2xl bg-[#161433]/70 border border-white/5 overflow-hidden backdrop-blur">
          <ul className="divide-y divide-white/5" data-testid="contest-list">
            {rest.map(r => {
              const durS = r.duration_s ?? (r.duration_ms ? +(r.duration_ms / 1000).toFixed(2) : 0);
              const accPct = r.accuracy_pct ?? Math.round((r.accuracy || 0) * 100);
              return (
                <BoardRow
                  key={r.user_id}
                  rank={r.rank}
                  name={r.user_name}
                  sub={<span className="inline-flex items-center gap-2"><Target className="w-3 h-3" /> {accPct}% <span className="text-white/30">·</span> <SpeedIcon className="w-3 h-3" /> {typeof durS === 'number' ? durS.toFixed(2) : durS}s</span>}
                  score={r.normalized_score}
                  isMe={user && r.user_id === user.user_id}
                />
              );
            })}
          </ul>
          <div className="p-3 text-[10px] text-white/40 text-center uppercase tracking-widest">
            Scores normalized 0–100 · leader = 100.00
          </div>
        </div>
      )}
    </div>
  );
}

function Podium({ top3, user }) {
  // Order visually: 2nd — 1st (taller, center) — 3rd
  const order = [1, 0, 2];
  const heights = ['h-40', 'h-52', 'h-32'];
  const offsets = ['pt-8', 'pt-0', 'pt-16'];
  const grads = [
    'from-slate-200 via-slate-300 to-slate-500',       // silver
    'from-[#FFE68A] via-[#FFD54A] to-[#FF9A3C]',       // gold
    'from-[#F0A56D] via-[#B4703F] to-[#7A4522]',       // bronze
  ];
  const rings = ['ring-slate-400/30', 'ring-[#FFD54A]/40', 'ring-[#B4703F]/30'];
  const labels = ['SILVER', 'GOLD', 'BRONZE'];
  return (
    <div className="grid grid-cols-3 gap-3" data-testid="podium">
      {order.map((idx, colIdx) => {
        const p = top3[idx];
        if (!p) return <div key={idx} className={heights[colIdx] + ' ' + offsets[colIdx]} />;
        const isMe = user && p.user_id === user.user_id;
        return (
          <div key={p.user_id} className={`${offsets[colIdx]}`} data-testid={`podium-rank-${p.rank}`}>
            <div className={`relative rounded-3xl overflow-hidden ${heights[colIdx]} bg-gradient-to-b ${grads[colIdx]} p-3 md:p-4 shadow-2xl ring-2 ${rings[colIdx]} flex flex-col items-center justify-end text-center`}>
              {idx === 0 && (
                <Crown className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-8 text-[#FFD54A] drop-shadow" />
              )}
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/25 flex items-center justify-center font-black text-white text-lg md:text-xl mb-2 border-2 border-white/40">
                {p.user_name?.[0]?.toUpperCase() || 'P'}
              </div>
              <div className="text-white/95 font-extrabold text-xs md:text-sm truncate w-full">
                {p.user_name || 'Player'}
                {isMe && <span className="ml-1 text-[8px] px-1 py-0.5 rounded bg-black/40 text-[#FFD54A] align-middle">YOU</span>}
              </div>
              <div className="font-display text-2xl md:text-3xl font-black text-white leading-none mt-1">
                {(p.normalized_score ?? 0).toFixed(2)}
              </div>
              <div className="text-white/75 text-[10px] uppercase tracking-widest mt-0.5">{labels[colIdx]}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardRow({ rank, name, sub, score, isMe }) {
  return (
    <li
      data-testid={`lb-row-${rank}`}
      className={`flex items-center gap-3 px-4 md:px-5 py-3 transition ${
        isMe
          ? 'bg-gradient-to-r from-[#FFD54A]/15 via-[#FFD54A]/5 to-transparent border-l-4 border-[#FFD54A]'
          : 'hover:bg-white/[0.03]'
      }`}
    >
      <div className={`w-10 h-10 rounded-xl grid place-items-center font-black text-sm shrink-0 ${
        isMe
          ? 'bg-[#FFD54A] text-slate-900'
          : rank <= 10
            ? 'bg-white/10 text-white ring-1 ring-white/10'
            : 'bg-white/[0.04] text-white/60'
      }`}>#{rank}</div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-bold truncate flex items-center gap-1.5">
          {isMe ? 'You' : (name || 'Player')}
          {isMe && <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-[#FFD54A] font-extrabold tracking-wider">YOU</span>}
        </div>
        <div className="text-[11px] text-white/50">{sub}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-display text-xl md:text-2xl font-black text-[#FFD54A]">{(Number(score) || 0).toFixed(2)}</div>
        <div className="text-[9px] text-white/40 uppercase tracking-widest">/ 100</div>
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-[#161433]/70 border border-white/5 p-10 text-center text-white/60" data-testid="empty-global">
      <TrendingUp className="w-8 h-8 mx-auto text-white/20 mb-2" />
      No scores yet. Be the first on the board!
      <div className="mt-4">
        <Link to="/competitions" className="text-[#FFD54A] font-extrabold hover:underline inline-flex items-center gap-1">
          Browse contests <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
