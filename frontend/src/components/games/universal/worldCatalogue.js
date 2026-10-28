/**
 * Three-world game catalogue. This is a FRONTEND readiness manifest, not an
 * authorization source. All prize-bearing use requires backend registration,
 * server-issued game state, anti-cheat validation, idempotent rewards and
 * world-specific admin enablement.
 *
 * Do not pass practice-only games into existing contest APIs.
 */
export const GAME_WORLDS = Object.freeze(['free_world', 'paid_world', 'impossible_challenges']);
export const GAME_READINESS = Object.freeze({
  PRACTICE: 'practice_only',
  LEGACY: 'existing_game_audit_required',
  VERIFIED: 'server_verified',
});
const practice = (id, label, modes = ['classic']) => Object.freeze({
  id, label, readiness: GAME_READINESS.PRACTICE,
  worlds: Object.freeze(GAME_WORLDS.map(world => Object.freeze({world, enabled: false}))),
  difficulties: Object.freeze(['beginner', 'easy', 'medium', 'hard', 'expert']),
  modes: Object.freeze(modes),
  prizeEligible: false,
});
const legacy = (id, label) => Object.freeze({
  id, label, readiness: GAME_READINESS.LEGACY,
  worlds: Object.freeze(GAME_WORLDS.map(world => Object.freeze({world, enabled: false}))),
  prizeEligible: false,
});
export const UNIVERSAL_GAMES_CATALOGUE = Object.freeze([
  practice('maze_escape_practice', 'Maze Escape', ['classic', 'shortest_path']),
  practice('ball_sort_practice', 'Ball Sort', ['classic']),
  practice('hanoi_practice', 'Tower of Hanoi', ['classic', 'minimum_moves']),
  practice('liquid_sort_practice', 'Liquid Sort & Fill', ['classic']),
  practice('spot_difference_practice', 'Spot the Difference', ['classic']),
  practice('path_connect_practice', 'Path Connect', ['classic']),
  ...[
    ['memory_match','Memory Match'],['number_sequence','Number Sequence'],
    ['target_tap','Target Tap'],['word_unscramble','Word Unscramble'],
    ['emoji_riddle','Emoji Riddle'],['jigsaw_3x3','Jigsaw 3×3'],
    ['jigsaw_4x4','Jigsaw 4×4'],['slider_puzzle','Sliding Puzzle'],
    ['math_sprint','Math Sprint'],['reaction_time','Reaction Time'],
    ['trivia_quiz','Trivia Quiz'],['simon_says','Simon Says'],
    ['whack_a_mole','Whack-a-Mole'],['odd_one_out','Odd One Out'],
    ['color_match','Colour Match'],['pattern_repeat','Pattern Repeat'],
  ].map(([id,label]) => legacy(id,label)),
]);
export const getGameReadiness = id => UNIVERSAL_GAMES_CATALOGUE.find(game => game.id === id) || null;
export function isGameEligibleForWorld(gameId, world, backendVerified = false, adminEnabled = false) {
  const game = getGameReadiness(gameId);
  return Boolean(game && GAME_WORLDS.includes(world) && game.readiness === GAME_READINESS.VERIFIED &&
    game.prizeEligible && backendVerified && adminEnabled && game.worlds.some(w => w.world === world && w.enabled));
}
