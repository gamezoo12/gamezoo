export const DIFFICULTY_LEVELS = [
  { level: 1, name: 'Starter' }, { level: 2, name: 'Easy' }, { level: 3, name: 'Casual' }, { level: 4, name: 'Medium' },
  { level: 5, name: 'Challenging' }, { level: 6, name: 'Hard' }, { level: 7, name: 'Very Hard' }, { level: 8, name: 'Expert' },
  { level: 9, name: 'Master' }, { level: 10, name: 'Impossible' },
];
export const DEFAULT_DIFFICULTY = 3;

export const difficultyOf = (config) => Math.max(1, Math.min(10, Number(config?.difficulty) || DEFAULT_DIFFICULTY));
export const difficultyName = (level) => DIFFICULTY_LEVELS[Math.max(1, Math.min(10, level)) - 1].name;
// Linear interpolation across levels 1..10, rounded.
export const lerpLevel = (level, at1, at10) => Math.round(at1 + ((at10 - at1) * (level - 1)) / 9);

// Deterministic PRNG so every player at the same difficulty faces the same board.
export function seeded(seed) {
  let s = (seed * 2654435761) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
export function seededShuffle(list, seed) {
  const rnd = seeded(seed);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
