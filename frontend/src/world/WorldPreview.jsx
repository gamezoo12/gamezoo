import React from 'react';

import WorldCanvas
  from './components/WorldCanvas';

/*
 * LOCALHOST-ONLY VISUAL PREVIEW.
 *
 * This state is NEVER used by the production /world route.
 * Real users continue to receive server-authoritative
 * progression through worldAPI.state().
 */
function localPreviewState() {
  const params = new URLSearchParams(window.location.search);
  const activeGc = Math.max(1, Math.min(100, Number(params.get('gc')) || 1));
  const cohortGc = Math.max(1, Math.min(activeGc, Number(params.get('cohort')) || activeGc));
  const championStage = Math.max(1, activeGc - cohortGc + 1);
  const currentLevel = Math.max(1, Math.min(10, Number(params.get('level')) || 1));
  const championResult = ['passed', 'failed', 'pending', 'missed'].includes(params.get('champion'))
    ? params.get('champion')
    : null;
  const now = Date.now();
  const currentLevels = Array.from({ length: 10 }, (_, index) => {
    const level = index + 1;
    const completed = level < currentLevel;
    const available = level === currentLevel;
    return {
      level,
      available,
      completed,
      locked: !available && !completed,
      lock_reason: completed || available ? null : 'progression',
      sequence_available: available,
      time_available: true,
      seconds_until_unlock: 0,
    };
  });
  const championshipHistory = Array.from({ length: championStage - 1 }, (_, index) => {
    const championship = index + 1;
    return {
      championship,
      levels: Array.from({ length: 10 }, (_, levelIndex) => ({
        level: levelIndex + 1,
        status: levelIndex < (championship % 2 ? 5 : 10) ? 'completed' : 'missed',
      })),
      champion_status: championship % 2 ? 'passed' : 'failed',
    };
  });
  const upcomingStarts = Object.fromEntries(
    Array.from({ length: Math.min(4, 100 - championStage) }, (_, index) => [
      String(championStage + index + 1),
      new Date(now + (index + 1) * 12 * 24 * 60 * 60 * 1000).toISOString(),
    ]),
  );

  return {
    season_id: 'season-1',
    server_now: new Date(now).toISOString(),
    progress: {
      current_level: currentLevel,
      highest_unlocked_level: currentLevel,
      completed_levels: currentLevels.filter((level) => level.completed).map((level) => level.level),
      champion_stage: championStage,
      champion_ready: currentLevel === 10,
      free_world_started_global_contest: cohortGc,
      skipped_levels: [],
      catchup_mode: false,
    },
    current_level: currentLevels[currentLevel - 1],
    levels: currentLevels,
    championship_history: championshipHistory,
    upcoming_championship_starts: upcomingStarts,
    champion: {
      unlocked: currentLevel === 10,
      completed: championResult === 'passed',
      result_status: championResult,
      champion_opens_at: new Date(now - 60 * 60 * 1000).toISOString(),
      champion_closes_at: new Date(
        now + (championResult === 'missed' ? -60 * 60 * 1000 : 46 * 60 * 60 * 1000),
      ).toISOString(),
      next_level_opens_at: new Date(now + 48 * 60 * 60 * 1000).toISOString(),
    },
  };
}

export default function WorldPreview() {
  const isLocal =
    window.location.hostname ===
      'localhost' ||
    window.location.hostname ===
      '127.0.0.1';

  if (!isLocal) {
    return (
      <div>
        Preview unavailable.
      </div>
    );
  }

  return (
    <WorldCanvas
      previewState={
        localPreviewState()
      }
    />
  );
}
