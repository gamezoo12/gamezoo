// Prize League — Game Engine V3 shared utilities.
//
// PRACTICE / DEMO:
//   Random browser-generated rounds.
//
// OFFICIAL V3:
//   config.__official === true
//   config.__sessionSeed supplied by backend
//   => deterministic seeded challenge generation.
//
// Official timing is independently measured by PlayGame.jsx.
// Official points and ticket-attempt enforcement remain backend controlled.

export const now = () => Date.now();


// ------------------------------------------------------------
// Seed helpers
// ------------------------------------------------------------

const hashString = (value) => {
  let h = 2166136261 >>> 0;

  const text = String(value || '');

  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
};


const mulberry32 = (seed) => {
  let state = seed >>> 0;

  return () => {
    state += 0x6D2B79F5;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return (
      ((t ^ (t >>> 14)) >>> 0) /
      4294967296
    );
  };
};


// Create one independent RNG stream per game.
//
// Same:
//   backend seed + game namespace
//
// produces the same generated challenge sequence.
//
// Practice mode deliberately keeps normal Math.random behaviour.
export const createRandomSource = (
  config = {},
  namespace = 'game'
) => {
  const official = Boolean(config?.__official);
  const serverSeed = config?.__sessionSeed;

  if (!official || !serverSeed) {
    return Math.random;
  }

  const combined = [
    serverSeed,
    namespace,
    config?.__attemptNumber || '',
    config?.difficulty || 'medium',
  ].join('|');

  return mulberry32(hashString(combined));
};


// ------------------------------------------------------------
// Random utilities
// ------------------------------------------------------------

export const randomInt = (
  min,
  max,
  rng = Math.random
) =>
  Math.floor(rng() * (max - min + 1)) + min;


export const randomItem = (
  items,
  rng = Math.random
) =>
  items[randomInt(0, items.length - 1, rng)];


export const shuffle = (
  items,
  rng = Math.random
) => {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));

    [copy[i], copy[j]] = [
      copy[j],
      copy[i],
    ];
  }

  return copy;
};


// ------------------------------------------------------------
// Shared scoring helpers
// ------------------------------------------------------------

export const clamp = (
  value,
  min = 0,
  max = 1
) =>
  Math.min(max, Math.max(min, value));


export const normalizeDifficulty = (config = {}) => {
  const value = String(
    config?.difficulty || 'medium'
  ).toLowerCase();

  if (
    ['easy', 'medium', 'hard', 'expert']
      .includes(value)
  ) {
    return value;
  }

  return 'medium';
};


export const difficultyProfile = (
  config,
  profiles
) => {
  const difficulty =
    normalizeDifficulty(config);

  return {
    difficulty,
    ...(profiles[difficulty] ||
      profiles.medium ||
      {}),
  };
};


export const accuracyFromErrors = (
  errors,
  penalty = 0.1
) =>
  clamp(
    1 - Math.max(0, errors) * penalty
  );


export const accuracyFromCorrect = (
  correct,
  total
) => {
  if (!total) return 0;

  return clamp(correct / total);
};


export const createResult = ({
  solved = true,
  accuracy = 1,
  startedAt,
  evidence,
}) => ({
  solved: Boolean(solved),

  accuracy: clamp(
    Number(accuracy) || 0
  ),

  duration_ms: Math.max(
    100,
    Date.now() - startedAt
  ),

  ...(evidence
    ? { evidence }
    : {}),
});
