export const COMPETITION_SECTIONS = [
  { key: 'mega', label: 'Mega Draws', subtitle: 'Big prizes and featured competitions' },
  { key: 'instant', label: 'Instant Wins', subtitle: 'Fast entries and instant results' },
  { key: 'daily-draws', label: 'Daily Draw', subtitle: 'New draw competitions every day' },
  { key: 'skill', label: 'Skill Contests', subtitle: 'Compete on the skill leaderboard' },
];

export function competitionSectionOf(contest) {
  const category = String(contest?.category || '').toLowerCase();
  if (COMPETITION_SECTIONS.some(section => section.key === category)) return category;
  if (category === 'instant-wins') return 'instant';
  if (category === 'jackpot' || contest?.jackpot || contest?.featured) return 'mega';
  if (category === 'prize-draws') return 'daily-draws';
  if (contest?.engine_type === 'instant_win') return 'instant';
  if (contest?.engine_type === 'random_draw') return 'daily-draws';
  if (contest?.engine_type === 'leaderboard' || contest?.game_type || contest?.gameType) return 'skill';
  return 'skill';
}
