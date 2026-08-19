// Prize League — Game Engine V3 shared utilities.
//
// These utilities create fresh frontend rounds.
// Official elapsed time is independently measured by PlayGame.jsx.
// Official points and ticket-attempt enforcement remain backend controlled.

export const now = () => Date.now();

export const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const randomItem = (items) =>
  items[randomInt(0, items.length - 1)];

export const shuffle = (items) => {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
};

export const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export const normalizeDifficulty = (config = {}) => {
  const value = String(config?.difficulty || 'medium').toLowerCase();

  if (['easy', 'medium', 'hard', 'expert'].includes(value)) {
    return value;
  }

  return 'medium';
};

export const difficultyProfile = (config, profiles) => {
  const difficulty = normalizeDifficulty(config);

  return {
    difficulty,
    ...(profiles[difficulty] || profiles.medium || {}),
  };
};

export const accuracyFromErrors = (errors, penalty = 0.1) =>
  clamp(1 - Math.max(0, errors) * penalty);

export const accuracyFromCorrect = (correct, total) => {
  if (!total) return 0;
  return clamp(correct / total);
};

export const createResult = ({
  solved = true,
  accuracy = 1,
  startedAt,
}) => ({
  solved: Boolean(solved),
  accuracy: clamp(Number(accuracy) || 0),
  duration_ms: Math.max(100, Date.now() - startedAt),
});
