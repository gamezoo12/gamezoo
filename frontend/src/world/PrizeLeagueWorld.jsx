import {
  Navigate,
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
  Map,
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
  }, []);

  if (loading) {
    return (
      <div className="pl-world-loading">
        <div className="pl-world-loading-orb" />

        <div className="pl-world-loading-title">
          Opening the Kingdom
        </div>

        <div className="pl-world-loading-subtitle">
          Preparing Prize League Worldâ€¦
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: '/world',
        }}
      />
    );
  }

  return (
    <div className="pl-world-page">

      <WorldCanvas />

      <div className="pl-world-vignette" />

      {/* Top mobile game HUD */}
      <header className="pl-world-mobile-header">

        <motion.button
          type="button"
          className="pl-world-icon-button"
          onClick={() =>
            navigate(-1)
          }
          whileTap={{
            scale: 0.92,
          }}
          aria-label="Leave Prize League World"
        >
          <ArrowLeft size={21} />
        </motion.button>

        <motion.div
          className="pl-world-mobile-brand"
          initial={{
            y: -20,
            opacity: 0,
          }}
          animate={{
            y: 0,
            opacity: 1,
          }}
        >
          <Crown size={18} />

          <div>
            <span>
              SEASON 1
            </span>

            <strong>
              Prize League World
            </strong>
          </div>
        </motion.div>

        <motion.div
          className="pl-world-mobile-prize pl-world-prize-pulse"
          initial={{
            y: -20,
            opacity: 0,
          }}
          animate={{
            y: 0,
            opacity: 1,
          }}
        >
          <Trophy size={17} />

          <div>
            <span>
              UP TO
            </span>

            <strong>
              Â£127,500
            </strong>
          </div>
        </motion.div>

      </header>


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
      {/* Prize League primary navigation */}
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
              'pl-world-start'
            );
          }}
        >
          <Home size={20} />

          <span>
            HOME
          </span>
        </button>


        <button
          type="button"
          onClick={() =>
            navigate('/')
          }
        >
          <Crown size={20} />

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
          <Trophy size={20} />

          <span>
            LEADERBOARD
          </span>
        </button>

      </nav>
<div className="pl-world-touch-hint">
        Drag to explore â€¢ Pinch to zoom
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
                Ã—
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
                  Loading levelâ€¦
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
                          1 â†’ {levelData.level?.game_config?.target_number}
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
            onClose={() =>
              setGameFlowOpen(false)
            }
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


