import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { acquisitionAPI } from '../lib/api';

const VISITOR_KEY = 'pl-visitor-id';
const SESSION_KEY = 'pl-acq-tracked';

function getVisitorId() {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id =
      'v_' +
      Math.random().toString(36).slice(2) +
      Date.now().toString(36);
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

/*
 * Records how a visitor reached the site (referrer + UTM + landing page +
 * device) once per browser session. Fire-and-forget: never blocks or breaks
 * the page if the request fails.
 */
export default function AcquisitionTracker() {
  const location = useLocation();
  const lastPageKey = useRef('');

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      return;
    }
    sessionStorage.setItem(SESSION_KEY, '1');

    const params = new URLSearchParams(window.location.search);

    acquisitionAPI
      .track({
        visitor_id: getVisitorId(),
        landing_path:
          window.location.pathname + window.location.search,
        referrer: document.referrer || '',
        utm_source: params.get('utm_source') || '',
        utm_medium: params.get('utm_medium') || '',
        utm_campaign: params.get('utm_campaign') || '',
        utm_term: params.get('utm_term') || '',
        utm_content: params.get('utm_content') || '',
        screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
        language: navigator.language || '',
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/admin') || path.startsWith('/production') || path.startsWith('/auth-callback')) return;
    if (!path || lastPageKey.current === location.key) return;
    lastPageKey.current = location.key;
    acquisitionAPI.pageView({
      visitor_id: getVisitorId(),
      view_id: `${getVisitorId()}-${location.key}-${Date.now()}`,
      page_path: path,
    }).catch(() => {});
  }, [location.key, location.pathname]);

  return null;
}
