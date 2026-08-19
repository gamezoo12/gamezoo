import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Crown,
  Home,
  Map,
  Minus,
  Plus,
  Trophy,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import WorldCanvas from './components/WorldCanvas';
import './styles/world.css';

function dispatchWorldEvent(name) {
  window.dispatchEvent(
    new CustomEvent(name),
  );
}

export default function PrizeLeagueWorld() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

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

      <header className="pl-world-mobile-header">
        <motion.button
          type="button"
          className="pl-world-icon-button"
          onClick={() => navigate(-1)}
          whileTap={{ scale: 0.92 }}
          aria-label="Leave Prize League World"
        >
          <ArrowLeft size={21} />
        </motion.button>

        <motion.div
          className="pl-world-mobile-brand"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <Crown size={18} />

          <div>
            <span>SEASON 1</span>
            <strong>
              Prize League World
            </strong>
          </div>
        </motion.div>

        <motion.div
          className="pl-world-mobile-prize"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <Trophy size={16} />

          <div>
            <span>UP TO</span>
            <strong>£127,500</strong>
          </div>
        </motion.div>
      </header>

      <motion.div
        className="pl-world-map-tools"
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.18 }}
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

      <motion.div
        className="pl-world-bottom-controls"
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.28 }}
      >
        <button
          type="button"
          onClick={() =>
            dispatchWorldEvent(
              'pl-world-start',
            )
          }
        >
          <Home size={19} />

          <span>
            Season Start
          </span>
        </button>

        <div className="pl-world-bottom-center">
          <span>
            500 LEVELS
          </span>

          <strong>
            50 Champion Arenas
          </strong>
        </div>

        <button
          type="button"
          onClick={() =>
            dispatchWorldEvent(
              'pl-world-overview',
            )
          }
        >
          <Map size={19} />

          <span>
            Overview
          </span>
        </button>
      </motion.div>

      <div className="pl-world-touch-hint">
        Drag to explore • Pinch to zoom
      </div>
    </div>
  );
}
