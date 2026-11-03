// Unique free-play games (one card per game, no themed duplicates) with a 10-level ladder.
import { GAME_MAP } from '../components/games';
import { ARCADE_STYLE_META, ARCADE_THEME_LABELS } from './arcadeMeta';
import { gameExperienceFor } from './gameExperience';
import { gameCover } from './gameCovers';

export const LEVELS = 10;
const THEME_IDS = Object.keys(ARCADE_THEME_LABELS);
const NAMES = {
  jigsaw_3x3: 'Picture Jigsaw', jigsaw_4x4: 'Picture Jigsaw Pro', number_sequence: 'Number Sequence', slider_puzzle: 'Slide Puzzle',
  math_sprint: 'Math Sprint', odd_one_out: 'Odd One Out', color_match: 'Colour Clash', pattern_repeat: 'Pattern Pulse',
  sudoku_mini: 'Sudoku', tf2048_mini: '2048', minesweeper_mini: 'Minesweeper', nonogram_mini: 'Picross', tower_of_hanoi: 'Tower of Hanoi',
};
const CATS = { puzzle: 'Puzzle', memory: 'Memory', reaction: 'Reaction', trivia: 'Trivia', word: 'Word', logic: 'Logic', math: 'Maths', strategy: 'Strategy', deduction: 'Logic', spatial: 'Puzzle', reasoning: 'Logic' };

const arcadeStyle = (id) => (id.startsWith('arc_') ? Object.keys(ARCADE_STYLE_META).find((s) => id === `arc_${s}` || id.startsWith(`arc_${s}_`)) : null);
export const uniqueIdFor = (id) => { const s = arcadeStyle(id || ''); return s ? `arc_${s}` : id; };

// types: /api/games/types list. selected: admin-picked premium ids (null = all).
export function uniqueGames(types, selected = null) {
  const byId = Object.fromEntries((types || []).map((g) => [g.id, g]));
  const premium = (types || []).filter((g) => g.family !== 'arcade' && GAME_MAP[g.id] && (!selected || selected.includes(g.id)))
    .map((g) => ({ id: g.id, label: NAMES[g.id] || g.label.replace(/\s*\(.*\)\s*$/, ''), category: CATS[g.category] || 'Skill', target: g.target_time_s || 60 }));
  const arcade = Object.entries(ARCADE_STYLE_META).filter(([s]) => byId[`arc_${s}_fruit`])
    .map(([s, m]) => ({ id: `arc_${s}`, label: m[0], category: m[1], target: byId[`arc_${s}_fruit`].target_time_s || 45, style: s }));
  return [...premium, ...arcade].map((g) => ({ ...g, cover: gameCover(g.id) }));
}

export const sequenceCount = (level) => level * 10;

export function timeLimit(game, level) {
  if (game.id === 'number_sequence') return Math.round(sequenceCount(level) * (1.5 - 0.06 * (level - 1)));
  return Math.max(15, Math.round(game.target * (2.2 - 0.13 * (level - 1))));
}

export function starsFor(limitS, result) {
  const ratio = (result.duration_ms / 1000) / limitS;
  if (ratio <= 0.5 && (result.accuracy ?? 1) >= 0.8) return 3;
  return ratio <= 0.8 ? 2 : 1;
}

export function renderLevel(game, level, onComplete) {
  const config = { difficulty: level, practice_mode: true, public_preview: true };
  if (game.style) return GAME_MAP[`arc_${game.style}_${THEME_IDS[(level - 1) % THEME_IDS.length]}`]?.(config, onComplete);
  if (game.id === 'number_sequence') config.count = sequenceCount(level);
  return GAME_MAP[game.id]?.(config, onComplete);
}

export function howToPlay(game) {
  if (game.style) { const m = ARCADE_STYLE_META[game.style]; return { objective: m[2], controls: m[3] }; }
  if (game.id === 'number_sequence') return { objective: 'Tap every number in order, starting from 1.', controls: 'Find the next number on the board and tap it. Wrong taps cost accuracy.' };
  const g = gameExperienceFor(game.id) || {};
  return { objective: g.objective, controls: g.controls, mistakes: g.mistakes };
}

export const levelGoal = (game, level) => (game.id === 'number_sequence' ? `Tap 1 → ${sequenceCount(level)} in order` : game.style ? `New theme: ${Object.values(ARCADE_THEME_LABELS)[(level - 1) % THEME_IDS.length]}` : null);
