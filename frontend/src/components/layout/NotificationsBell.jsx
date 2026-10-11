import { useEffect, useState, useRef, useCallback } from 'react';
import { Bell, Check, MailOpen, Trophy, X } from 'lucide-react';
import { userAPI } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function NotificationsBell({ dark = false }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState('all');
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
        <div data-testid="notifications-panel" className="fixed left-2 right-2 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem] max-h-[calc(100vh-5rem)] sm:max-h-[min(32rem,calc(100vh-6rem))] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200 z-[10070]">
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
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${n.read ? 'bg-slate-400' : 'bg-gradient-to-br from-indigo-500 to-violet-600'}`}>
                      <Trophy className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900">{n.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{n.body}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRead(n, !n.read)}
                      aria-label={n.read ? 'Mark unread' : 'Mark read'}
                      title={n.read ? 'Mark unread' : 'Mark read'}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-white hover:text-indigo-700"
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
    </div>
  );
}
