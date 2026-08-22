import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/*
 * Navigation behaviour:
 *
 * PUSH/REPLACE -> new page starts at top.
 * POP          -> browser Back/Forward restores the previous scroll position.
 *
 * Scroll positions are kept in memory only. Nothing is stored in user data.
 */
export default function RouteScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();

  const positions = useRef(new Map());
  const previousKey = useRef(location.key);

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    const saveCurrentPosition = () => {
      positions.current.set(previousKey.current, {
        x: window.scrollX,
        y: window.scrollY,
      });
    };

    window.addEventListener('pagehide', saveCurrentPosition);

    return () => {
      window.removeEventListener('pagehide', saveCurrentPosition);
    };
  }, []);

  useEffect(() => {
    const oldKey = previousKey.current;

    if (oldKey && oldKey !== location.key) {
      positions.current.set(oldKey, {
        x: window.scrollX,
        y: window.scrollY,
      });
    }

    const frame = window.requestAnimationFrame(() => {
      if (location.hash) {
        const id = decodeURIComponent(location.hash.slice(1));
        const element = document.getElementById(id);

        if (element) {
          element.scrollIntoView();
          previousKey.current = location.key;
          return;
        }
      }

      if (navigationType === 'POP') {
        const saved = positions.current.get(location.key);

        if (saved) {
          window.scrollTo(saved.x, saved.y);
        } else {
          window.scrollTo(0, 0);
        }
      } else {
        window.scrollTo(0, 0);
      }

      previousKey.current = location.key;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    location.key,
    location.pathname,
    location.search,
    location.hash,
    navigationType,
  ]);

  return null;
}
