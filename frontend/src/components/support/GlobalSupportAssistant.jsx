import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Bot, X, MessageCircle, Mail, Sparkles, TicketCheck, ExternalLink, Minimize2 } from 'lucide-react';
import { supportAPI } from '../../lib/api';
import './supportAssistant.css';

const SupportAIChat = lazy(() => import('./SupportAIChat'));
const MySupportTickets = lazy(() => import('./MySupportTickets'));
const POSITION_KEY = 'pl_support_assistant_position_v1';
const WHATSAPP_COMMUNITY_URL = 'https://chat.whatsapp.com/I6L15DZ3r9FD4NEaNPDesL';
const SUPPORT_EMAIL = 'support@prizeleague.co.uk';
const SUPPORT_EMAIL_HREF = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Prize League Support Request')}`;

function clampPosition(position, viewport = window) {
  const size = 58;
  return {
    x: Math.min(Math.max(8, Number(position.x) || 8), Math.max(8, viewport.innerWidth - size - 8)),
    y: Math.min(Math.max(8, Number(position.y) || 8), Math.max(8, viewport.innerHeight - size - 8)),
  };
}

export default function GlobalSupportAssistant() {
  const location = useLocation();
  const { user } = useAuth();
  const [position, setPosition] = useState(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('menu');
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  const getDefaultPosition = useCallback(() => {
    const isAdmin = location.pathname.startsWith('/admin');
    return clampPosition({
      x: isAdmin ? 20 : window.innerWidth - 76,
      y: Math.max(96, Math.round(window.innerHeight * 0.52)),
    });
  }, [location.pathname]);

  useEffect(() => {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null'); } catch { saved = null; }
    setPosition(clampPosition(saved || getDefaultPosition()));
  }, [getDefaultPosition]);

  useEffect(() => {
    if (!position) return;
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(position)); } catch { /* storage can be disabled */ }
  }, [position]);

  useEffect(() => {
    const resize = () => setPosition(current => current ? clampPosition(current) : current);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || config) return;
    let cancelled = false;
    supportAPI.config().then(data => {
      if (!cancelled) setConfig(data);
    }).catch(() => {
      if (!cancelled) setConfigError(true);
    });
    return () => { cancelled = true; };
  }, [open, config]);

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const onPointerDown = event => {
    if (event.button !== undefined && event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: position,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved) {
      setPosition(clampPosition({ x: drag.origin.x + dx, y: drag.origin.y + dy }));
    }
  };

  const onPointerUp = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

  const onLauncherKeyDown = event => {
    const offsets = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const step = event.shiftKey ? 32 : 12;
    setPosition(current => clampPosition({
      x: current.x + offset[0] * step,
      y: current.y + offset[1] * step,
    }));
  };

  const openPanel = () => {
    if (suppressClickRef.current) return;
    setOpen(true);
    setView('menu');
  };

  const panelBounds = (() => {
    if (!position) return {};
    const panelWidth = Math.min(430, window.innerWidth - 24);
    const panelHeight = Math.min(700, window.innerHeight - 32);
    const left = Math.min(Math.max(12, position.x + 58 - panelWidth), window.innerWidth - panelWidth - 12);
    const top = Math.min(Math.max(12, position.y + 58 - panelHeight), window.innerHeight - panelHeight - 12);
    return { left, top, width: panelWidth, maxHeight: panelHeight };
  })();

  if (!position || fullscreen) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="pl-support-launcher"
        style={{ left: position.x, top: position.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onLauncherKeyDown}
        onClick={openPanel}
        aria-label="Open Prize League Support assistant. Use arrow keys to move, or Shift plus an arrow key for a larger move."
        aria-expanded={open}
        aria-controls="pl-support-panel"
        title="Prize League Support"
        data-testid="support-assistant-launcher"
      >
        <span className="pl-support-orbit" aria-hidden="true" />
        <span className="pl-support-robot"><Bot size={26} strokeWidth={2.4} /></span>
      </button>

      <section
        ref={panelRef}
        id="pl-support-panel"
        className={`pl-support-panel ${open ? 'is-open' : ''}`}
        style={panelBounds}
        aria-label="Prize League Support"
        aria-hidden={!open}
        data-testid="support-assistant-panel"
      >
        <header className="pl-support-header">
          <div className="flex min-w-0 items-center gap-3">
            <span className="pl-support-header-bot"><Bot size={22} /></span>
            <div className="min-w-0"><h2>{view === 'menu' ? 'Hello! 👋 Welcome to Prize League Support' : view === 'ai' ? 'AI Assistant' : 'My Support Tickets'}</h2><p>{view === 'menu' ? 'How can we help you today?' : 'Prize League customer support'}</p></div>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Minimise support assistant" title="Minimise" className="pl-support-icon-button"><Minimize2 size={17} /></button>
        </header>

        {view === 'menu' && (
          <div className="pl-support-menu">
            {configError && <p className="pl-support-error" role="status">Support contact details are temporarily unavailable. Please try again shortly.</p>}
            <button type="button" className="pl-support-option is-whatsapp" onClick={() => window.open(WHATSAPP_COMMUNITY_URL, '_blank', 'noopener,noreferrer')} data-testid="support-whatsapp">
              <span className="pl-support-option-icon"><MessageCircle size={21} /></span><span><b>Join WhatsApp Community</b><small>Join our official community for updates and support.</small></span><ExternalLink size={16} />
            </button>
            <button type="button" className="pl-support-option is-ai" onClick={() => setView('ai')} data-testid="support-ai">
              <span className="pl-support-option-icon"><Sparkles size={21} /></span><span><b>Ask AI Assistant</b><small>Get instant answers and support, 24/7.</small></span><span className="pl-support-online">24/7</span>
            </button>
            <button type="button" className="pl-support-option is-email" onClick={() => { window.location.href = SUPPORT_EMAIL_HREF; }} data-testid="support-email">
              <span className="pl-support-option-icon"><Mail size={21} /></span><span><b>Email Support</b><small>Send us a detailed message by email.</small></span><ExternalLink size={16} />
            </button>
            <button type="button" className="pl-support-tickets-link" onClick={() => setView('tickets')} data-testid="support-my-tickets"><TicketCheck size={16} />My Support Tickets</button>
          </div>
        )}

        {(view === 'ai' || view === 'tickets') && (
          <Suspense fallback={<div className="pl-support-loading" role="status">Opening support…</div>}>
            {view === 'ai' ? <SupportAIChat user={user} aiAvailable={config?.ai_available} onBack={() => setView('menu')} /> : <MySupportTickets user={user} onBack={() => setView('menu')} />}
          </Suspense>
        )}
      </section>
    </>
  );
}
