import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Castle,
  Crown,
  Map,
  MousePointer2,
  Trophy,
  ZoomIn,
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

      <header className="pl-world-topbar">
        <motion.button
          type="button"
          className="pl-world-round-button"
          onClick={() => navigate(-1)}
          whileTap={{ scale: 0.94 }}
          aria-label="Leave Prize League World"
        >
          <ArrowLeft size={21} />
        </motion.button>

        <motion.div
          className="pl-world-brand"
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <div className="pl-world-brand-mark">
            <Crown size={19} />
          </div>

          <div>
            <div className="pl-world-brand-eyebrow">
              SEASON 1
            </div>

            <div className="pl-world-brand-title">
              Prize League Kingdom
            </div>
          </div>
        </motion.div>

        <motion.div
          className="pl-world-season-chip"
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <Trophy size={18} />

          <div>
            <span>SEASON PRIZES</span>
            <strong>UP TO £127,500</strong>
          </div>
        </motion.div>
      </header>

      <motion.aside
        className="pl-world-map-help"
        initial={{ x: -35, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="pl-world-map-help-title">
          <Castle size={18} />
          <div>
            <span>THE KINGDOM</span>
            <strong>550 destinations</strong>
          </div>
        </div>

        <div className="pl-world-map-help-row">
          <MousePointer2 size={15} />
          <span>Drag to explore</span>
        </div>

        <div className="pl-world-map-help-row">
          <ZoomIn size={15} />
          <span>Scroll to zoom</span>
        </div>

        <div className="pl-world-map-help-row">
          <Map size={15} />
          <span>10 connected royal realms</span>
        </div>
      </motion.aside>

      <motion.div
        className="pl-world-arena-key"
        initial={{ x: 35, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <Crown size={20} />

        <div>
          <span>CHAMPION ARENAS</span>
          <strong>50 Prize Destinations</strong>
          <small>
            Arenas 1–5 reveal their prizes. Future prizes remain a mystery.
          </small>
        </div>
      </motion.div>

      <motion.div
        className="pl-world-bottom-bar"
        initial={{ y: 35, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <div>
          <span>SEASON 1 JOURNEY</span>
          <strong>
            500 Skill Levels • 50 Champion Arenas
          </strong>
        </div>

        <div className="pl-world-prize-preview">
          <span>ARENA PRIZES</span>
          <strong>
            £100 • £200 • £300 • £400 • £500 • ???
          </strong>
        </div>
      </motion.div>
    </div>
  );
}
