import { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, X, ChevronRight } from 'lucide-react';
import { userAPI } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

/**
 * In-world Admin Alert popup.
 *
 * Shows UNREAD admin alerts one at a time when a user enters a world.
 * - Skip / swipe marks the current alert as read (won't pop again) and
 *   advances to the next unread alert.
 * - Clicking the card opens a full-screen detail (title, full message, date)
 *   with a Close button; closing also marks it read and advances.
 * - Fires once per world entry (mount); never re-queues while mounted, so it
 *   cannot interrupt a game started after entry.
 *
 * Notification history is preserved — this only flips `read` to true.
 */
export default function WorldAlertPopup() {
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const touchStartX = useRef(null);
  const seenIds = useRef(new Set());
  const currentRef = useRef(null);
  const queueRef = useRef([]);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // Load unread admin alerts when a user enters a world, then keep checking
  // gently (every 20s, only while the tab is visible) so a NEW alert sent by
  // an admin appears automatically without a refresh. De-duped via seenIds so
  // the same alert never re-queues, and it only ever shows the small top card
  // (never force-opens the full-screen detail), so it cannot interrupt a game.
  useEffect(() => {
    const uid = user?.user_id;
    if (!uid) return undefined;
    let active = true;

    const fetchAlerts = async () => {
      try {
        const { notifications } = await userAPI.notifications(true);
        if (!active) return;
        const unreadAlerts = (notifications || []).filter(
          (n) => n.kind === 'admin_alert' && !n.read,
        );
        const fresh = unreadAlerts.filter(
          (n) => !seenIds.current.has(n.notification_id),
        );
        if (fresh.length === 0) return;
        fresh.forEach((n) => seenIds.current.add(n.notification_id));
        if (currentRef.current) {
          setQueue((prev) => [...prev, ...fresh]);
        } else {
          const [first, ...rest] = fresh;
          setCurrent(first || null);
          setQueue((prev) => [...prev, ...rest]);
        }
      } catch { /* best effort */ }
    };

    fetchAlerts();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') fetchAlerts();
    }, 20000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchAlerts();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.user_id]);

  const advance = useCallback(() => {
    setExpanded(false);
    setQueue((prev) => {
      const [next, ...rest] = prev;
      setCurrent(next || null);
      return rest;
    });
  }, []);

  const dismiss = useCallback(async () => {
    const id = current?.notification_id;
    setExpanded(false);
    if (id) {
      try { await userAPI.markNotificationRead(id); } catch { /* keep going */ }
      // Let the header bell update its unread count immediately.
      window.dispatchEvent(new CustomEvent('pl-notifications-refresh'));
    }
    advance();
  }, [current, advance]);

  const onTouchStart = (e) => { touchStartX.current = e.changedTouches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 60) dismiss();
  };

  if (!user || !current) return null;

  const dateStr = current.created_at
    ? new Date(current.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })
    : '';

  // Full-screen detail view.
  if (expanded) {
    return (
      <div
        className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
        data-testid="world-alert-detail"
      >
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 bg-gradient-to-r from-[#6C2BFF] to-[#8b5cff] px-5 py-4 text-white">
            <Bell className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wide">Prize League Alert</span>
            <button
              onClick={dismiss}
              data-testid="world-alert-detail-close"
              className="ml-auto rounded-lg p-1 hover:bg-white/20"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-6">
            <h3 className="text-xl font-extrabold text-slate-900">{current.title}</h3>
            {dateStr && <div className="mt-1 text-xs text-slate-400">{dateStr}</div>}
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {current.message || current.body}
            </p>
            <button
              onClick={dismiss}
              data-testid="world-alert-detail-done"
              className="mt-6 w-full rounded-xl bg-[#6C2BFF] px-5 py-3 font-bold text-white hover:bg-[#5a22d6]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Compact card popup (swipe / skip / click to open).
  return (
    <div
      className="fixed top-[124px] left-1/2 z-[120] w-[92%] max-w-sm -translate-x-1/2"
      data-testid="world-alert-popup"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="rounded-2xl border border-violet-100 bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden">
        <button
          onClick={() => setExpanded(true)}
          data-testid="world-alert-open"
          className="block w-full text-left"
        >
          <div className="flex items-start gap-3 px-4 py-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#6C2BFF] to-[#8b5cff] text-white">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-slate-900">{current.title}</div>
              <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                {current.message || current.body}
              </div>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300" />
          </div>
        </button>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
          <span className="text-[11px] text-slate-400">
            {queue.length > 0 ? `+${queue.length} more` : 'Tap to read'}
          </span>
          <button
            onClick={dismiss}
            data-testid="world-alert-skip"
            className="rounded-lg px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
