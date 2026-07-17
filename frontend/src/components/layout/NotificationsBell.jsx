import { useEffect, useState, useRef, useCallback } from 'react';
import { Bell, Trophy, X } from 'lucide-react';
import { userAPI } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function NotificationsBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  const load = useCallback(() => {
    if (!user) return;
    userAPI.notifications().then(({ notifications, unread }) => {
      setItems(notifications || []);
      setUnread(unread || 0);
    }).catch((err) => {
      if (process.env.NODE_ENV !== 'production') console.warn('[notifications] load failed:', err?.message || err);
    });
  }, [user]);

  useEffect(() => {
    if (!user) { setItems([]); setUnread(0); return undefined; }
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [user, load]);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      try {
        await userAPI.markAllRead();
        setUnread(0);
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') console.warn('[notifications] mark-read failed:', err?.message || err);
      }
    }
  };

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        data-testid="notifications-bell"
        aria-label="Notifications"
        className="relative p-2 rounded-lg hover:bg-slate-100"
      >
        <Bell className="w-5 h-5 text-slate-700" />
        {unread > 0 && (
          <span data-testid="notifications-unread" className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div data-testid="notifications-panel" className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="font-display font-bold text-slate-900">Notifications</div>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              <Bell className="w-6 h-6 text-slate-300 mx-auto mb-2" />
              No notifications yet — buy a ticket and stay tuned!
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map(n => (
                <li key={n.notification_id} data-testid="notification-item" className="px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white flex-shrink-0">
                      <Trophy className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{n.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{n.body}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleString('en-GB')}</div>
                    </div>
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
