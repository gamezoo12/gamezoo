export const SEASON_ONE = {
  id: 'season-1',
  title: 'Prize League World — Season 1',
  headlinePrize: 127500,
  headlinePrizeLabel: 'UP TO £127,500 IN SEASON PRIZES',
  progressionLevels: 500,
  championArenas: 50,
  totalDestinations: 550,
};

export const KINGDOM_REGIONS = [
  {
    id: 1,
    name: 'Royal Village',
    subtitle: 'The Beginning of the Journey',
    levelStart: 1,
    levelEnd: 50,
    theme: 'village',
  },
  {
    id: 2,
    name: 'Emerald Forest Kingdom',
    subtitle: 'Realm of Ancient Trees',
    levelStart: 51,
    levelEnd: 100,
    theme: 'forest',
  },
  {
    id: 3,
    name: 'Riverlands',
    subtitle: 'Kingdom of Bridges & Waterfalls',
    levelStart: 101,
    levelEnd: 150,
    theme: 'river',
  },
  {
    id: 4,
    name: 'Golden Desert Realm',
    subtitle: 'Sands of the Forgotten Kings',
    levelStart: 151,
    levelEnd: 200,
    theme: 'desert',
  },
  {
    id: 5,
    name: 'Mountain Fortress',
    subtitle: 'Citadel Above the Clouds',
    levelStart: 201,
    levelEnd: 250,
    theme: 'mountain',
  },
  {
    id: 6,
    name: 'Frozen Northern Kingdom',
    subtitle: 'The Eternal Winter',
    levelStart: 251,
    levelEnd: 300,
    theme: 'ice',
  },
  {
    id: 7,
    name: 'Ancient Temple Lands',
    subtitle: 'Ruins of the First Champions',
    levelStart: 301,
    levelEnd: 350,
    theme: 'temple',
  },
  {
    id: 8,
    name: 'Volcanic Dark Kingdom',
    subtitle: 'Realm of Fire & Stone',
    levelStart: 351,
    levelEnd: 400,
    theme: 'volcano',
  },
  {
    id: 9,
    name: 'Sky Citadel',
    subtitle: 'Kingdom Above the World',
    levelStart: 401,
    levelEnd: 450,
    theme: 'sky',
  },
  {
    id: 10,
    name: 'Crown Kingdom',
    subtitle: 'The Final Royal Realm',
    levelStart: 451,
    levelEnd: 500,
    theme: 'crown',
  },
];

export function championArenaPrize(arenaNumber) {
  if (arenaNumber >= 1 && arenaNumber <= 5) {
    return arenaNumber * 100;
  }

  return null;
}

export function createSeasonOneDestinations() {
  const destinations = [];

  for (let regionIndex = 0; regionIndex < KINGDOM_REGIONS.length; regionIndex += 1) {
    const region = KINGDOM_REGIONS[regionIndex];

    for (let localLevel = 1; localLevel <= 50; localLevel += 1) {
      const levelNumber = region.levelStart + localLevel - 1;

      destinations.push({
        id: `level-${levelNumber}`,
        type: 'level',
        levelNumber,
        regionId: region.id,
        regionName: region.name,
        localLevel,
        chapter: Math.ceil(levelNumber / 10),
      });

      if (localLevel % 10 === 0) {
        const arenaNumber = Math.ceil(levelNumber / 10);
        const prize = championArenaPrize(arenaNumber);

        destinations.push({
          id: `arena-${arenaNumber}`,
          type: 'arena',
          arenaNumber,
          afterLevel: levelNumber,
          regionId: region.id,
          regionName: region.name,
          prize,
          mysteryPrize: prize == null,
          finalArena: arenaNumber === 50,
        });
      }
    }
  }

  return destinations;
}

export const SEASON_ONE_DESTINATIONS = createSeasonOneDestinations();
