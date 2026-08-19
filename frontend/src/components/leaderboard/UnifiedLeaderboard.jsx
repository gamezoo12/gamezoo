import { useEffect, useState } from 'react';
import { gamesAPI } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function UnifiedLeaderboard({
  contests: suppliedContests = [],
  initialContestId = null,
}) {
  const contests = suppliedContests;
  const [selectedId, setSelectedId] = useState(
    () => initialContestId || contests[0]?.contest_id
  );
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (initialContestId) {
      setSelectedId(initialContestId);
      return;
    }

    if (!selectedId && contests[0]) {
      setSelectedId(contests[0].contest_id);
    }
  }, [contests, selectedId, initialContestId]);

  useEffect(() => {
    if (!selectedId) {
      setEntries([]);
      return;
    }

    setLoading(true);

    gamesAPI
      .leaderboard(selectedId, 100)
      .then((response) => {
        const normalizedEntries = Array.isArray(response)
          ? response
          : Array.isArray(response?.entries)
            ? response.entries
            : Array.isArray(response?.leaderboard)
              ? response.leaderboard
              : Array.isArray(response?.rows)
                ? response.rows
                : [];

        setEntries(normalizedEntries);
      })
      .catch((error) => {
        console.error('Leaderboard request failed:', error);
        setEntries([]);
      })
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

  const safeEntries = Array.isArray(entries) ? entries : [];
  const topThree = safeEntries.slice(0, 3);
  const remainingEntries = safeEntries.slice(3);

  const myRow = user
    ? safeEntries.find(
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

            {safeEntries.length === 0 ? (
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
