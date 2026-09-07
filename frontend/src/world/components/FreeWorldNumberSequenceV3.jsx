import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  CheckCircle2,
  Clock3,
  Info,
  Play,
  RefreshCw,
  ShieldCheck,
  Trophy,
  X,
} from 'lucide-react';

import {
  worldAPI,
} from '../../lib/api';

import '../styles/freeWorldGameV3.css';


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


function formatElapsed(ms) {
  const safe =
    Math.max(
      0,
      Math.floor(
        Number(ms || 0),
      ),
    );

  const minutes =
    Math.floor(
      safe / 60000,
    );

  const seconds =
    Math.floor(
      (safe % 60000) / 1000,
    );

  const milliseconds =
    safe % 1000;

  return `${
    String(minutes).padStart(2, '0')
  }:${
    String(seconds).padStart(2, '0')
  }.${
    String(milliseconds).padStart(3, '0')
  }`;
}


function getErrorMessage(
  error,
  fallback,
) {
  const detail =
    error
      ?.response
      ?.data
      ?.detail;

  if (
    typeof detail === 'string'
  ) {
    return detail;
  }

  return (
    detail?.message ||
    detail?.msg ||
    fallback
  );
}


export default function FreeWorldNumberSequenceV3({
  selectedLevel,
  levelData,
  guestMode = false,
  onClose,
  onFinished,
}) {
  const level =
    levelData?.level || {};

  const target =
    Number(
      level
        ?.game_config
        ?.target_number || 20,
    );

  const timeLimitSeconds =
    Number(
      level
        ?.time_limit_seconds || 25,
    );

  const initialAttempts =
    level?.attempts || {};


  const [stage, setStage] =
    useState('instructions');

  const [demoNumbers, setDemoNumbers] =
    useState(() =>
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

  const [demoNext, setDemoNext] =
    useState(1);

  const [demoElapsedMs, setDemoElapsedMs] =
    useState(0);

  const [demoStarted, setDemoStarted] =
    useState(false);


  const [session, setSession] =
    useState(null);

  const [officialNext, setOfficialNext] =
    useState(1);

  const [officialTaps, setOfficialTaps] =
    useState([]);

  const [
    officialElapsedMs,
    setOfficialElapsedMs,
  ] =
    useState(0);

  const [countdown, setCountdown] =
    useState(3);


  const [result, setResult] =
    useState(null);

  const [
    attemptSummary,
    setAttemptSummary,
  ] =
    useState(null);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState('');


  const mountedRef =
    useRef(true);

  const begunAtRef =
    useRef(null);

  const submittingRef =
    useRef(false);


  const attempts =
    attemptSummary?.attempts ||
    initialAttempts;


  const freeAttempts =
    Number(
      attempts
        ?.free_attempts_available ?? 0,
    );


  const columns =
    useMemo(
      () => {
        if (target <= 20) {
          return 5;
        }

        if (target <= 30) {
          return 6;
        }

        if (target <= 50) {
          return 7;
        }

        return 8;
      },
      [
        target,
      ],
    );


  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);


  const refreshAttemptSummary =
    useCallback(
      async () => {
        try {
          const response =
            await worldAPI
              .attemptSummary(
                Number(
                  selectedLevel?.level,
                ),
              );

          if (
            mountedRef.current
          ) {
            setAttemptSummary(
              response,
            );
          }
        } catch (requestError) {
          // Supplemental state only.
        }
      },
      [
        selectedLevel?.level,
      ],
    );


  useEffect(() => {
    if (guestMode) {
      return;
    }

    refreshAttemptSummary();
  }, [
    guestMode,
    refreshAttemptSummary,
  ]);


  const replayDemo =
    useCallback(
      () => {
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
        setDemoElapsedMs(0);
        setDemoStarted(false);
        setError('');
        setStage('demo');
      },
      [
        target,
      ],
    );


  /*
   * DEMO TIMER
   * Starts at 00:00.000 and counts UP.
   * requestAnimationFrame keeps it smooth.
   */
  useEffect(() => {
    if (
      stage !== 'demo' ||
      !demoStarted
    ) {
      return undefined;
    }

    const startedAt =
      performance.now();

    const limitMs =
      timeLimitSeconds * 1000;

    setDemoElapsedMs(0);

    let frameId = 0;

    const tick =
      (now) => {
        const elapsed =
          Math.min(
            limitMs,
            Math.max(
              0,
              now - startedAt,
            ),
          );

        setDemoElapsedMs(
          elapsed,
        );

        if (
          elapsed >= limitMs
        ) {
          if (
            mountedRef.current
          ) {
            setStage(
              'demo-complete',
            );
          }

          return;
        }

        frameId =
          window
            .requestAnimationFrame(
              tick,
            );
      };

    frameId =
      window
        .requestAnimationFrame(
          tick,
        );

    return () => {
      window
        .cancelAnimationFrame(
          frameId,
        );
    };
  }, [
    demoStarted,
    stage,
    timeLimitSeconds,
  ]);


  const tapDemo =
    (number) => {
      if (
        !demoStarted ||
        number !== demoNext
      ) {
        return;
      }

      if (
        number >= target
      ) {
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
          220,
        );

        return;
      }

      setDemoNext(
        (value) =>
          value + 1,
      );
    };


  /*
   * OFFICIAL SESSION PREPARATION
   * Production backend remains authoritative.
   */
  const prepareOfficial =
    async () => {
      if (
        busy ||
        freeAttempts < 1
      ) {
        return;
      }

      setBusy(true);
      setError('');

      if (guestMode) {
        setSession({
          session_id: 'guest-level-1',

          time_limit_seconds:
            timeLimitSeconds,

          game_config: {
            target_number:
              target,

            numbers:
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
          },
        });

        setOfficialNext(1);
        setOfficialTaps([]);
        setOfficialElapsedMs(0);
        setCountdown(3);

        setStage('countdown');
        setBusy(false);

        return;
      }


      try {
        const response =
          await worldAPI
            .startSession(
              Number(
                selectedLevel?.level,
              ),
            );

        if (
          !mountedRef.current
        ) {
          return;
        }

        setSession(
          response,
        );

        setOfficialNext(1);
        setOfficialTaps([]);
        setOfficialElapsedMs(0);
        setCountdown(3);

        setStage(
          'countdown',
        );
      } catch (requestError) {
        setError(
          getErrorMessage(
            requestError,
            'Unable to prepare this game.',
          ),
        );
      } finally {
        if (
          mountedRef.current
        ) {
          setBusy(false);
        }
      }
    };


  /*
   * 3 - 2 - 1 then backend beginSession.
   */
  useEffect(() => {
    if (
      stage !== 'countdown'
    ) {
      return undefined;
    }

    if (
      countdown > 0
    ) {
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

      return () => {
        window.clearTimeout(
          timer,
        );
      };
    }

    let cancelled = false;

    const begin =
      async () => {
        setBusy(true);
        setError('');

        try {
          if (guestMode) {

            begunAtRef.current =
              performance.now();

            setOfficialElapsedMs(0);

            setStage(
              'official',
            );

            return;
          }

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

          setSession(
            (current) => ({
              ...current,
              ...response,
            }),
          );

          begunAtRef.current =
            performance.now();

          setOfficialElapsedMs(0);

          setStage(
            'official',
          );
        } catch (requestError) {
          setError(
            getErrorMessage(
              requestError,
              'Unable to begin this attempt.',
            ),
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
    guestMode,
    session?.session_id,
    stage,
  ]);


  /*
   * Official backend submission.
   */
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
            Math.floor(
              performance.now() -
              Number(
                begunAtRef.current ||
                performance.now(),
              ),
            ),
          );

        try {
          if (guestMode) {

          window.localStorage.setItem(
            'pl_guest_level_1_attempt_used',
            '1',
          );

          setResult({
            guest: true,

            solved:
              Boolean(solved),

            duration_ms:
              durationMs,

            message:
              solved
                ? 'Great first run. Sign up to continue.'
                : 'Your free Level 1 try is complete. Sign up to continue.',
          });

          setStage(
            'result',
          );

          window.setTimeout(
            () => {
              window.location.href =
                '/login';
            },
            1500,
          );

          return;
        }

        const response =
            await worldAPI
              .submitSession({
                session_id:
                  session.session_id,

                duration_ms:
                  durationMs,

                solved:
                  Boolean(
                    solved,
                  ),

                taps:
                  taps || [],
              });

          if (
            !mountedRef.current
          ) {
            return;
          }

          setResult(
            response,
          );

          try {
            const summary =
              await worldAPI
                .attemptSummary(
                  Number(
                    selectedLevel?.level,
                  ),
                );

            if (
              mountedRef.current
            ) {
              setAttemptSummary(
                summary,
              );
            }
          } catch (summaryError) {
            // Supplemental only.
          }

          setStage(
            'result',
          );
        } catch (requestError) {
          setError(
            getErrorMessage(
              requestError,
              'Unable to verify this result.',
            ),
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
        guestMode,
        selectedLevel?.level,
        session,
      ],
    );


  /*
   * OFFICIAL TIMER
   * Starts at 00:00.000 and counts UP.
   * Backend time limit remains authoritative.
   */
  useEffect(() => {
    if (
      stage !== 'official'
    ) {
      return undefined;
    }

    const limitMs =
      Number(
        session
          ?.time_limit_seconds ||
        timeLimitSeconds,
      ) * 1000;

    let frameId = 0;

    const tick =
      (now) => {
        const elapsed =
          Math.max(
            0,
            now -
            Number(
              begunAtRef.current ||
              now,
            ),
          );

        setOfficialElapsedMs(
          Math.min(
            limitMs,
            elapsed,
          ),
        );

        if (
          elapsed >= limitMs
        ) {
          submitOfficial({
            solved: false,
            taps:
              officialTaps,
          });

          return;
        }

        frameId =
          window
            .requestAnimationFrame(
              tick,
            );
      };

    frameId =
      window
        .requestAnimationFrame(
          tick,
        );

    return () => {
      window
        .cancelAnimationFrame(
          frameId,
        );
    };
  }, [
    officialTaps,
    session?.time_limit_seconds,
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
          taps:
            nextTaps,
        });

        return;
      }

      setOfficialNext(
        (value) =>
          value + 1,
      );
    };


  const retryFree =
    () => {
      setResult(null);
      setSession(null);
      setOfficialNext(1);
      setOfficialTaps([]);
      setOfficialElapsedMs(0);
      setError('');

      setStage(
        'demo-complete',
      );
    };


  /*
   * Real backend token retry reservation.
   * No frontend fake token deduction.
   */
  const retryWithToken =
    async () => {
      if (
        busy
      ) {
        return;
      }

      setBusy(true);
      setError('');

      try {
        await worldAPI
          .reserveTokenRetry(
            Number(
              selectedLevel?.level,
            ),
          );

        await refreshAttemptSummary();

        if (
          mountedRef.current
        ) {
          retryFree();
        }
      } catch (requestError) {
        setError(
          getErrorMessage(
            requestError,
            'Unable to reserve a token retry.',
          ),
        );
      } finally {
        if (
          mountedRef.current
        ) {
          setBusy(false);
        }
      }
    };


  const officialNumbers =
    session
      ?.game_config
      ?.numbers?.length
      ? session.game_config.numbers
      : demoNumbers;


  const resultAttempts =
    attemptSummary?.attempts ||
    result?.attempts ||
    attempts;


  const resultFreeAttempts =
    Number(
      resultAttempts
        ?.free_attempts_available ?? 0,
    );


  const resultDuration =
    Number(
      result?.duration_ms ||
      officialElapsedMs ||
      0,
    );


  const correctCount =
    result?.passed
      ? target
      : Math.min(
          target,
          officialTaps.length,
        );


  const attemptUsed =
    Math.max(
      1,
      Number(
        resultAttempts
          ?.free_attempts_used ??
        resultAttempts
          ?.attempts_used ??
        Math.max(
          1,
          3 -
          resultFreeAttempts,
        ),
      ),
    );


  /*
   * ==========================================================
   * PAGE 1 - LEVEL ENTRY
   * ==========================================================
   */
  if (
    stage === 'instructions'
  ) {
    return (
      <div
        className="fwv3-overlay fwv3-entry-overlay"
        data-testid="free-world-v3"
      >
        <section className="fwv3-card fwv3-entry-card">

          <button
            type="button"
            className="fwv3-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={28} />
          </button>


          <header className="fwv3-entry-header">

            <h1>
              LEVEL {
                selectedLevel?.level
              }
            </h1>

            <strong>
              LEVEL {
                selectedLevel?.level
              }
            </strong>

          </header>


          <section className="fwv3-game-banner">

            <div
              className="fwv3-number-icon"
              aria-hidden="true"
            >
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
            </div>


            <div className="fwv3-game-banner-copy">

              <span>
                SKILL GAME
              </span>

              <h2>
                NUMBER SEQUENCE
              </h2>

            </div>

          </section>


          <section className="fwv3-stat-grid">

            <article>

              <Clock3 />

              <div>

                <span>
                  TIME LIMIT
                </span>

                <strong>
                  {timeLimitSeconds}
                </strong>

                <small>
                  SECONDS
                </small>

              </div>

            </article>


            <article>

              <div className="fwv3-bars">
                â–‚â–„â–†â–ˆ
              </div>

              <div>

                <span>
                  GAME
                </span>

                <strong>
                  1 to {target}
                </strong>

                <small>
                  SEQUENCE
                </small>

              </div>

            </article>


            <article>

              <Trophy />

              <div>

                <span>
                  FREE ATTEMPTS
                </span>

                <strong>
                  {freeAttempts}
                </strong>

                <small>
                  ATTEMPTS
                </small>

              </div>

            </article>

          </section>


          <section className="fwv3-info-box">

            <Info />

            <p>
              Pass the skill challenge
              to progress to the next
              destination. Retries never
              unlock levels automatically.
            </p>

          </section>


          <section className="fwv3-entry-actions">

            {
              level
                ?.demo_enabled !== false &&
              level
                ?.demo_skippable !== false
                ? (
                  <button
                    type="button"
                    className="fwv3-button fwv3-button-outline"
                    onClick={() =>
                      setStage(
                        'demo-complete',
                      )
                    }
                  >
                    SKIP DEMO
                  </button>
                )
                : (
                  <div />
                )
            }


            <button
              type="button"
              className="fwv3-button fwv3-button-primary"
              onClick={() => {
                if (
                  level
                    ?.demo_enabled === false
                ) {
                  setStage(
                    'demo-complete',
                  );

                  return;
                }

                replayDemo();
              }}
            >
              <Play size={21} />

              {
                level
                  ?.demo_enabled === false
                  ? 'CONTINUE'
                  : 'PLAY DEMO'
              }
            </button>

          </section>


          <footer className="fwv3-practice-note">

            <ShieldCheck />

            <span>
              Demo is practice only -
              No attempt used
            </span>

          </footer>

        </section>
      </div>
    );
  }


  /*
   * ==========================================================
   * PAGE 2 - DEMO
   * ==========================================================
   */
  if (
    stage === 'demo'
  ) {
    return (
      <div className="fwv3-overlay fwv3-play-overlay">

        <section className="fwv3-card fwv3-play-card">

          <div className="fwv3-mode-label">
            DEMO MODE
          </div>


          <div className="fwv3-timer">

            <Clock3 />

            <strong>
              {
                formatElapsed(
                  demoElapsedMs,
                )
              }
            </strong>

          </div>


          <div className="fwv3-timer-caption">
            PRACTICE MODE - NO ATTEMPT USED
          </div>


          <section className="fwv3-progress">

            <div>

              <span>
                NEXT NUMBER
              </span>

              <strong>
                {
                  Math.min(
                    demoNext,
                    target,
                  )
                }
              </strong>

            </div>


            <div>

              <span>
                PROGRESS
              </span>

              <strong>
                {
                  Math.min(
                    demoNext - 1,
                    target,
                  )
                } / {target}
              </strong>

            </div>

          </section>


          <div
            className="fwv3-grid"
            style={{
              gridTemplateColumns:
                `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {
              demoNumbers.map(
                (number) => {
                  const done =
                    number <
                    demoNext;

                  return (
                    <button
                      key={number}
                      type="button"
                      disabled={done}
                      className={
                        done
                          ? 'is-done'
                          : ''
                      }
                      onClick={() =>
                        tapDemo(
                          number,
                        )
                      }
                    >
                      {number}
                    </button>
                  );
                },
              )
            }
          </div>


          <section className="fwv3-play-actions">

            {!demoStarted ? (
              <button
                type="button"
                className="fwv3-button fwv3-button-primary"
                onClick={() => {
                  setDemoElapsedMs(0);
                  setDemoStarted(true);
                }}
              >
                <Play size={18} />
                START DEMO
              </button>
            ) : (
              <button
                type="button"
                className="fwv3-button fwv3-button-outline"
                onClick={() => {
                  setDemoStarted(false);
                  setStage('demo-complete');
                }}
              >
                EXIT DEMO
              </button>
            )}


            <button
              type="button"
              className="fwv3-button fwv3-button-primary"
              onClick={() => {
                setDemoStarted(false);
                setStage('demo-complete');
              }}
            >
              SKIP DEMO
            </button>

          </section>

        </section>

      </div>
    );
  }


  /*
   * ==========================================================
   * PAGE 3 - OFFICIAL READY
   * ==========================================================
   */
  if (
    stage === 'demo-complete'
  ) {
    return (
      <div className="fwv3-overlay">

        <section className="fwv3-card fwv3-ready-card">

          <button
            type="button"
            className="fwv3-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={26} />
          </button>


          <ShieldCheck
            className="fwv3-ready-icon"
          />


          <div className="fwv3-mode-label">
            OFFICIAL ATTEMPT
          </div>


          <h2>
            Ready to play?
          </h2>


          <p>
            This is your official
            attempt. The attempt is
            consumed only when the
            official game begins.
          </p>


          <section className="fwv3-ready-stats">

            <div>
              <span>
                BEST VERIFIED TIME
              </span>

              <strong>
                {
                  attemptSummary?.best_verified_time_ms
                    ? formatElapsed(
                        attemptSummary.best_verified_time_ms,
                      )
                    : '--:--.---'
                }
              </strong>
            </div>

            <div>
              <span>
                FREE ATTEMPTS
              </span>

              <strong>
                {freeAttempts}
              </strong>
            </div>

          </section>


          <section className="fwv3-entry-actions">

            {
              level
                ?.demo_enabled !== false
                ? (
                  <button
                    type="button"
                    className="fwv3-button fwv3-button-outline"
                    onClick={
                      replayDemo
                    }
                  >
                    <RefreshCw size={18} />
                    REPLAY DEMO
                  </button>
                )
                : (
                  <div />
                )
            }


            <button
              type="button"
              className="fwv3-button fwv3-button-primary"
              disabled={
                busy ||
                freeAttempts < 1
              }
              onClick={
                prepareOfficial
              }
            >
              <Play size={18} />
              START ATTEMPT
            </button>

          </section>


          {
            freeAttempts < 1 && (
              <div className="fwv3-error">
                No free attempt is
                currently available.
              </div>
            )
          }


          {
            error && (
              <div className="fwv3-error">
                {error}
              </div>
            )
          }

        </section>

      </div>
    );
  }


  /*
   * ==========================================================
   * PAGE 4 - COUNTDOWN
   * ==========================================================
   */
  if (
    stage === 'countdown'
  ) {
    return (
      <div className="fwv3-overlay">

        <section className="fwv3-card fwv3-countdown-card">

          <div className="fwv3-mode-label">
            OFFICIAL ATTEMPT
          </div>

          <strong className="fwv3-countdown-number">
            {
              countdown > 0
                ? countdown
                : 'GO!'
            }
          </strong>

          <p>
            Your official attempt
            begins after the countdown.
          </p>

          <button
            type="button"
            className="fwv3-button fwv3-button-outline"
            onClick={onClose}
          >
            EXIT
          </button>

        </section>

      </div>
    );
  }


  /*
   * ==========================================================
   * PAGE 5 - OFFICIAL GAME
   * Same dimensions as Demo.
   * ==========================================================
   */
  if (
    stage === 'official'
  ) {
    return (
      <div className="fwv3-overlay fwv3-play-overlay">

        <section className="fwv3-card fwv3-play-card">

          <div className="fwv3-mode-label">
            OFFICIAL ATTEMPT
          </div>


          <div className="fwv3-timer">

            <Clock3 />

            <strong>
              {
                formatElapsed(
                  officialElapsedMs,
                )
              }
            </strong>

          </div>


          <div className="fwv3-timer-caption">
            OFFICIAL ATTEMPT - COUNTS AS ATTEMPT
          </div>


          <section className="fwv3-progress">

            <div>

              <span>
                NEXT NUMBER
              </span>

              <strong>
                {
                  Math.min(
                    officialNext,
                    target,
                  )
                }
              </strong>

            </div>


            <div>

              <span>
                PROGRESS
              </span>

              <strong>
                {
                  Math.min(
                    officialNext - 1,
                    target,
                  )
                } / {target}
              </strong>

            </div>

          </section>


          <div
            className="fwv3-grid"
            style={{
              gridTemplateColumns:
                `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {
              officialNumbers.map(
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
                      className={
                        done
                          ? 'is-done'
                          : ''
                      }
                      onClick={() =>
                        tapOfficial(
                          number,
                        )
                      }
                    >
                      {number}
                    </button>
                  );
                },
              )
            }
          </div>


          <button
            type="button"
            className="fwv3-exit-game"
            disabled={busy}
            onClick={() => {
              submitOfficial({
                solved: false,
                taps: officialTaps,
              });
            }}
          >
            EXIT GAME
          </button>

        </section>

      </div>
    );
  }


  /*
   * ==========================================================
   * PAGE 6 - RESULT
   * ==========================================================
   */
  if (
    stage === 'result'
  ) {
    const success =
      Boolean(
        result?.passed,
      );

    return (
      <div className="fwv3-overlay">

        <section className="fwv3-card fwv3-result-card">

          <button
            type="button"
            className="fwv3-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={26} />
          </button>


          <div className="fwv3-mode-label">
            ATTEMPT RESULT
          </div>


          <section
            className={[
              'fwv3-result-state',
              success
                ? 'success'
                : 'failed',
            ].join(' ')}
          >

            {
              success
                ? (
                  <CheckCircle2 />
                )
                : (
                  <RefreshCw />
                )
            }

            <h2>
              {
                success
                  ? 'SUCCESS!'
                  : 'ATTEMPT COMPLETE'
              }
            </h2>

          </section>


          <p className="fwv3-result-message">
            {
              success
                ? 'You completed the sequence.'
                : 'The sequence was not completed in time.'
            }
          </p>


          <section className="fwv3-result-grid">

            <div>

              <span>
                TIME TAKEN
              </span>

              <strong>
                {
                  formatElapsed(
                    resultDuration,
                  )
                }
              </strong>

            </div>


            <div>

              <span>
                CORRECT
              </span>

              <strong>
                {correctCount} / {target}
              </strong>

            </div>


            <div>

              <span>
                BEST TIME
              </span>

              <strong>
                {
                  attemptSummary?.best_verified_time_ms
                    ? formatElapsed(
                        attemptSummary.best_verified_time_ms,
                      )
                    : '--:--.---'
                }
              </strong>

            </div>


            <div>

              <span>
                FREE LEFT
              </span>

              <strong>
                {resultFreeAttempts}
              </strong>

            </div>


            <div className="wide">

              <span>
                ATTEMPT USED
              </span>

              <strong>
                {attemptUsed} of 3
              </strong>

            </div>

          </section>


          {
            success ? (
              <button
                type="button"
                className="fwv3-button fwv3-button-primary fwv3-full"
                onClick={() => {
                  onFinished?.(
                    result,
                  );

                  onClose?.();
                }}
              >
                CONTINUE
              </button>
            ) : resultFreeAttempts > 0 ? (
              <button
                type="button"
                className="fwv3-button fwv3-button-primary fwv3-full"
                onClick={
                  retryFree
                }
              >
                PLAY AGAIN - {
                  resultFreeAttempts
                } FREE
              </button>
            ) : resultAttempts
                ?.token_retry_available ? (
              <button
                type="button"
                className="fwv3-button fwv3-button-primary fwv3-full"
                disabled={busy}
                onClick={
                  retryWithToken
                }
              >
                RETRY NOW - 1 TOKEN
              </button>
            ) : null
          }


          {
            !success &&
            resultAttempts
              ?.refresh_next_at && (
              <div className="fwv3-refresh-note">

                <strong>
                  NEXT FREE ATTEMPT
                </strong>

                <span>
                  {
                    new Date(
                      resultAttempts
                        .refresh_next_at,
                    )
                      .toLocaleString(
                        'en-GB',
                      )
                  }
                </span>

              </div>
            )
          }


          <button
            type="button"
            className="fwv3-button fwv3-button-outline fwv3-full"
            onClick={() => {
              onFinished?.(
                result,
              );

              onClose?.();
            }}
          >
            RETURN TO WORLD
          </button>


          {
            error && (
              <div className="fwv3-error">
                {error}
              </div>
            )
          }

        </section>

      </div>
    );
  }


  /*
   * ==========================================================
   * ERROR
   * ==========================================================
   */
  return (
    <div className="fwv3-overlay">

      <section className="fwv3-card fwv3-ready-card">

        <div className="fwv3-mode-label">
          GAME ERROR
        </div>

        <h2>
          Attempt unavailable
        </h2>

        <p>
          {
            error ||
            'Unable to continue this attempt.'
          }
        </p>

        <button
          type="button"
          className="fwv3-button fwv3-button-primary fwv3-full"
          onClick={onClose}
        >
          RETURN TO WORLD
        </button>

      </section>

    </div>
  );
}