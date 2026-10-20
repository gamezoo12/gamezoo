import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { acquisitionAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const VISITOR_KEY = 'pl-visitor-id';
const SESSION_KEY = 'pl-session';
const LEGACY_TRACKED_KEY = 'pl-acq-tracked';
const SESSION_IDLE_MS = 30 * 60 * 1000;
const SIGNUP_SELECTOR =
  '[data-testid="mode-signup"],[data-testid="world-header-signup"],[data-testid="free-world-signup"],[aria-label="Sign up"]';

// Non-essential analytics honour Do Not Track, Global Privacy Control and an explicit opt-out.
export function analyticsAllowed() {
  try {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return false;
    if (navigator.globalPrivacyControl === true) return false;
    return localStorage.getItem('pl-analytics-consent') === 'granted';
  } catch (e) {
    return false;
  }
}

function randomId(prefix) {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function getVisitorId() {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = randomId('v_');
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

// Returns { id, isNew }; a session ends after 30 minutes without a page view.
function touchSession() {
  const now = Date.now();
  let session = null;
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { session = null; }
  const isNew = !session || !session.id || now - session.last > SESSION_IDLE_MS;
  const next = { id: isNew ? randomId('s_') : session.id, last: now };
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  return { id: next.id, isNew };
}

const EXCLUDED_PREFIXES = ['/admin', '/production', '/auth-callback'];

/*
 * First-party, privacy-light traffic analytics:
 *  - one page view per SPA navigation (guarded against StrictMode / re-render repeats)
 *  - visible-time engagement per view
 *  - first-touch source (referrer / UTM) sent only when a session starts
 *  - links a brand-new account to its visit for registration attribution
 * Every request is fire-and-forget; failures never affect the page.
 * Staff are excluded on the server from their verified role, not from anything here.
 */
export default function AcquisitionTracker() {
  const location = useLocation();
  const { user } = useAuth();
  const [consentVersion, setConsentVersion] = useState(0);
  const lastKey = useRef('');
  const prevPath = useRef('');
  const current = useRef({ viewId: '', visibleMs: 0, shownAt: 0, sent: 0 });

  useEffect(() => {
    const onConsent = () => setConsentVersion((value) => value + 1);
    window.addEventListener('pl-analytics-consent-change', onConsent);
    return () => window.removeEventListener('pl-analytics-consent-change', onConsent);
  }, []);

  const flush = () => {
    const c = current.current;
    if (!c.viewId || !analyticsAllowed()) return;
    const total = c.visibleMs + (c.shownAt ? Date.now() - c.shownAt : 0);
    const rounded = Math.min(Math.round(total), 1800000);
    if (rounded - c.sent >= 500) {
      c.sent = rounded;
      acquisitionAPI.engagement({ view_id: c.viewId, engaged_ms: rounded });
    }
  };

  useEffect(() => {
    const onVisibility = () => {
      const c = current.current;
      if (document.visibilityState === 'hidden') {
        if (c.shownAt) { c.visibleMs += Date.now() - c.shownAt; c.shownAt = 0; }
        flush();
      } else if (!c.shownAt) {
        c.shownAt = Date.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
    };
  }, []);

  useEffect(() => {
    const path = location.pathname;
    if (EXCLUDED_PREFIXES.some((p) => path.startsWith(p))) return;
    if (!analyticsAllowed()) return;
    if (lastKey.current === location.key) return;
    lastKey.current = location.key;

    // Close out the previous view's engagement before starting the next.
    const c = current.current;
    if (c.shownAt) { c.visibleMs += Date.now() - c.shownAt; c.shownAt = 0; }
    flush();

    const visitorId = getVisitorId();
    const { id: sessionId, isNew } = touchSession();
    const params = new URLSearchParams(location.search);
    const viewId = randomId('pv_');
    current.current = {
      viewId,
      visibleMs: 0,
      shownAt: document.visibilityState === 'visible' ? Date.now() : 0,
      sent: 0,
    };

    const payload = {
      visitor_id: visitorId,
      session_id: sessionId,
      view_id: viewId,
      page_path: path,
      variant: path === '/login' && params.get('tab') === 'signup' ? 'signup' : '',
      prev_path: prevPath.current,
    };
    if (isNew) {
      payload.referrer = document.referrer || '';
      payload.utm_source = params.get('utm_source') || '';
      payload.utm_medium = params.get('utm_medium') || '';
      payload.utm_campaign = params.get('utm_campaign') || '';
      payload.has_gclid = params.has('gclid');
      // Existing landing report (visits) keeps working: one record per browser session.
      if (sessionStorage.getItem(LEGACY_TRACKED_KEY) !== '1') {
        sessionStorage.setItem(LEGACY_TRACKED_KEY, '1');
        acquisitionAPI.track({
          visitor_id: visitorId,
          landing_path: window.location.pathname + window.location.search,
          referrer: document.referrer || '',
          utm_source: payload.utm_source,
          utm_medium: payload.utm_medium,
          utm_campaign: payload.utm_campaign,
          utm_term: params.get('utm_term') || '',
          utm_content: params.get('utm_content') || '',
          screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
          language: navigator.language || '',
        }).catch(() => {});
      }
    }
    prevPath.current = path;
    acquisitionAPI.pageView(payload).catch(() => {});
  }, [location.key, location.pathname, location.search, consentVersion]);

  // "Sign up" clicks (header, World Selection, login tabs): at most one event per session server-side.
  useEffect(() => {
    const onClick = (event) => {
      if (!analyticsAllowed()) return;
      const el = event.target && event.target.closest ? event.target.closest(SIGNUP_SELECTOR) : null;
      if (!el) return;
      try {
        const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (!s || !s.id) return;
        acquisitionAPI
          .event({ visitor_id: getVisitorId(), session_id: s.id, name: 'signup_click', page_path: window.location.pathname })
          .catch(() => {});
        // The email/Google registration tab is a state change on /login, not an SPA route.
        if (el.dataset.testid === 'mode-signup' && window.location.pathname === '/login') {
          const viewId = randomId('pv_');
          current.current = {
            viewId,
            visibleMs: 0,
            shownAt: document.visibilityState === 'visible' ? Date.now() : 0,
            sent: 0,
          };
          acquisitionAPI.pageView({
            visitor_id: getVisitorId(),
            session_id: s.id,
            view_id: viewId,
            page_path: '/login',
            variant: 'signup',
            prev_path: '/login',
          }).catch(() => {});
        }
      } catch (e) { /* ignore */ }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Link a newly created account to its first visit (server only accepts accounts <24h old).
  useEffect(() => {
    if (!user || !user.user_id || !analyticsAllowed()) return;
    const flag = `pl-attributed-${user.user_id}`;
    if (localStorage.getItem(flag)) return;
    let sessionId;
    try { sessionId = (JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') || {}).id; } catch (e) { sessionId = undefined; }
    acquisitionAPI.attribute({ visitor_id: getVisitorId(), session_id: sessionId }).then((result) => {
      if (result?.attributed || ['already_attributed', 'not_a_new_registration', 'no_tracking_data', 'internal_account'].includes(result?.reason)) {
        localStorage.setItem(flag, '1');
      }
    }).catch(() => {});
  }, [user]);

  return null;
}
