import { useEffect, useRef, useState } from 'react';
import { Gift, GripVertical } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'pl_promotion_badge_position';
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
  const [position, setPosition] = useState(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    api.get('/promotion/config').then((r) => setCfg(r.data)).catch(() => {});
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
        x: clamp(x, EDGE, Math.max(EDGE, window.innerWidth - width - EDGE)),
        y: clamp(y, EDGE, Math.max(EDGE, window.innerHeight - height - EDGE)),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);

  if (!user || !cfg?.is_live || excluded(location.pathname)) return null;

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
    if (position) localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
    if (!wasMoved) {
      api.post('/promotion/event', {
        event: 'profile_view',
        page: location.pathname,
        device: window.innerWidth < 640 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
      }).catch(() => {});
      navigate('/my-account/promotions');
    }
  };

  return (
    <button
      ref={badgeRef}
      type="button"
      aria-label="Open promotion"
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        left: position?.x ?? -9999,
        top: position?.y ?? -9999,
        touchAction: 'none',
      }}
      className={`fixed z-[80] select-none rounded-full border-2 border-[#FFD54A] bg-[#0B0D1F]/95 px-3 py-2.5 sm:px-4 sm:py-3 text-white shadow-2xl backdrop-blur-md transition-transform ${dragging ? 'scale-105 cursor-grabbing' : 'hover:scale-105 cursor-grab'}`}
    >
      <span className="flex items-center gap-2">
        <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#FFD54A] to-[#FFB300] text-[#0B0D1F] shadow-lg">
          <Gift className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
        <span className="text-left leading-tight">
          <span className="block text-[10px] sm:text-xs font-bold uppercase tracking-[0.12em] text-[#FFD54A]">Special Promo</span>
          <span className="block text-xs sm:text-sm font-black whitespace-nowrap">WIN UP TO £1,000</span>
        </span>
        <GripVertical className="h-4 w-4 text-white/45" />
      </span>
    </button>
  );
}
