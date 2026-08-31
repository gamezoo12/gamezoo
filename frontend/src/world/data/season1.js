/**
 * Prize League Free World - Season 1.
 *
 * Data/progression contract only.
 * Existing UI is intentionally untouched.
 */

export const SEASON_1_ID = "season-1";
export const SEASON_1_CHAMPIONSHIP_COUNT = 100;
export const LEVELS_PER_CHAMPIONSHIP = 10;

export const SEASON_1_TOTAL_LEVELS =
  SEASON_1_CHAMPIONSHIP_COUNT * LEVELS_PER_CHAMPIONSHIP;

export function getChampionshipLevelRange(championshipNumber) {
  if (
    !Number.isInteger(championshipNumber) ||
    championshipNumber < 1 ||
    championshipNumber > SEASON_1_CHAMPIONSHIP_COUNT
  ) {
    return null;
  }

  return {
    startLevel:
      ((championshipNumber - 1) * LEVELS_PER_CHAMPIONSHIP) + 1,

    endLevel:
      championshipNumber * LEVELS_PER_CHAMPIONSHIP,
  };
}

export function getChampionshipForLevel(levelNumber) {
  if (
    !Number.isInteger(levelNumber) ||
    levelNumber < 1 ||
    levelNumber > SEASON_1_TOTAL_LEVELS
  ) {
    return null;
  }

  return Math.ceil(
    levelNumber / LEVELS_PER_CHAMPIONSHIP
  );
}

export const SEASON_1_CHAMPIONSHIPS =
  Array.from(
    { length: SEASON_1_CHAMPIONSHIP_COUNT },
    (_, index) => {
      const championshipNumber = index + 1;
      const range =
        getChampionshipLevelRange(championshipNumber);

      return {
        seasonId: SEASON_1_ID,
        championshipNumber,

        id:
          `season-1-championship-${championshipNumber}`,

        title:
          `Championship ${championshipNumber}`,

        startLevel: range.startLevel,
        endLevel: range.endLevel,

        levelCount:
          LEVELS_PER_CHAMPIONSHIP,

        challengeId:
          `season-1-championship-${championshipNumber}-challenge`,

        artwork: null,

        defaultUnlocked:
          championshipNumber === 1,
      };
    }
  );

export function getSeason1Championship(championshipNumber) {
  return (
    SEASON_1_CHAMPIONSHIPS[championshipNumber - 1] ?? null
  );
}

export function isChampionshipUnlocked({
  championshipNumber,
  highestUnlockedChampionship = 1,
  adminUnlockedChampionships = [],
}) {
  if (championshipNumber === 1) {
    return true;
  }

  if (
    adminUnlockedChampionships.includes(
      championshipNumber
    )
  ) {
    return true;
  }

  return (
    championshipNumber <= highestUnlockedChampionship
  );
}
