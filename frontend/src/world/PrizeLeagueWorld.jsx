import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Clock3,
  Crown,
  Map,
  ShieldCheck,
  Trophy,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import WorldCanvas from './components/WorldCanvas';
import './styles/world.css';

export default function PrizeLeagueWorld() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="pl-world-loading">
        <div className="pl-world-loading-orb" />
        <div className="pl-world-loading-title">
          Entering Prize League World
        </div>
        <div className="pl-world-loading-subtitle">
          Preparing your adventure…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: '/world' }}
      />
    );
  }

  return (
    <div className="pl-world-page">
      <WorldCanvas />

      <div className="pl-world-vignette" />

      <header className="pl-world-topbar">
        <motion.button
          type="button"
          className="pl-world-round-button"
          onClick={() => navigate(-1)}
          whileTap={{ scale: 0.94 }}
          aria-label="Leave Prize League World"
        >
          <ArrowLeft size={22} />
        </motion.button>

        <motion.div
          className="pl-world-brand"
          initial={{ y: -28, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.55 }}
        >
          <div className="pl-world-brand-mark">
            <Crown size={18} />
          </div>

          <div>
            <div className="pl-world-brand-eyebrow">
              FREE CONTESTS
            </div>

            <div className="pl-world-brand-title">
              Prize League World
            </div>
          </div>
        </motion.div>

        <motion.div
          className="pl-world-user-chip"
          initial={{ y: -28, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            duration: 0.55,
            delay: 0.08,
          }}
        >
          <div className="pl-world-user-avatar">
            {String(
              user?.first_name ||
              user?.name ||
              'P',
            )
              .trim()
              .charAt(0)
              .toUpperCase()}
          </div>

          <div className="pl-world-user-copy">
            <span>PLAYER</span>
            <strong>
              {user?.first_name ||
                user?.name ||
                'Prize League Player'}
            </strong>
          </div>
        </motion.div>
      </header>

      <motion.aside
        className="pl-world-status-card"
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{
          duration: 0.65,
          delay: 0.2,
        }}
      >
        <div className="pl-world-status-heading">
          <div className="pl-world-status-icon">
            <Map size={19} />
          </div>

          <div>
            <span>WORLD 01</span>
            <strong>Champions Town</strong>
          </div>
        </div>

        <div className="pl-world-status-line">
          <ShieldCheck size={17} />
          <span>
            Progress is verified by Prize League servers.
          </span>
        </div>

        <div className="pl-world-status-line">
          <Clock3 size={17} />
          <span>
            Level release timing will be loaded from the active cycle.
          </span>
        </div>
      </motion.aside>

      <motion.div
        className="pl-world-prize-card"
        initial={{
          x: 50,
          opacity: 0,
        }}
        animate={{
          x: 0,
          opacity: 1,
        }}
        transition={{
          duration: 0.65,
          delay: 0.28,
        }}
      >
        <div className="pl-world-prize-icon">
          <Trophy size={25} />
        </div>

        <div>
          <span>PRIZE ARENA</span>
          <strong>
            Complete the progression path
          </strong>
          <small>
            Official leaderboard appears at the Prize Level only.
          </small>
        </div>
      </motion.div>

      <motion.div
        className="pl-world-bottom-panel"
        initial={{
          y: 45,
          opacity: 0,
        }}
        animate={{
          y: 0,
          opacity: 1,
        }}
        transition={{
          duration: 0.7,
          delay: 0.35,
        }}
      >
        <div className="pl-world-bottom-copy">
          <span>YOUR JOURNEY</span>
          <strong>
            Follow the path through 10 skill levels
          </strong>
          <small>
            Live progression will activate after the World backend
            is connected.
          </small>
        </div>

        <div className="pl-world-progress">
          <div className="pl-world-progress-label">
            <span>World path</span>
            <span>Prize Arena →</span>
          </div>

          <div className="pl-world-progress-track">
            <motion.div
              className="pl-world-progress-preview"
              initial={{ width: 0 }}
              animate={{ width: '8%' }}
              transition={{
                delay: 0.8,
                duration: 0.8,
              }}
            />
          </div>
        </div>
      </motion.div>

      <div className="pl-world-environment-label">
        <span className="pl-world-live-dot" />
        WORLD ENGINE ACTIVE
      </div>
    </div>
  );
}
