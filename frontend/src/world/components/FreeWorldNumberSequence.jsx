import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Play,
  RefreshCw,
  ShieldCheck,
  Trophy,
} from 'lucide-react';

import {
  worldAPI,
} from '../../lib/api';


function shuffle(values) {
  const result = [...values];

  for (
    let index = result.length - 1;
    index > 0;
    index -= 1
  ) {
    const swapIndex =
      Math.floor(
        Math.random() * (index + 1),
      );

    [
      result[index],
      result[swapIndex],
    ] = [
      result[swapIndex],
      result[index],
    ];
  }

  return result;
}


function formatTime(ms) {
  const safe = Math.max(
    0,
    Number(ms || 0),
  );

  const seconds =
    Math.ceil(safe / 1000);

  return `${seconds}s`;
}


export default function FreeWorldNumberSequence({
  selectedLevel,
  levelData,
  onClose,
  onFinished,
}) {
  const level =
    levelData?.level || {};

  const target =
    Number(
      level?.game_config
        ?.target_number || 20,
    );

  const timeLimitSeconds =
    Number(
      level?.time_limit_seconds || 30,
    );

  const attempts =
    level?.attempts || {};

  const [stage, setStage] =
    useState('instructions');

  const [demoNumbers, setDemoNumbers] =
    useState(() =>
      shuffle(
        Array.from(
          {
            length:
              Math.max(5, target),
          },
          (_, index) =>
            index + 1,
        ),
      ),
    );

  const [demoNext, setDemoNext] =
    useState(1);

  const [session, setSession] =
    useState(null);

  const [officialNext, setOfficialNext] =
    useState(1);

  const [officialTaps, setOfficialTaps] =
    useState([]);

  const [countdown, setCountdown] =
    useState(3);

  const [remainingMs, setRemainingMs] =
    useState(
      timeLimitSeconds * 1000,
    );

  const [result, setResult] =
    useState(null);

  const [attemptSummary, setAttemptSummary] =
    useState(null);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState('');

  const begunAtRef =
    useRef(null);

  const submittingRef =
    useRef(false);

  const mountedRef =
    useRef(true);


  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);


  useEffect(() => {
    setRemainingMs(
      timeLimitSeconds * 1000,
    );
  }, [
    timeLimitSeconds,
  ]);


  const refreshAttemptSummary =
    useCallback(async () => {
      try {
        const response =
          await worldAPI.attemptSummary(
            Number(
              selectedLevel?.level,
            ),
          );

        if (mountedRef.current) {
          setAttemptSummary(response);
        }
      } catch (requestError) {
        // Best-time summary is supplemental.
      }
    }, [
      selectedLevel?.level,
    ]);

  useEffect(() => {
    refreshAttemptSummary();
  }, [
    refreshAttemptSummary,
  ]);


  const columns = useMemo(
    () => (
      target <= 20
        ? 5
        : target <= 30
          ? 6
          : target <= 50
            ? 7
            : target <= 75
              ? 9
              : 10
    ),
    [
      target,
    ],
  );


  const replayDemo =
    useCallback(() => {
      setDemoNumbers(
        shuffle(
          Array.from(
            {
              length:
                Math.max(
                  5,
                  target,
                ),
            },
            (_, index) =>
              index + 1,
          ),
        ),
      );

      setDemoNext(1);
      setStage('demo');
    }, [
      target,
    ]);


  const tapDemo = (number) => {
    if (number !== demoNext) {
      return;
    }

    if (number >= target) {
      setDemoNext(
        target + 1,
      );

      window.setTimeout(
        () => {
          if (
            mountedRef.current
          ) {
            setStage(
              'demo-complete',
            );
          }
        },
        350,
      );

      return;
    }

    setDemoNext(
      (value) => value + 1,
    );
  };


  const prepareOfficial =
    async () => {
      if (
        busy ||
        Number(
          attempts
            ?.free_attempts_available
            || 0,
        ) < 1
      ) {
        return;
      }

      setBusy(true);
      setError('');

      try {
        const response =
          await worldAPI
            .startSession(
              Number(
                selectedLevel
                  ?.level,
              ),
            );

        if (!mountedRef.current) {
          return;
        }

        setSession(response);

        setOfficialNext(1);
        setOfficialTaps([]);
        setCountdown(3);

        setRemainingMs(
          Number(
            response
              ?.time_limit_seconds
              || timeLimitSeconds,
          ) * 1000,
        );

        setStage(
          'countdown',
        );
      } catch (requestError) {
        const raw =
          requestError
            ?.response
            ?.data
            ?.detail;

        setError(
          typeof raw === 'string'
            ? raw
            : raw?.message ||
              'Unable to prepare this game.',
        );
      } finally {
        if (
          mountedRef.current
        ) {
          setBusy(false);
        }
      }
    };


  useEffect(() => {
    if (
      stage !== 'countdown'
    ) {
      return undefined;
    }

    if (countdown > 0) {
      const timer =
        window.setTimeout(
          () => {
            setCountdown(
              (value) =>
                value - 1,
            );
          },
          850,
        );

      return () =>
        window.clearTimeout(
          timer,
        );
    }

    let cancelled = false;

    const begin = async () => {
      setBusy(true);
      setError('');

      try {
        const response =
          await worldAPI
            .beginSession(
              session?.session_id,
            );

        if (
          cancelled ||
          !mountedRef.current
        ) {
          return;
        }

        begunAtRef.current =
          Date.now();

        setRemainingMs(
          Number(
            response
              ?.time_limit_seconds
              || timeLimitSeconds,
          ) * 1000,
        );

        setStage('official');
      } catch (requestError) {
        const raw =
          requestError
            ?.response
            ?.data
            ?.detail;

        setError(
          typeof raw === 'string'
            ? raw
            : raw?.message ||
              'Unable to begin this attempt.',
        );

        setStage(
          'official-error',
        );
      } finally {
        if (
          !cancelled &&
          mountedRef.current
        ) {
          setBusy(false);
        }
      }
    };

    begin();

    return () => {
      cancelled = true;
    };
  }, [
    countdown,
    session?.session_id,
    stage,
    timeLimitSeconds,
  ]);


  const submitOfficial =
    useCallback(
      async ({
        solved,
        taps,
      }) => {
        if (
          submittingRef.current ||
          !session?.session_id
        ) {
          return;
        }

        submittingRef.current =
          true;

        setBusy(true);
        setError('');

        const durationMs =
          Math.max(
            100,
            Date.now() -
              Number(
                begunAtRef
                  .current ||
                  Date.now(),
              ),
          );

        try {
          const response =
            await worldAPI
              .submitSession({
                session_id:
                  session
                    .session_id,

                duration_ms:
                  durationMs,

                solved:
                  Boolean(solved),

                taps:
                  taps || [],
              });

          if (
            !mountedRef.current
          ) {
            return;
          }

          setResult(response);

          try {
            const summary =
              await worldAPI.attemptSummary(
                Number(
                  selectedLevel?.level,
                ),
              );

            if (mountedRef.current) {
              setAttemptSummary(summary);
            }
          } catch (summaryError) {
            // Supplemental only.
          }

          setStage('result');
        } catch (requestError) {
          const raw =
            requestError
              ?.response
              ?.data
              ?.detail;

          setError(
            typeof raw === 'string'
              ? raw
              : raw?.message ||
                'Unable to verify this result.',
          );

          setStage(
            'official-error',
          );
        } finally {
          submittingRef.current =
            false;

          if (
            mountedRef.current
          ) {
            setBusy(false);
          }
        }
      },
      [
        session,
        selectedLevel?.level,
      ],
    );


  useEffect(() => {
    if (
      stage !== 'official'
    ) {
      return undefined;
    }

    const interval =
      window.setInterval(
        () => {
          const elapsed =
            Date.now() -
            Number(
              begunAtRef
                .current ||
                Date.now(),
            );

          const total =
            Number(
              session
                ?.time_limit_seconds
                || timeLimitSeconds,
            ) * 1000;

          const remaining =
            Math.max(
              0,
              total - elapsed,
            );

          setRemainingMs(
            remaining,
          );

          if (
            remaining <= 0
          ) {
            window.clearInterval(
              interval,
            );

            submitOfficial({
              solved: false,
              taps:
                officialTaps,
            });
          }
        },
        100,
      );

    return () =>
      window.clearInterval(
        interval,
      );
  }, [
    officialTaps,
    session,
    stage,
    submitOfficial,
    timeLimitSeconds,
  ]);


  const tapOfficial =
    (number) => {
      if (
        stage !== 'official' ||
        busy ||
        number !== officialNext
      ) {
        return;
      }

      const nextTaps = [
        ...officialTaps,
        number,
      ];

      setOfficialTaps(
        nextTaps,
      );

      if (
        number >= target
      ) {
        setOfficialNext(
          target + 1,
        );

        submitOfficial({
          solved: true,
          taps: nextTaps,
        });

        return;
      }

      setOfficialNext(
        (value) =>
          value + 1,
      );
    };


  const officialNumbers =
    session
      ?.game_config
      ?.numbers || [];


  return (
    <div
      className="pl-free-game-shell"
      data-testid="free-world-number-sequence"
    >
      <div className="pl-free-game-safe">

        <header className="pl-free-game-header">
          <button
            type="button"
            className="pl-free-game-back"
            onClick={onClose}
            disabled={
              stage === 'official'
              || stage === 'countdown'
            }
            aria-label="Close game"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="pl-free-game-heading">
            <span>
              ROYAL VILLAGE
            </span>

            <strong>
              Level {
                selectedLevel
                  ?.level
              }
            </strong>
          </div>

          <div className="pl-free-game-attempt-chip">
            <ShieldCheck size={15} />

            <span>
              {
                attempts
                  ?.free_attempts_available
                  ?? 0
              }
            </span>
          </div>
        </header>


        {stage === 'instructions' && (
          <main className="pl-free-game-panel pl-free-instructions">

            <div className="pl-free-game-emblem">
              <Trophy size={34} />
            </div>

            <div className="pl-free-kicker">
              GAME INSTRUCTIONS
            </div>

            <h1>
              Number Sequence
            </h1>

            <h2>
              Tap 1 → {target}
            </h2>

            <div className="pl-free-instruction-list">

              <div>
                <span>1</span>
                <p>
                  Tap every number in
                  numerical order,
                  starting at 1.
                </p>
              </div>

              <div>
                <span>2</span>
                <p>
                  Complete the sequence
                  before the
                  {' '}
                  <b>
                    {timeLimitSeconds}
                    -second
                  </b>
                  {' '}
                  timer ends.
                </p>
              </div>

              <div>
                <span>3</span>
                <p>
                  A wrong number does
                  not move you forward.
                  Find the correct next
                  number.
                </p>
              </div>

              <div>
                <span>4</span>
                <p>
                  The demo is only
                  practice. It uses
                  {' '}
                  <b>
                    no official attempt
                  </b>
                  {' '}
                  and creates no score.
                </p>
              </div>

            </div>

            <div className="pl-free-info-row">

              <div>
                <Clock3 size={17} />
                <span>
                  TIME
                </span>
                <strong>
                  {timeLimitSeconds}s
                </strong>
              </div>

              <div>
                <ShieldCheck size={17} />
                <span>
                  FREE ATTEMPTS
                </span>
                <strong>
                  {
                    attempts
                      ?.free_attempts_available
                      ?? 0
                  }
                </strong>
              </div>

            </div>

            <button
              type="button"
              className="pl-free-primary-button"
              onClick={() =>
                setStage('demo')
              }
            >
              <Play size={18} />
              START DEMO
            </button>

          </main>
        )}


        {stage === 'demo' && (
          <main className="pl-free-game-panel pl-free-play-panel">

            <div className="pl-free-demo-badge">
              DEMO • NO ATTEMPT USED
            </div>

            <div className="pl-free-play-title">
              <span>
                Tap in order
              </span>

              <strong>
                1 → {target}
              </strong>

              <small>
                Next: {
                  Math.min(
                    demoNext,
                    target,
                  )
                }
              </small>
            </div>

            <div
              className="pl-free-number-grid"
              style={{
                gridTemplateColumns:
                  `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {demoNumbers.map(
                (number) => {
                  const done =
                    number <
                    demoNext;

                  return (
                    <button
                      key={number}
                      type="button"
                      disabled={done}
                      onClick={() =>
                        tapDemo(
                          number,
                        )
                      }
                      className={
                        done
                          ? 'is-done'
                          : ''
                      }
                    >
                      {number}
                    </button>
                  );
                },
              )}
            </div>

            <div className="pl-free-demo-actions">
              <button
                type="button"
                className="pl-free-text-button"
                onClick={() =>
                  setStage(
                    'instructions',
                  )
                }
              >
                View instructions
              </button>

              <button
                type="button"
                className="pl-free-skip-demo"
                onClick={() =>
                  setStage(
                    'demo-complete',
                  )
                }
              >
                SKIP DEMO
              </button>
            </div>

          </main>
        )}


        {stage === 'demo-complete' && (
          <main className="pl-free-game-panel pl-free-result-panel">

            <CheckCircle2
              className="pl-free-success-icon"
              size={54}
            />

            <div className="pl-free-kicker">
              DEMO COMPLETE
            </div>

            <h1>
              Ready for the
              official attempt?
            </h1>

            <p>
              The next game is official.
              Your free attempt is only
              consumed when the countdown
              finishes and the official
              game begins.
            </p>

            <div className="pl-free-action-row">

              <button
                type="button"
                className="pl-free-secondary-button"
                onClick={
                  replayDemo
                }
              >
                <RefreshCw size={17} />
                REPLAY DEMO
              </button>

              <button
                type="button"
                className="pl-free-primary-button"
                onClick={
                  prepareOfficial
                }
                disabled={
                  busy ||
                  Number(
                    attempts
                      ?.free_attempts_available
                      || 0,
                  ) < 1
                }
              >
                <Play size={17} />
                CONTINUE
              </button>

            </div>

            {Number(
              attempts
                ?.free_attempts_available
                || 0,
            ) < 1 && (
              <div className="pl-free-error">
                No free attempt is
                currently available.
              </div>
            )}

          </main>
        )}


        {stage === 'countdown' && (
          <main className="pl-free-countdown">

            <div className="pl-free-kicker">
              OFFICIAL ATTEMPT
            </div>

            <h1>
              {countdown > 0
                ? countdown
                : 'GO!'}
            </h1>

            <p>
              Your attempt begins
              after the countdown.
            </p>

          </main>
        )}


        {stage === 'official' && (
          <main className="pl-free-game-panel pl-free-play-panel official">

            <div className="pl-free-official-bar">

              <div>
                OFFICIAL
              </div>

              <strong>
                {
                  formatTime(
                    remainingMs,
                  )
                }
              </strong>

            </div>

            <div className="pl-free-play-title">

              <span>
                Tap in order
              </span>

              <strong>
                1 → {target}
              </strong>

              <small>
                Next: {
                  Math.min(
                    officialNext,
                    target,
                  )
                }
              </small>

            </div>

            <div
              className="pl-free-number-grid"
              style={{
                gridTemplateColumns:
                  `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {officialNumbers.map(
                (number) => {
                  const done =
                    number <
                    officialNext;

                  return (
                    <button
                      key={number}
                      type="button"
                      disabled={
                        done ||
                        busy
                      }
                      onClick={() =>
                        tapOfficial(
                          number,
                        )
                      }
                      className={
                        done
                          ? 'is-done'
                          : ''
                      }
                    >
                      {number}
                    </button>
                  );
                },
              )}
            </div>

          </main>
        )}


        {stage === 'result' && (
          <main
            className={[
              'pl-free-game-panel',
              'pl-free-result-panel',
              result?.passed
                ? 'success'
                : 'failed',
            ].join(' ')}
          >

            {result?.passed ? (
              <CheckCircle2
                className="pl-free-success-icon"
                size={58}
              />
            ) : (
              <RefreshCw
                className="pl-free-encore-icon"
                size={55}
              />
            )}

            <div className="pl-free-kicker">
              {
                result?.passed
                  ? 'LEVEL COMPLETE'
                  : 'TRY AGAIN'
              }
            </div>

            <h1>
              {
                result?.passed
                  ? 'CONGRATULATIONS!'
                  : 'ENCORE!'
              }
            </h1>

            <p>
              {
                result?.passed
                  ? (
                    selectedLevel
                      ?.level < 10
                      ? `Level ${
                          selectedLevel
                            ?.level
                        } is complete. Your next destination is now available.`
                      : 'Royal Gate is complete. Your Champion challenge is now ready.'
                  )
                  : 'You did not complete the sequence in time. You can retry when an attempt is available.'
              }
            </p>

            {result?.passed && (
              <div className="pl-free-result-score">

                <span>
                  VERIFIED TIME
                </span>

                <strong>
                  {
                    (
                      Number(
                        result
                          ?.duration_ms
                          || 0,
                      ) / 1000
                    ).toFixed(2)
                  }s
                </strong>

              </div>
            )}

            <div className="pl-free-attempt-details">

              <div>
                <span>
                  YOUR TIME
                </span>

                <strong>
                  {
                    result?.duration_ms
                      ? `${(
                          Number(
                            result.duration_ms,
                          ) / 1000
                        ).toFixed(2)}s`
                      : '—'
                  }
                </strong>
              </div>

              <div>
                <span>
                  BEST TIME
                </span>

                <strong>
                  {
                    attemptSummary
                      ?.best_verified_time_ms
                      ? `${(
                          Number(
                            attemptSummary
                              .best_verified_time_ms,
                          ) / 1000
                        ).toFixed(2)}s`
                      : '—'
                  }
                </strong>
              </div>

              <div>
                <span>
                  FREE ATTEMPTS
                </span>

                <strong>
                  {
                    attemptSummary
                      ?.attempts
                      ?.free_attempts_available
                      ?? result
                        ?.attempts
                        ?.free_attempts_available
                      ?? 0
                  }
                </strong>
              </div>

            </div>

            {!result?.passed &&
              Number(
                attemptSummary
                  ?.attempts
                  ?.free_attempts_available
                  || 0,
              ) > 0 && (
              <button
                type="button"
                className="pl-free-secondary-button pl-free-retry-button"
                onClick={() => {
                  setResult(null);
                  setSession(null);
                  setOfficialNext(1);
                  setOfficialTaps([]);
                  setStage(
                    'demo-complete',
                  );
                }}
              >
                <RefreshCw size={17} />
                RETRY
              </button>
            )}

            {!result?.passed &&
              Number(
                attemptSummary
                  ?.attempts
                  ?.free_attempts_available
                  || 0,
              ) < 1 &&
              attemptSummary
                ?.attempts
                ?.token_retry_available && (
              <div className="pl-free-token-option">
                <strong>
                  Free attempts used
                </strong>

                <span>
                  1 token can provide
                  one extra retry.
                </span>

                <small>
                  Token payment is not
                  connected yet.
                </small>
              </div>
            )}

            <button
              type="button"
              className="pl-free-primary-button"
              onClick={() => {
                onFinished?.(
                  result,
                );

                onClose?.();
              }}
            >
              RETURN TO WORLD
            </button>

          </main>
        )}


        {stage === 'official-error' && (
          <main className="pl-free-game-panel pl-free-result-panel failed">

            <div className="pl-free-kicker">
              GAME ERROR
            </div>

            <h1>
              Attempt unavailable
            </h1>

            <p>
              {error ||
                'Unable to continue this attempt.'}
            </p>

            <button
              type="button"
              className="pl-free-primary-button"
              onClick={onClose}
            >
              RETURN TO WORLD
            </button>

          </main>
        )}


        {error &&
          stage !==
            'official-error' && (
          <div className="pl-free-floating-error">
            {error}
          </div>
        )}

      </div>
    </div>
  );
}
