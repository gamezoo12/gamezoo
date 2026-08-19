// Prize League Game Engine V3
// Shared deterministic-safe frontend utilities.
// Official score calculation remains backend-controlled.

export const now = () => Date.now();

export const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

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

export const difficultyValue = (
  config,
  easyValue,
  mediumValue,
  hardValue
) => {
  const difficulty = String(config?.difficulty || 'medium').toLowerCase();

  if (difficulty === 'easy') return easyValue;
  if (difficulty === 'hard') return hardValue;

  return mediumValue;
};
