// Level progress for the free games: account when logged in, this device for guests.
import { api } from './api';

const KEY = 'pl-practice-progress';
const readLocal = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const writeLocal = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } };

const applyLocal = (p, gameId, level, stars) => {
  const cur = p[gameId] || { unlocked: 1, stars: {} };
  if (level > cur.unlocked) return p;
  return { ...p, [gameId]: { unlocked: Math.min(100, Math.max(cur.unlocked, level + 1)), stars: { ...cur.stars, [level]: Math.max(cur.stars[level] || 0, stars) } } };
};

export async function loadProgress(user) {
  if (!user) return readLocal();
  const local = readLocal();
  const entries = Object.entries(local).flatMap(([game_id, s]) => Object.entries(s.stars || {}).map(([level, stars]) => ({ game_id, level: Number(level), stars })));
  if (entries.length) {
    try { await api.post('/games/practice/progress', { entries }); localStorage.removeItem(KEY); } catch { /* keep guest copy */ }
  }
  try { return (await api.get('/games/practice/progress')).data.progress || {}; } catch { return {}; }
}

export async function saveLevel(user, progress, gameId, level, stars) {
  const next = applyLocal(progress, gameId, level, stars);
  if (!user) { writeLocal(next); return next; }
  try {
    const { data } = await api.post('/games/practice/progress', { entries: [{ game_id: gameId, level, stars }] });
    return { ...progress, ...(data.progress || {}) };
  } catch { return next; }
}

export const levelState = (progress, gameId) => progress?.[gameId] || { unlocked: 1, stars: {} };
export const totalStars = (s) => Object.values(s?.stars || {}).reduce((a, b) => a + Number(b), 0);
export const levelsCleared = (s) => Object.keys(s?.stars || {}).length;
