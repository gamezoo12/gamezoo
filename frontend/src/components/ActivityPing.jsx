import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { analyticsAllowed } from './AcquisitionTracker';

const INTERACTION_WINDOW_MS = 2 * 60 * 1000;
const PING_EVERY_MS = 60 * 1000;

/*
 * Tells the server a signed-in player is genuinely active. A ping is only sent while the tab is
 * visible AND the person interacted (click, key, scroll, touch) in the last two minutes, so an
 * idle open tab is not counted. Staff pings are discarded by the server.
 */
export default function ActivityPing() {
  const { user } = useAuth();
  const lastInteraction = useRef(0);
  const lastPing = useRef(0);

  useEffect(() => {
    if (!user) return undefined;
    const mark = () => { lastInteraction.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));

    const ping = () => {
      const now = Date.now();
      if (!analyticsAllowed()) return;
      if (document.visibilityState !== 'visible') return;
      if (now - lastInteraction.current > INTERACTION_WINDOW_MS) return;
      if (now - lastPing.current < PING_EVERY_MS - 1000) return;
      lastPing.current = now;
      api.post('/activity/ping', { kind: 'presence' }).catch(() => {});
    };
    ping();
    const timer = setInterval(ping, PING_EVERY_MS);
    return () => {
      events.forEach((e) => window.removeEventListener(e, mark));
      clearInterval(timer);
    };
  }, [user]);

  return null;
}
