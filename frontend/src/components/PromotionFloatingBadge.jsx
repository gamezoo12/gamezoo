import { useEffect, useRef, useState } from 'react';
import { Gift, GripVertical, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'pl_promotion_badge_position';
const DISMISS_KEY = 'pl_promotion_badge_hidden';
const EDGE = 12;

const excluded = (path) =>
  path === '/login' ||
  path === '/forgot-password' ||
  path === '/auth-callback' ||
  path === '/my-account/promotions' ||
  path === '/cart' ||
  path.startsWith('/admin') ||
  path.startsWith('/production') ||
  path.startsWith('/legal/') ||
  path === '/terms' ||
  path === '/privacy' ||
  path === '/website-terms' ||
  path === '/mobile-terms';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default function PromotionFloatingBadge() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const badgeRef = useRef(null);
  const dragRef = useRef(null);
  const [cfg, setCfg] = useState(null);
  const [settings, setSettings] = useState({ enabled: true, text: '', url: '/my-account/promotions' });
  const [position, setPosition] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1');

  useEffect(() => {
    let active = true;
    const load = () => {
      api.get('/promotion/config').then((r) => { if (active) setCfg(r.data); }).catch(() => {});
      api.get('/announcements/promotion-badge').then((r) => { if (active) setSettings(r.data); }).catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 60000);
    window.addEventListener('pl:promotion-badge-updated', load);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('pl:promotion-badge-updated', load); };
  }, []);

  useEffect(() => {
    const place = () => {
      const rect = badgeRef.current?.getBoundingClientRect();
      const width = rect?.width || 150;
      const height = rect?.height || 54;
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch {}
      const x = saved?.x ?? window.innerWidth - width - 18;
      const y = saved?.y ?? Math.max(90, Math.round(window.innerHeight * 0.62));
      setPosition({
        x: clamp(x, -width * 0.1, Math.max(-width * 0.1, window.innerWidth - width * 0.9)),
        y: clamp(y, EDGE, Math.max(EDGE, window.innerHeight - height - EDGE)),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);

  if (!user || !cfg?.is_live || !settings.enabled || hidden || excluded(location.pathname)) return null;

  const openPromotion = () => {
    api.post('/promotion/event', {
      event: 'profile_view',
      page: location.pathname,
      device: window.innerWidth < 640 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
    }).catch(() => {});
    if (/^https?:\/\//i.test(settings.url)) window.open(settings.url, '_blank', 'noopener,noreferrer');
    else navigate(settings.url || '/my-account/promotions');
  };

  const dismiss = (e) => {
    e.stopPropagation();
    sessionStorage.setItem(DISMISS_KEY, '1');
    setHidden(true);
  };

  const startDrag = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const rect = badgeRef.current.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: rect.left,
      y: rect.top,
      moved: false,
    };
    badgeRef.current.setPointerCapture?.(e.pointerId);
    setDragging(true);
  };

  const moveDrag = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
    const rect = badgeRef.current.getBoundingClientRect();
    setPosition({
      x: clamp(d.x + dx, EDGE, Math.max(EDGE, window.innerWidth - rect.width - EDGE)),
      y: clamp(d.y + dy, EDGE, Math.max(EDGE, window.innerHeight - rect.height - EDGE)),
    });
  };

  const endDrag = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    badgeRef.current.releasePointerCapture?.(e.pointerId);
    const wasMoved = d.moved;
    dragRef.current = null;
    setDragging(false);
    if (wasMoved) {
      const rect = badgeRef.current.getBoundingClientRect();
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const droppedX = d.x + dx;
      const dockLeft = droppedX + rect.width / 2 < window.innerWidth / 2;
      const docked = {
        x: dockLeft ? -rect.width * 0.1 : window.innerWidth - rect.width * 0.9,
        y: clamp(d.y + dy, EDGE, Math.max(EDGE, window.innerHeight - rect.height - EDGE)),
      };
      setPosition(docked);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(docked));
    } else {
      openPromotion();
    }
  };

  return (
    <div
      ref={badgeRef}
      role="button"
      tabIndex={0}
      aria-label="Open promotion"
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPromotion(); } }}
      style={{
        left: position?.x ?? -9999,
        top: position?.y ?? -9999,
        touchAction: 'none',
      }}
      className={`fixed z-[80] select-none rounded-full border-2 border-[#FFD54A] bg-[#0B0D1F]/95 px-3 py-2.5 sm:px-4 sm:py-3 text-white shadow-2xl backdrop-blur-md transition-transform ${dragging ? 'scale-105 cursor-grabbing' : 'hover:scale-105 cursor-grab'}`}
    >
      <button
        type="button"
        aria-label="Hide promotion badge"
        data-testid="promotion-badge-dismiss"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={dismiss}
        className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg hover:bg-rose-500"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <span className="flex items-center gap-2">
        <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#FFD54A] to-[#FFB300] text-[#0B0D1F] shadow-lg">
          <Gift className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
        <span className="text-left leading-tight">
          <span className="block max-w-40 truncate text-[10px] sm:text-xs font-bold uppercase text-[#FFD54A]">{cfg.name || 'Special Promotion'}</span>
          <span className="block max-w-40 truncate text-xs sm:text-sm font-black">
            {settings.text || (cfg.campaign_type === 'token_credit'
              ? `CLAIM ${cfg.reward_tokens || 0} TOKENS`
              : cfg.prize_total_gbp
                ? `WIN UP TO £${Number(cfg.prize_total_gbp).toLocaleString('en-GB')}`
                : 'CLAIM YOUR REWARD')}
          </span>
        </span>
        <GripVertical className="h-4 w-4 text-white/45" />
      </span>
    </div>
  );
}
