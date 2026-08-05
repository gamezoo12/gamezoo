/**
 * MobileHome — the entire redesigned mobile experience (<768px) in one
 * self-contained component. Wrapped by `md:hidden` at the mount site and
 * paired with `hidden md:block` on the desktop Home markup so desktop UI is
 * BYTE-FOR-BYTE untouched.
 *
 * Three tabs, each hitting the same live API methods the desktop pages use
 * (contestsAPI.list, gamesAPI.leaderboard, contestsAPI.myGames, ordersAPI.myTickets)
 * — no mock, no seed, no new endpoints.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Gamepad2, ListChecks, Trophy, ChevronRight, Sparkles, Target, Zap as SpeedIcon } from 'lucide-react';
import { contestsAPI, gamesAPI, ordersAPI } from '../../lib/api';
import { tokenCount, tokens as fmtTokens } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';

const TABS = [
  { id: 'contests',    label: 'Contests',    Icon: ListChecks },
  { id: 'leaderboard', label: 'Leaderboard', Icon: Trophy },
  { id: 'games',       label: 'Games',       Icon: Gamepad2 },
];

export default function MobileHome() {
  const [tab, setTab] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('m');
    return TABS.find(t => t.id === p) ? p : 'contests';
  });
  const [contests, setContests] = useState([]);
  useEffect(() => {
    contestsAPI.list({ status: 'live', limit: 24 }).then(r => setContests(r?.contests || r || [])).catch(() => setContests([]));
  }, []);
  // Persist the active tab in the URL (?m=leaderboard) so back-button + deep links work.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === 'contests') url.searchParams.delete('m'); else url.searchParams.set('m', tab);
    window.history.replaceState({}, '', url.toString());
  }, [tab]);

  return (
    <div className="min-h-screen bg-[#0b0716] text-white pb-24" data-testid="mobile-home-root">
      {/* Sticky tab bar directly under the mobile header (site header injected outside). */}
      <div className="sticky top-14 z-30 bg-[#0b0716]/95 backdrop-blur border-b border-white/5" data-testid="mobile-tabs">
        <div className="flex">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                data-testid={`mobile-tab-${id}`}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold tracking-wide transition ${active ? 'text-[#FFD54A] border-b-2 border-[#FFD54A]' : 'text-white/60 border-b-2 border-transparent'}`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'contests' && <ContestsPanel contests={contests} />}
      {tab === 'leaderboard' && <LeaderboardPanel contests={contests} />}
      {tab === 'games' && <GamesPanel />}
    </div>
  );
}

/* --------------------------------- CONTESTS -------------------------------- */
function ContestsPanel({ contests }) {
  const featured = contests.slice(0, 5);
  const [heroIdx, setHeroIdx] = useState(0);
  // Auto-rotate hero every 5s. Pause when there's only one slide.
  useEffect(() => {
    if (featured.length < 2) return;
    const t = setInterval(() => setHeroIdx(i => (i + 1) % featured.length), 5000);
    return () => clearInterval(t);
  }, [featured.length]);

  return (
    <div className="px-4 pt-4">
      {/* Hero carousel */}
      {featured.length > 0 && (
        <div className="mb-6" data-testid="mobile-hero-carousel">
          <div className="rounded-2xl overflow-hidden aspect-[16/10] relative bg-slate-800">
            {featured.map((c, i) => (
              <Link
                key={c.contest_id}
                to={`/contests/${c.slug || c.contest_id}`}
                className={`absolute inset-0 transition-opacity duration-500 ${i === heroIdx ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                data-testid={`mobile-hero-slide-${i}`}
              >
                <img src={c.image || c.hero_image} alt={c.title} className="w-full h-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <div className="font-display font-extrabold text-lg text-white leading-tight line-clamp-2">{c.title}</div>
                  {c.prize_title && <div className="text-[11px] text-[#FFD54A] font-bold mt-0.5">🎁 {c.prize_title}</div>}
                  <div className="mt-2 inline-flex items-center gap-1 bg-[#FFD54A] text-slate-900 rounded-full px-3 py-1 text-xs font-extrabold">
                    View contest <ChevronRight className="w-3 h-3" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {featured.length > 1 && (
            <div className="flex justify-center gap-1.5 mt-3">
              {featured.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setHeroIdx(i)}
                  aria-label={`Slide ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === heroIdx ? 'w-6 bg-[#FFD54A]' : 'w-1.5 bg-white/30'}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <h2 className="font-display font-extrabold text-xl text-white mb-3">Contests</h2>
      {contests.length === 0 ? (
        <div className="text-center py-16 text-white/50 text-sm">No contests live right now. Check back soon.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3" data-testid="mobile-contest-grid">
          {contests.map(c => (
            <Link
              key={c.contest_id}
              to={`/contests/${c.slug || c.contest_id}`}
              className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-[#FFD54A]/40 transition"
              data-testid={`mobile-contest-tile-${c.contest_id}`}
            >
              <div className="aspect-square bg-slate-800 overflow-hidden">
                <img src={c.image || c.hero_image} alt={c.title} loading="lazy" className="w-full h-full object-cover" />
              </div>
              <div className="p-2 flex items-center justify-between gap-2 text-xs">
                <div className="font-bold text-white truncate">{c.title}</div>
                <div className="shrink-0 flex items-center gap-0.5 text-[#FFD54A] font-extrabold">
                  {tokenCount(c.price)}<Coins className="w-3 h-3" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- LEADERBOARD ------------------------------ */
function LeaderboardPanel({ contests }) {
  const [selectedId, setSelectedId] = useState(() => contests[0]?.contest_id);
  const [entries, setEntries] = useState([]);
  const { user } = useAuth();

  // If contests load AFTER the panel mounts, auto-pick the first one.
  useEffect(() => { if (!selectedId && contests[0]) setSelectedId(contests[0].contest_id); }, [contests, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    gamesAPI.leaderboard(selectedId, 50).then(r => setEntries(r?.entries || r?.leaderboard || [])).catch(() => setEntries([]));
  }, [selectedId]);

  const selected = contests.find(c => c.contest_id === selectedId);
  const myRow = user && entries.find(e => e.user_id === user.user_id);

  return (
    <div className="px-4 pt-4">
      <select
        value={selectedId || ''}
        onChange={(e) => setSelectedId(e.target.value)}
        data-testid="mobile-lb-select"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-semibold mb-3"
      >
        {contests.length === 0 && <option>No contests yet</option>}
        {contests.map(c => <option key={c.contest_id} value={c.contest_id} className="bg-slate-900">{c.title}</option>)}
      </select>
      {selected && (
        <div className="mb-3 text-xs text-white/60">
          🎁 {selected.prize_title || 'Prize TBA'}
          {selected.end_time && <> · Ends {new Date(selected.end_time).toLocaleDateString('en-GB')}</>}
        </div>
      )}
      {myRow && (
        <div className="rounded-xl bg-[#FFD54A]/10 border-2 border-[#FFD54A]/40 p-3 mb-3 flex items-center gap-3" data-testid="mobile-lb-me">
          <div className="w-9 h-9 rounded-full bg-[#FFD54A] text-slate-900 font-extrabold flex items-center justify-center">#{myRow.rank}</div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-white text-sm">You · <span className="text-[10px] text-white/60">{(myRow.duration_s ?? 0).toFixed?.(2)}s · {myRow.accuracy_pct ?? 0}%</span></div>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-extrabold text-[#FFD54A]">{(myRow.normalized_score ?? 0).toFixed(2)}</div>
            <div className="text-[9px] text-white/50 uppercase">/ 100</div>
          </div>
        </div>
      )}
      {entries.length === 0 ? (
        <div className="text-center py-12 text-white/50 text-sm">No scores yet. Be the first to play.</div>
      ) : (
        <ul className="divide-y divide-white/5 bg-white/5 border border-white/10 rounded-xl overflow-hidden" data-testid="mobile-lb-list">
          {entries.slice(0, 25).map(r => {
            const name = r.user_name || r.username || (r.public_id ? r.public_id : 'Player');
            const isMe = user && r.user_id === user.user_id;
            const durS = r.duration_s ?? (r.duration_ms ? +(r.duration_ms / 1000).toFixed(2) : 0);
            return (
              <li key={r.user_id} className={`flex items-center gap-2 px-3 py-2 text-xs ${isMe ? 'bg-[#FFD54A]/15' : ''}`} data-testid={`mobile-lb-row-${r.rank}`}>
                <div className="w-6 text-center text-white/60 font-bold">{r.rank}</div>
                <div className="w-7 h-7 rounded-full bg-[#6C2BFF] text-white text-[10px] font-bold flex items-center justify-center">{(name[0] || 'P').toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-semibold truncate">{name}{isMe && <span className="ml-1 text-[9px] text-[#FFD54A]">YOU</span>}</div>
                  <div className="text-[10px] text-white/40">{durS}s · {r.accuracy_pct ?? 0}%</div>
                </div>
                <div className="text-right font-display font-extrabold text-[#FFD54A]">{(r.normalized_score ?? 0).toFixed(2)}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------- GAMES ---------------------------------- */
function GamesPanel() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  useEffect(() => {
    if (!user) return;
    ordersAPI.myTickets(200).then(r => setTickets(Array.isArray(r) ? r : (r?.tickets || []))).catch(() => setTickets([]));
  }, [user]);

  const playable = tickets.filter(t => (t.contest?.entry_mode || 'skill_game') === 'skill_game' && t.contest?.game_type && t.contest?.status !== 'ended');
  const stats = useMemo(() => ({
    total_tickets: tickets.length,
    pending_games: playable.length,
  }), [tickets, playable]);

  if (!user) {
    return (
      <div className="px-4 pt-8 text-center text-white/70">
        <Gamepad2 className="w-10 h-10 mx-auto mb-2 text-white/30" />
        <p className="text-sm">Sign in to play games and win prizes.</p>
        <Link to="/login" className="inline-block mt-3 bg-[#FFD54A] text-slate-900 font-extrabold rounded-full px-6 py-2 text-sm">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4">
      <div className="grid grid-cols-2 gap-3 mb-4" data-testid="mobile-game-summary">
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="text-[10px] uppercase text-white/50 tracking-wider">Total tickets</div>
          <div className="font-display text-2xl font-extrabold text-[#FFD54A]">{stats.total_tickets}</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="text-[10px] uppercase text-white/50 tracking-wider">Pending games</div>
          <div className="font-display text-2xl font-extrabold text-[#FFD54A]">{stats.pending_games}</div>
        </div>
      </div>
      <h2 className="font-display font-extrabold text-lg text-white mb-2">Play now</h2>
      {playable.length === 0 ? (
        <div className="text-center py-10 text-white/50 text-sm">
          <p>No pending games right now.</p>
          <Link to="/?m=contests" className="inline-block mt-3 text-[#FFD54A] font-bold">Browse contests →</Link>
        </div>
      ) : (
        <div className="space-y-2" data-testid="mobile-games-list">
          {playable.map(t => (
            <Link
              key={t.ticket_id}
              to={`/play/${t.contest?.contest_id || t.contest_id}/${t.ticket_id}`}
              className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3 hover:border-[#FFD54A]/40"
              data-testid={`mobile-game-tile-${t.ticket_id}`}
            >
              {t.contest?.image && (
                <img src={t.contest.image} alt="" loading="lazy" className="w-12 h-12 rounded-lg object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-sm truncate">{t.contest?.title || 'Contest'}</div>
                <div className="text-[10px] text-white/50">{t.contest?.game_type || 'Skill game'} · Ticket #{t.ticket_number}</div>
              </div>
              <div className="bg-[#FFD54A] text-slate-900 font-extrabold text-[10px] rounded-full px-2 py-0.5">1 attempt</div>
              <ChevronRight className="w-4 h-4 text-white/40" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
