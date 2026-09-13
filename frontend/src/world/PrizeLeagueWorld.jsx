import {
  useNavigate,
} from 'react-router-dom';

import {
  AnimatePresence,
  motion,
} from 'framer-motion';

import {
  ArrowLeft,
  Crown,
  Home,
  Minus,
  Plus,
  Trophy,
} from 'lucide-react';

import {
  useAuth,
} from '../context/AuthContext';

import {
  worldAPI,
} from '../lib/api';

import {
  useEffect,
  useState,
} from 'react';

import WorldCanvas
  from './components/WorldCanvas';

import FreeWorldLeaderboard
  from './components/FreeWorldLeaderboard';import FreeWorldNumberSequence
  from './components/FreeWorldNumberSequenceV3';

import './styles/world.css';


function dispatchWorldEvent(name) {
  window.dispatchEvent(
    new CustomEvent(name),
  );
}

export default function PrizeLeagueWorld() {
  const navigate =
    useNavigate();

  const {
    user,
    loading,
  } = useAuth();

  const [selectedLevel, setSelectedLevel] =
    useState(null);

  const [levelData, setLevelData] =
    useState(null);

  const [levelBusy, setLevelBusy] =
    useState(false);

  const [levelError, setLevelError] =
    useState('');

  const [gameFlowOpen, setGameFlowOpen] =
    useState(false);

  const [championMode, setChampionMode] =
    useState(false);


  const [
    showWorldLeaderboard,
    setShowWorldLeaderboard,
  ] = useState(false);
  useEffect(() => {
    const onLevelSelect = async (event) => {
      const level =
        Number(event?.detail?.level);

      if (!Number.isInteger(level)) {
        return;
      }

      setChampionMode(false);

      setSelectedLevel({
        level,
        name:
          event?.detail?.name ||
          `Level ${level}`,
      });

      setLevelData(null);
      setLevelError('');
      setGameFlowOpen(false);
      setLevelBusy(true);

      try {

        /*
         * Logged-out visitors may try Level 1 once.
         *
         * This is intentionally NOT server progression:
         * - no wallet credit
         * - no leaderboard entry
         * - no level unlock
         *
         * Account is required immediately after the guest try.
         */
        if (!user) {

          if (level !== 1) {
            navigate('/login');
            return;
          }

          const guestAttemptUsed =
            window.localStorage.getItem(
              'pl_guest_level_1_attempt_used'
            ) === '1';

          if (guestAttemptUsed) {
            navigate('/login');
            return;
          }

          setLevelData({
            guest_mode: true,

            level: {
              level: 1,
              name: 'Level 1',

              game_id:
                'number_sequence',

              time_limit_seconds:
                25,

              game_config: {
                target_number: 20,
              },

              demo_enabled:
                true,

              demo_skippable:
                false,

              attempts: {
                free_attempts_available: 1,
                next_free_attempt_at: null,
              },
            },
          });

          setGameFlowOpen(true);
          return;
        }

        const response =
          await worldAPI.level(level);

        setLevelData(response);
        setGameFlowOpen(true);
      } catch (error) {
        const raw =
          error?.response?.data?.detail;

        setLevelError(
          typeof raw === 'string'
            ? raw
            : raw?.message ||
              raw?.msg ||
              'This level is currently unavailable.',
        );
      } finally {
        setLevelBusy(false);
      }
    };

    window.addEventListener(
      'pl-world-level-select',
      onLevelSelect,
    );

    return () => {
      window.removeEventListener(
        'pl-world-level-select',
        onLevelSelect,
      );
    };
  }, [
    navigate,
    user,
  ]);


  useEffect(() => {
    const onChampionSelect =
      async (event) => {

        if (!user) {
          navigate('/login');
          return;
        }

        setLevelBusy(true);
        setLevelError('');
        setGameFlowOpen(false);

        try {
          const state =
            await worldAPI.state();

          const champion =
            state?.champion || {};

          if (
            champion?.unlocked !== true
          ) {
            setLevelError(
              'Complete Level 10 before entering the Champion Level.',
            );

            return;
          }

          const detail =
            event?.detail || {};

          setChampionMode(true);

          setSelectedLevel({
            level: 10,
            champion: true,

            championshipNumber:
              Number(
                detail
                  ?.championshipNumber ||
                state?.progress
                  ?.champion_stage ||
                1,
              ),

            name:
              detail?.name ||
              champion?.name ||
              'Champion Arena',
          });

          setLevelData({
            champion_mode: true,

            level: {
              ...champion,

              game_id:
                'number_sequence',

              game_config: {
                ...(champion
                  ?.game_config || {}),

                target_number:
                  20,

                timer_mode:
                  'stopwatch',
              },

              time_limit_seconds:
                null,

              demo_enabled:
                champion
                  ?.demo_enabled !== false,

              demo_skippable:
                champion
                  ?.demo_skippable !== false,
            },
          });

          setGameFlowOpen(true);

        } catch (error) {
          const raw =
            error
              ?.response
              ?.data
              ?.detail;

          setLevelError(
            typeof raw === 'string'
              ? raw
              : raw?.message ||
                raw?.msg ||
                'Champion Level is currently unavailable.',
          );

        } finally {
          setLevelBusy(false);
        }
      };

    window.addEventListener(
      'pl-world-champion-select',
      onChampionSelect,
    );

    return () => {
      window.removeEventListener(
        'pl-world-champion-select',
        onChampionSelect,
      );
    };
  }, [
    navigate,
    user,
  ]);


  if (loading) {
    return (
      <div className="pl-world-loading">
        <div className="pl-world-loading-orb" />

        <div className="pl-world-loading-title">
          Opening the Kingdom
        </div>

        <div className="pl-world-loading-subtitle">
          Preparing Prize League World…
        </div>
      </div>
    );
  }

  return (
    <div className="pl-world-page">

      <WorldCanvas />

      <div className="pl-world-vignette" />

      <div
        className="pl-world-promo-ticker pl-world-promo-ticker-top"
        aria-label="Prize League Free World information"
      >
        <div className="pl-world-promo-track">

          <span>1,000 LEVELS</span>
          <b aria-hidden="true">&bull;</b>

          <span>100 CHAMPIONSHIPS</span>
          <b aria-hidden="true">&bull;</b>

          <span>
            UP TO {'\u00A3'}257,500 IN PRIZES
          </span>
          <b aria-hidden="true">&bull;</b>

          <span>PLAY</span>
          <b aria-hidden="true">&bull;</b>

          <span>COMPETE</span>
          <b aria-hidden="true">&bull;</b>

          <span>WIN</span>
          <b aria-hidden="true">&bull;</b>

          <span>1,000 LEVELS</span>
          <b aria-hidden="true">&bull;</b>

          <span>100 CHAMPIONSHIPS</span>
          <b aria-hidden="true">&bull;</b>

          <span>
            UP TO {'\u00A3'}257,500 IN PRIZES
          </span>
          <b aria-hidden="true">&bull;</b>

          <span>PLAY</span>
          <b aria-hidden="true">&bull;</b>

          <span>COMPETE</span>
          <b aria-hidden="true">&bull;</b>

          <span>WIN</span>

        </div>
      </div>


      {/* Zoom tools */}
      <motion.div
        className="pl-world-map-tools"
        initial={{
          x: -20,
          opacity: 0,
        }}
        animate={{
          x: 0,
          opacity: 1,
        }}
        transition={{
          delay: 0.18,
        }}
      >
        <button
          type="button"
          onClick={() =>
            dispatchWorldEvent(
              'pl-world-zoom-in',
            )
          }
          aria-label="Zoom in"
        >
          <Plus size={20} />
        </button>

        <button
          type="button"
          onClick={() =>
            dispatchWorldEvent(
              'pl-world-zoom-out',
            )
          }
          aria-label="Zoom out"
        >
          <Minus size={20} />
        </button>
      </motion.div>
      {/* Prize League Free World navigation */}
      <nav
        className="pl-world-primary-nav"
        aria-label="Prize League World navigation"
      >

        <button
          type="button"
          className={
            !showWorldLeaderboard
              ? 'is-active'
              : ''
          }
          onClick={() => {
            setShowWorldLeaderboard(false);

            dispatchWorldEvent(
              'pl-world-home'
            );
          }}
        >
          <Home size={19} />

          <span>
            HOME
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            navigate('/paid-leagues')
          }
        >
          <Crown size={19} />

          <span>
            PAID CONTESTS
          </span>
        </button>

        <button
          type="button"
          className={
            showWorldLeaderboard
              ? 'is-active'
              : ''
          }
          onClick={() =>
            setShowWorldLeaderboard(true)
          }
        >
          <Trophy size={19} />

          <span>
            LEADERBOARD
          </span>
        </button>

      </nav>
<div className="pl-world-touch-hint">
        Drag to explore • Pinch to zoom
      </div>

      <AnimatePresence>
        {false && selectedLevel && (
          <motion.div
            className="pl-world-level-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() =>
              setSelectedLevel(null)
            }
          >
            <motion.section
              className="pl-world-level-modal"
              initial={{
                opacity: 0,
                y: 36,
                scale: 0.96,
              }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                y: 28,
                scale: 0.97,
              }}
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <button
                type="button"
                className="pl-world-level-close"
                onClick={() =>
                  setSelectedLevel(null)
                }
              >
                ×
              </button>

              <div className="pl-world-level-kicker">
                ROYAL VILLAGE
              </div>

              <h2>
                Level {selectedLevel.level}
              </h2>

              <h3>
                {selectedLevel.name}
              </h3>

              {levelBusy && (
                <div className="pl-world-level-loading">
                  Loading level…
                </div>
              )}

              {!levelBusy &&
                levelError && (
                  <div className="pl-world-level-error">
                    {levelError}
                  </div>
                )}

              {!levelBusy &&
                levelData && (
                  <>
                    <div className="pl-world-level-game">
                      <span>
                        SKILL GAME
                      </span>

                      <strong>
                        {levelData.level?.game_id === 'number_sequence'
                          ? 'Number Sequence'
                          : levelData.level?.game_id}
                      </strong>
                    </div>

                    <div className="pl-world-level-stats">
                      <div>
                        <span>
                          TIME LIMIT
                        </span>

                        <strong>
                          {levelData.level?.time_limit_seconds}s
                        </strong>
                      </div>

                      <div>
                        <span>
                          GAME
                        </span>

                        <strong>
                          1 → {levelData.level?.game_config?.target_number}
                        </strong>
                      </div>

                      <div>
                        <span>
                          FREE ATTEMPTS
                        </span>

                        <strong>
                          {levelData.level?.attempts
                            ?.free_attempts_available ??
                            0}
                        </strong>
                      </div>
                    </div>

                    {levelData.level?.attempts
                      ?.next_free_attempt_at && (
                      <div className="pl-world-level-refresh">
                        Next free attempt:
                        {' '}
                        {new Date(
                          levelData.level?.attempts
                            ?.next_free_attempt_at,
                        ).toLocaleString()}
                      </div>
                    )}

                    <div className="pl-world-level-rule">
                      Pass the skill challenge to
                      progress to the next destination.
                      Retries never unlock levels
                      automatically.
                    </div>

                    <button
                      type="button"
                      className="pl-world-level-play"
                      disabled={
                        Number(
                          levelData.level?.attempts
                            ?.free_attempts_available || 0,
                        ) < 1
                      }
                      onClick={() =>
                        setGameFlowOpen(true)
                      }
                    >
                      PLAY
                    </button>

                    <div className="pl-world-level-play-note">
                      Instructions and demo appear before
                      the official attempt. Demo play never
                      consumes an attempt.
                    </div>
                  </>
                )}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {gameFlowOpen &&
        selectedLevel &&
        levelData && (
          <FreeWorldNumberSequence
            selectedLevel={selectedLevel}
            levelData={levelData}
            championMode={championMode}
            championMeta={selectedLevel}
            guestMode={
              !user &&
              Number(selectedLevel?.level) === 1
            }
            onClose={() => {
              setGameFlowOpen(false);
              setChampionMode(false);
            }}
            onFinished={async () => {
              try {
                const refreshed =
                  await worldAPI.level(
                    selectedLevel.level,
                  );

                setLevelData(
                  refreshed,
                );
              } catch (error) {
                // Map refresh is best-effort.
              }

              window.dispatchEvent(
                new CustomEvent(
                  'pl-world-progress-refresh',
                ),
              );
            }}
          />
        )}


      <FreeWorldLeaderboard
        open={showWorldLeaderboard}
        onClose={() =>
          setShowWorldLeaderboard(false)
        }
      />
    </div>
  );
}


