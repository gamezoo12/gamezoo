import { useEffect, useState, useRef, useCallback } from 'react';
import { Bell, Check, MailOpen, Trophy, X, ExternalLink } from 'lucide-react';
import { userAPI } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function NotificationsBell({ dark = false }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState('all');
  const [detail, setDetail] = useState(null);
  const ref = useRef(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { notifications, unread } = await userAPI.notifications();
      setItems(notifications || []);
      setUnread(unread || 0);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.warn('[notifications] load failed:', err?.message || err);
    }
  }, [user]);

  useEffect(() => {
    if (!user) { setItems([]); setUnread(0); return undefined; }
    load();
    // Lightweight auto-update: poll every 12s, but only while the tab is
    // visible (pauses in background to save requests), and refresh instantly
    // when the tab regains focus or another part of the app signals activity.
    const POLL_MS = 12000;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pl-notifications-refresh', load);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pl-notifications-refresh', load);
    };
  }, [user, load]);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  const setRead = async (notification, read) => {
    try {
      if (read) await userAPI.markNotificationRead(notification.notification_id);
      else await userAPI.markNotificationUnread(notification.notification_id);
      await load();
      window.dispatchEvent(new CustomEvent('pl-notifications-refresh'));
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.warn('[notifications] read-state update failed:', err?.message || err);
    }
  };

  const markAllRead = async () => {
    try {
      await userAPI.markAllRead();
      await load();
      window.dispatchEvent(new CustomEvent('pl-notifications-refresh'));
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.warn('[notifications] mark-all-read failed:', err?.message || err);
    }
  };

  // Open the full-details view for a notification. Marks it read only after a
  // successful backend update (never optimistically before the write).
  const openDetail = async (n) => {
    setDetail(n);
    if (!n.read) {
      try {
        await userAPI.markNotificationRead(n.notification_id);
        setDetail((d) => (d && d.notification_id === n.notification_id ? { ...d, read: true } : d));
        await load();
        window.dispatchEvent(new CustomEvent('pl-notifications-refresh'));
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') console.warn('[notifications] mark-read on open failed:', err?.message || err);
      }
    }
  };

  const isTicketNotification = (n) =>
    !!n?.ref_ticket_id && ['support_reply', 'support_status'].includes(n?.kind);

  const viewTicket = (n) => {
    const caseId = n?.ref_ticket_id;
    setDetail(null);
    setOpen(false);
    if (caseId) {
      window.dispatchEvent(
        new CustomEvent('pl-open-support-ticket', { detail: { caseId } }),
      );
    }
  };

  const visibleItems = items.filter((item) =>
    filter === 'all' || (filter === 'unread' ? !item.read : item.read),
  );

  if (!user) return null;

  return (
    <div className="sm:relative" ref={ref}>
      <button
        onClick={toggle}
        data-testid="notifications-bell"
        aria-label="Notifications"
        className={`relative rounded-lg p-2 transition ${dark ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'}`}
      >
        <Bell className={`w-5 h-5 ${dark ? 'text-white' : 'text-slate-700'}`} />
        {unread > 0 && (
          <span data-testid="notifications-unread" className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div data-testid="notifications-panel" className="fixed left-2 right-2 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem] max-h-[calc(100vh-5rem)] sm:max-h-[min(32rem,calc(100vh-6rem))] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200 z-[10200]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="font-display font-bold text-slate-900">Notifications</div>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <div className="flex gap-1" role="tablist" aria-label="Notification status">
              {['all', 'unread', 'read'].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  onClick={() => setFilter(value)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-bold capitalize ${filter === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {value}
                </button>
              ))}
            </div>
            {unread > 0 && <button type="button" onClick={markAllRead} className="text-xs font-semibold text-indigo-700 hover:underline">Mark all read</button>}
          </div>

          {visibleItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              <Bell className="w-6 h-6 text-slate-300 mx-auto mb-2" />
              {filter === 'unread' ? 'No unread notifications.' : filter === 'read' ? 'No read notifications yet.' : 'No notifications yet.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visibleItems.map(n => (
                <li key={n.notification_id} data-testid="notification-item" className={`px-4 py-3 ${n.read ? 'bg-white' : 'bg-indigo-50/50'}`}>
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => openDetail(n)}
                      data-testid="notification-open"
                      className="flex items-start gap-3 min-w-0 flex-1 text-left cursor-pointer rounded-lg -m-1 p-1 hover:bg-slate-50 transition"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${n.read ? 'bg-slate-400' : 'bg-gradient-to-br from-indigo-500 to-violet-600'}`}>
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900">{n.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</div>
                        <div className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRead(n, !n.read)}
                      aria-label={n.read ? 'Mark unread' : 'Mark read'}
                      title={n.read ? 'Mark unread' : 'Mark read'}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-white hover:text-indigo-700 flex-shrink-0"
                    >
                      {n.read ? <MailOpen className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {detail && (
        <div
          className="fixed inset-0 z-[10210] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          data-testid="notification-detail-overlay"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col"
            data-testid="notification-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white flex-shrink-0 bg-gradient-to-br from-indigo-500 to-violet-600">
                  <Trophy className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-display font-bold text-slate-900 break-words" data-testid="notification-detail-title">{detail.title}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{detail.created_at ? new Date(detail.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : ''}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                aria-label="Close notification"
                data-testid="notification-detail-close"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4 overflow-y-auto">
              <p className="text-sm text-slate-700 whitespace-pre-wrap break-words" data-testid="notification-detail-body">{detail.body}</p>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                data-testid="notification-detail-back"
              >
                Back
              </button>
              {isTicketNotification(detail) && (
                <button
                  type="button"
                  onClick={() => viewTicket(detail)}
                  data-testid="notification-view-ticket"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-indigo-700 transition"
                >
                  View Support Ticket <ExternalLink className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
