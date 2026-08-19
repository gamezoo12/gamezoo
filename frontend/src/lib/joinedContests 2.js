/**
 * Cheap client-side cache of contest_ids the current user has bought a
 * ticket for. Populates once on mount when the user is signed in and
 * caches for the session (in-memory + sessionStorage) so contest tiles can
 * render a "Joined" badge without one API call per tile. Invalidate by
 * calling `refreshJoinedIds()` after a successful checkout.
 */
import { useEffect, useState } from 'react';
import { ordersAPI } from './api';

const KEY = 'pl_joined_ids_v1';
let _cache = null; // Set | null

function readSession() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return null; }
}

function writeSession(set) {
  try { sessionStorage.setItem(KEY, JSON.stringify(Array.from(set))); } catch { /* ignore */ }
}

export async function refreshJoinedIds() {
  try {
    const ids = await ordersAPI.myJoinedContestIds();
    _cache = new Set(ids);
    writeSession(_cache);
    return _cache;
  } catch {
    _cache = _cache || new Set();
    return _cache;
  }
}

/**
 * React hook — returns a Set of joined contest_ids. Reactive: refreshes when
 * `user` transitions to signed-in. When signed out, returns empty Set.
 */
export function useJoinedContestIds(user) {
  const [ids, setIds] = useState(() => _cache || readSession() || new Set());
  useEffect(() => {
    if (!user) { _cache = new Set(); setIds(_cache); return; }
    if (_cache && _cache.size > 0) { setIds(_cache); return; }
    let cancelled = false;
    refreshJoinedIds().then(next => { if (!cancelled) setIds(next); });
    return () => { cancelled = true; };
  }, [user?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps
  return ids;
}
