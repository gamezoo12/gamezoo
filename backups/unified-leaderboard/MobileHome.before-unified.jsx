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
import HowToPlaySection from '../home/HowToPlaySection';
import CompetitionCard from '../CompetitionCard';

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
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold tracking-wide transition ${active ? 'text-[#FFD54A] border-b-2 border-[#FFD54A]' : 'text-white border-b-2 border-transparent'}`}
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
      {/* Compact mobile hero — same slot the promo banner used to occupy.
          Kept small on purpose (per spec: "don't increase the size"). */}
      <div className="mb-4 rounded-2xl overflow-hidden relative bg-gradient-to-br from-[#3E0BAA] via-[#6C2BFF] to-[#8B5CFF] px-4 py-3 shadow" data-testid="mobile-hero-strip">
        <div className="pointer-events-none absolute -right-6 -top-6 w-24 h-24 rounded-full bg-[#FFD54A]/25 blur-2xl" />
        <div className="pointer-events-none absolute -left-4 -bottom-6 w-20 h-20 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="font-display font-extrabold tracking-tight leading-none text-[22px] bg-gradient-to-r from-[#FFE68A] via-[#FFD54A] to-[#FFB020] bg-clip-text text-transparent">
            PRIZE LEAGUE
          </div>
          <div className="font-display font-bold text-white text-[13px] mt-1">
            Play. Compete. Win.
          </div>
        </div>
      </div>
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
                <img src={c.image} alt={c.title} className="w-full h-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} />
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
        <div className="text-center py-16 text-white text-sm">No contests live right now. Check back soon.</div>
      ) : (
        <div className="space-y-4" data-testid="mobile-contest-list">
          {contests.map(c => (
            <CompetitionCard
              key={c.contest_id}
              c={{
                id: c.contest_id, contest_id: c.contest_id,
                slug: c.slug || c.contest_id,
                title: c.title, subtitle: c.subtitle || c.tag, tag: c.tag,
                price: c.price, ticketsSold: c.tickets_sold, ticketsTotal: c.tickets_total,
                endDate: c.end_date || c.end_time, image: c.image,
              }}
            />
          ))}
        </div>
      )}

      {/* HOW IT WORKS — restored under the Contests grid per user's iter39 ask.
          The component already ships with mobile-friendly compact styling. */}
      <div className="mt-8 -mx-4">
        <HowToPlaySection compact />
      </div>
    </div>
  );
}

/* -------------------------------- LEADERBOARD ------------------------------ */
function LeaderboardPanel({ contests }) {
  const [selectedId, setSelectedId] = useState(() => contests[0]?.contest_id);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!selectedId && contests[0]) {
      setSelectedId(contests[0].contest_id);
    }
  }, [contests, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setEntries([]);
      return;
    }

    setLoading(true);

    gamesAPI
      .leaderboard(selectedId, 100)
      .then((response) => {
        setEntries(response?.entries || response?.leaderboard || []);
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const selected = contests.find(
    (contest) => String(contest.contest_id) === String(selectedId)
  );

  const getScore = (entry) =>
    Number(entry.normalized_score ?? entry.points ?? entry.score ?? 0);

  const getAccuracy = (entry) => {
    if (entry.accuracy_pct != null) {
      return Number(entry.accuracy_pct);
    }

    const accuracy = Number(entry.accuracy || 0);
    return accuracy <= 1 ? accuracy * 100 : accuracy;
  };

  const getDurationMs = (entry) => {
    if (entry.duration_ms != null) {
      return Number(entry.duration_ms);
    }

    if (entry.duration_s != null) {
      return Number(entry.duration_s) * 1000;
    }

    return 0;
  };

  const formatTime = (durationMs) => {
    const safe = Math.max(0, Math.floor(Number(durationMs) || 0));
    const minutes = Math.floor(safe / 60000);
    const seconds = Math.floor((safe % 60000) / 1000);
    const milliseconds = safe % 1000;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
      2,
      '0'
    )}.${String(milliseconds).padStart(3, '0')}`;
  };

  const topThree = entries.slice(0, 3);
  const remainingEntries = entries.slice(3);

  const myRow = user
    ? entries.find(
        (entry) =>
          entry.is_current_user ||
          String(entry.user_id) === String(user.user_id)
      )
    : null;

  const podiumOrder = [
    { index: 1, rank: 2 },
    { index: 0, rank: 1 },
    { index: 2, rank: 3 },
  ];

  const podiumStyle = {
    1: {
      tile: 'bg-gradient-to-b from-[#FFD54A] via-[#FFB020] to-orange-500',
      height: 'min-h-[150px]',
      label: '1st',
      icon: '🥇',
    },
    2: {
      tile: 'bg-gradient-to-b from-slate-300 to-slate-500',
      height: 'min-h-[125px]',
      label: '2nd',
      icon: '🥈',
    },
    3: {
      tile: 'bg-gradient-to-b from-amber-600 to-amber-900',
      height: 'min-h-[110px]',
      label: '3rd',
      icon: '🥉',
    },
  };

  return (
    <div className="px-3 pt-3 pb-8">
      <select
        value={selectedId || ''}
        onChange={(event) => setSelectedId(event.target.value)}
        data-testid="mobile-lb-select"
        className="mb-3 w-full rounded-xl border border-white/10 bg-[#161433] px-3 py-3 text-sm font-semibold text-white"
      >
        {contests.length === 0 && (
          <option value="">No contests available</option>
        )}

        {contests.map((contest) => (
          <option
            key={contest.contest_id}
            value={contest.contest_id}
            className="bg-slate-900"
          >
            {contest.title}
          </option>
        ))}
      </select>

      <div className="mb-4 rounded-2xl bg-gradient-to-br from-slate-900 via-fuchsia-900 to-orange-800 px-4 py-4 text-white">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">
          Contest Leaderboard
        </div>

        <h2 className="mt-1 font-display text-xl font-extrabold leading-tight">
          {selected?.title || 'Select a contest'}
        </h2>

        <div className="mt-1 text-[10px] text-white">
          Score → accuracy → completion time
        </div>
      </div>

      {loading ? (
        <div className="py-14 text-center text-sm text-white">
          Loading rankings…
        </div>
      ) : (
        <>
          <div
            className="mb-3 grid grid-cols-3 items-end gap-1.5"
            data-testid="mobile-leaderboard-podium"
          >
            {podiumOrder.map(({ index, rank }) => {
              const player = topThree[index];
              const style = podiumStyle[rank];

              return (
                <div
                  key={rank}
                  className={`${style.tile} ${style.height} flex flex-col items-center justify-end rounded-lg px-1.5 py-2 text-center text-white shadow-lg`}
                  data-testid={`mobile-podium-${rank}`}
                >
                  <div className="mb-0.5 text-xl">{style.icon}</div>

                  <div className="text-[9px] font-black uppercase tracking-wide">
                    {style.label}
                  </div>

                  {player ? (
                    <>
                      <div className="mt-0.5 w-full truncate text-[11px] font-extrabold">
                        {player.user_name || player.username || 'Player'}
                      </div>

                      <div className="mt-0.5 font-display text-lg font-black">
                        {getScore(player).toFixed(2)}
                      </div>

                      <div className="mt-0.5 text-[8px] leading-tight text-white">
                        {getAccuracy(player).toFixed(2)}%
                      </div>

                      <div className="text-[8px] leading-tight text-white">
                        {formatTime(getDurationMs(player))}
                      </div>

                      <div className="text-[8px] leading-tight text-white">
                        {player.attempts || 1} attempt
                        {(player.attempts || 1) !== 1 ? 's' : ''}
                      </div>
                    </>
                  ) : (
                    <div className="mt-1 text-[8px] text-white">
                      Waiting for player
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {myRow && (
            <div
              className="mb-3 rounded-xl border-2 border-[#FFD54A] bg-[#FFD54A]/25 p-2.5"
              data-testid="mobile-lb-me"
            >
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#FFD54A]">
                Your Position
              </div>

              <div className="grid grid-cols-[42px_1fr_auto] items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFD54A] font-black text-slate-900">
                  #{myRow.rank}
                </div>

                <div className="min-w-0">
                  <div className="truncate text-sm font-extrabold text-white">
                    You
                  </div>

                  <div className="mt-0.5 text-[9px] text-white">
                    {getAccuracy(myRow).toFixed(2)}% accuracy ·{' '}
                    {formatTime(getDurationMs(myRow))} ·{' '}
                    {myRow.attempts || 1} attempt
                    {(myRow.attempts || 1) !== 1 ? 's' : ''}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-display text-xl font-black text-[#FFD54A]">
                    {getScore(myRow).toFixed(2)}
                  </div>

                  <div className="text-[8px] uppercase text-white">
                    / 100
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-white/20 bg-[#161433]">
            <div className="grid grid-cols-[34px_1fr_58px_70px_42px_52px] gap-1 border-b border-white/20 bg-[#241B49] px-2 py-2 text-[8px] font-bold uppercase tracking-wide text-white">
              <span>Rank</span>
              <span>Name</span>
              <span className="text-center">Accuracy</span>
              <span className="text-center">Time</span>
              <span className="text-center">Used</span>
              <span className="text-right">Score</span>
            </div>

            {entries.length === 0 ? (
              <div className="py-12 text-center text-sm text-white">
                No verified scores yet.
              </div>
            ) : remainingEntries.length === 0 ? (
              <div className="py-8 text-center text-xs text-white">
                More player rankings will appear here.
              </div>
            ) : (
              <ul
                className="divide-y divide-white/10"
                data-testid="mobile-lb-list"
              >
                {remainingEntries.map((entry) => {
                  const isMe =
                    user &&
                    (entry.is_current_user ||
                      String(entry.user_id) === String(user.user_id));

                  return (
                    <li
                      key={
                        entry.user_id ||
                        `${entry.rank}-${entry.public_id || 'player'}`
                      }
                      className={`grid grid-cols-[34px_1fr_58px_70px_42px_52px] items-center gap-1 px-2 py-2 bg-[#161433] ${
                        isMe ? 'bg-[#FFD54A]/25' : ''
                      }`}
                      data-testid={`mobile-lb-row-${entry.rank}`}
                    >
                      <div className="text-[10px] font-black text-[#FFD54A]">
                        #{entry.rank}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-[10px] font-bold text-white">
                          {isMe
                            ? 'You'
                            : entry.user_name ||
                              entry.username ||
                              'Player'}
                        </div>

                        {entry.public_id && (
                          <div className="truncate font-mono text-[7px] text-white">
                            #{entry.public_id}
                          </div>
                        )}
                      </div>

                      <div className="text-center text-[9px] text-white">
                        {getAccuracy(entry).toFixed(2)}%
                      </div>

                      <div className="text-center font-mono text-[8px] text-white">
                        {formatTime(getDurationMs(entry))}
                      </div>

                      <div className="text-center text-[9px] text-white">
                        {entry.attempts || 1}
                      </div>

                      <div className="text-right font-display text-[11px] font-black text-[#FFD54A]">
                        {getScore(entry).toFixed(2)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
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
      <div className="px-4 pt-8 text-center text-white">
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
          <div className="text-[10px] uppercase text-white tracking-wider">Total tickets</div>
          <div className="font-display text-2xl font-extrabold text-[#FFD54A]">{stats.total_tickets}</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="text-[10px] uppercase text-white tracking-wider">Pending games</div>
          <div className="font-display text-2xl font-extrabold text-[#FFD54A]">{stats.pending_games}</div>
        </div>
      </div>
      <h2 className="font-display font-extrabold text-lg text-white mb-2">Play now</h2>
      {playable.length === 0 ? (
        <div className="text-center py-10 text-white text-sm">
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
                <div className="text-[10px] text-white">{t.contest?.game_type || 'Skill game'} · Ticket #{t.ticket_number}</div>
              </div>
              <div className="bg-[#FFD54A] text-slate-900 font-extrabold text-[10px] rounded-full px-2 py-0.5">1 attempt</div>
              <ChevronRight className="w-4 h-4 text-white" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
