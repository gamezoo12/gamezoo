import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  worldAPI,
} from '../../lib/api';


function formatScore(value) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return '0';
  }

  return Number.isInteger(number)
    ? String(number)
    : number.toFixed(2);
}


function formatTime(value) {
  const milliseconds =
    Math.max(
      0,
      Number(value) || 0,
    );

  if (!milliseconds) {
    return '—';
  }

  const minutes =
    Math.floor(
      milliseconds / 60000,
    );

  const seconds =
    Math.floor(
      (milliseconds % 60000) /
        1000,
    );

  const ms =
    Math.floor(
      milliseconds % 1000,
    );

  return (
    `${String(minutes).padStart(2, '0')}:` +
    `${String(seconds).padStart(2, '0')}.` +
    `${String(ms).padStart(3, '0')}`
  );
}


function formatAccuracy(value) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  const percentage =
    number <= 1
      ? number * 100
      : number;

  return `${percentage.toFixed(1)}%`;
}


function playerName(row) {
  return (
    row?.user_name ||
    row?.username ||
    row?.display_name ||
    'Player'
  );
}


export default function FreeWorldLeaderboard({
  open,
  onClose,
}) {
  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  const [data, setData] =
    useState(null);


  const loadLeaderboard =
    useCallback(async () => {
      setLoading(true);
      setError('');

      try {
        const response =
          await worldAPI
            .championLeaderboard();

        setData(
          response || {
            contest: null,
            leaderboard: [],
          },
        );
      } catch (requestError) {
        console.error(
          'Free World leaderboard failed:',
          requestError,
        );

        setError(
          'Leaderboard is temporarily unavailable.',
        );

        setData(null);
      } finally {
        setLoading(false);
      }
    }, []);


  useEffect(() => {
    if (!open) {
      return;
    }

    loadLeaderboard();
  }, [
    open,
    loadLeaderboard,
  ]);


  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown =
      (event) => {
        if (
          event.key ===
          'Escape'
        ) {
          onClose?.();
        }
      };

    window.addEventListener(
      'keydown',
      onKeyDown,
    );

    return () => {
      window.removeEventListener(
        'keydown',
        onKeyDown,
      );
    };
  }, [
    open,
    onClose,
  ]);


  if (!open) {
    return null;
  }


  const rows =
    Array.isArray(
      data?.leaderboard,
    )
      ? data.leaderboard
      : [];


  const contest =
    data?.contest || {};


  const topThree =
    rows.slice(
      0,
      3,
    );


  const remaining =
    rows.slice(
      3,
    );


  const settled =
    Boolean(
      contest?.settled ||
      data?.settled,
    );


  return (
    <section
      className="pl-world-lb-shell"
      role="dialog"
      aria-modal="true"
      aria-label="Free World leaderboard"
    >
      <header
        className="pl-world-lb-header"
      >
        <div>
          <small>
            PRIZE LEAGUE
          </small>

          <h2>
            CHAMPION LEADERBOARD
          </h2>

          <p>
            Free World • Season 1
          </p>
        </div>

        <button
          type="button"
          className="pl-world-lb-close"
          onClick={onClose}
          aria-label="Close leaderboard"
        >
          ×
        </button>
      </header>


      <div
        className="pl-world-lb-contest"
      >
        <div>
          <small>
            CURRENT CHAMPION CONTEST
          </small>

          <strong>
            {contest?.name ||
              (
                contest?.contest_number
                  ? `Contest ${contest.contest_number}`
                  : 'Free World'
              )}
          </strong>
        </div>

        <div
          className={[
            'pl-world-lb-status',
            settled
              ? 'is-settled'
              : 'is-live',
          ].join(' ')}
        >
          {settled
            ? 'RESULTS'
            : 'LIVE'}
        </div>
      </div>


      <div
        className="pl-world-lb-actions"
      >
        <span>
          Verified Champion scores only
        </span>

        <button
          type="button"
          onClick={
            loadLeaderboard
          }
          disabled={loading}
        >
          {loading
            ? 'REFRESHING…'
            : 'REFRESH'}
        </button>
      </div>


      {loading &&
        !data && (
          <div
            className="pl-world-lb-message"
          >
            <div
              className="pl-world-lb-spinner"
            />

            <strong>
              Loading rankings…
            </strong>
          </div>
        )}


      {error && (
        <div
          className="pl-world-lb-message is-error"
        >
          <strong>
            {error}
          </strong>

          <button
            type="button"
            onClick={
              loadLeaderboard
            }
          >
            TRY AGAIN
          </button>
        </div>
      )}


      {!loading &&
        !error &&
        rows.length === 0 && (
          <div
            className="pl-world-lb-message"
          >
            <span>
              ♛
            </span>

            <strong>
              No verified scores yet
            </strong>

            <small>
              Rankings appear after players
              complete the Champion challenge.
            </small>
          </div>
        )}


      {rows.length > 0 && (
        <>
          <div
            className="pl-world-lb-podium"
          >
            {[
              {
                row:
                  topThree[1],
                rank: 2,
                medal: '🥈',
              },
              {
                row:
                  topThree[0],
                rank: 1,
                medal: '🥇',
              },
              {
                row:
                  topThree[2],
                rank: 3,
                medal: '🥉',
              },
            ].map(
              ({
                row,
                rank,
                medal,
              }) => (
                <article
                  key={rank}
                  className={
                    `pl-world-lb-podium-card rank-${rank}`
                  }
                >
                  <span
                    className="pl-world-lb-medal"
                  >
                    {medal}
                  </span>

                  <b>
                    #{rank}
                  </b>

                  {row ? (
                    <>
                      <strong>
                        {playerName(
                          row,
                        )}
                      </strong>

                      <em>
                        {formatScore(
                          row.score,
                        )}
                      </em>

                      <small>
                        {formatAccuracy(
                          row.accuracy,
                        )}
                      </small>

                      <small>
                        {formatTime(
                          row.duration_ms,
                        )}
                      </small>

                      {row.winner && (
                        <mark>
                          WINNER
                          {row.prize_amount
                            ? ` • £${row.prize_amount}`
                            : ''}
                        </mark>
                      )}
                    </>
                  ) : (
                    <small>
                      Waiting for player
                    </small>
                  )}
                </article>
              ),
            )}
          </div>


          <div
            className="pl-world-lb-table"
          >
            <div
              className="pl-world-lb-table-head"
            >
              <span>
                RANK
              </span>

              <span>
                PLAYER
              </span>

              <span>
                SCORE
              </span>

              <span>
                TIME
              </span>
            </div>


            {remaining.map(
              (row) => (
                <div
                  key={
                    row.user_id ||
                    `${row.rank}-${row.submitted_at}`
                  }
                  className={[
                    'pl-world-lb-row',
                    row.winner
                      ? 'is-winner'
                      : '',
                  ].join(' ')}
                >
                  <b>
                    #{row.rank}
                  </b>

                  <div>
                    <strong>
                      {playerName(
                        row,
                      )}
                    </strong>

                    <small>
                      {formatAccuracy(
                        row.accuracy,
                      )}
                    </small>
                  </div>

                  <strong>
                    {formatScore(
                      row.score,
                    )}
                  </strong>

                  <span>
                    {formatTime(
                      row.duration_ms,
                    )}
                  </span>

                  {row.winner && (
                    <mark>
                      WINNER
                      {row.prize_amount
                        ? ` • £${row.prize_amount}`
                        : ''}
                    </mark>
                  )}
                </div>
              ),
            )}
          </div>
        </>
      )}
    </section>
  );
}
