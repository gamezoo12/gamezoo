// Labels + how-to-play text for the 100 arcade games (20 styles x 5 themes). Mirrors backend arcade_catalog.py.
export const ARCADE_THEME_LABELS = { fruit: 'Fruit Fiesta', space: 'Cosmic Quest', football: 'Stadium Stars', ocean: 'Ocean Treasure', party: 'Party Night', christmas: 'Christmas Magic', halloween: 'Halloween Night', summer: 'Summer Splash' };

export const ARCADE_STYLE_META = {
  balloon_pop: ['Balloon Pop', 'Arcade', 'Pop the rising balloons.', 'Tap each balloon before it floats away.'],
  catch_fall: ['Catch the Prizes', 'Arcade', 'Catch the falling prizes.', 'Tap a lane to move the basket. Avoid the bad item.'],
  higher_lower: ['Higher or Lower', 'Luck & Skill', 'Build a winning streak.', 'Guess if the next number is higher or lower.'],
  scratch_reveal: ['Scratch & Reveal', 'Luck & Skill', 'Find three matching symbols.', 'Tap tiles to scratch them open.'],
  stack_tower: ['Stack the Tower', 'Timing', 'Build the tallest tower.', 'Tap when the sliding block is centred.'],
  dodge_runner: ['Dodge Runner', 'Arcade', 'Dodge the hazards.', 'Tap a lane to switch and stay clear of hazards.'],
  spin_match: ['Spin Match', 'Timing', 'Stop every reel on the target.', 'Press STOP when the target symbol is showing.'],
  bubble_burst: ['Bubble Burst', 'Puzzle', 'Burst bubble clusters.', 'Tap groups of 2 or more matching bubbles.'],
  quick_quiz: ['Quick Quiz', 'Trivia', 'Name every picture.', 'Tap the picture that matches the word.'],
  find_odd: ['Find the Odd One', 'Observation', 'Spot the different symbol.', 'Tap the one tile that does not match.'],
  memory_flip: ['Memory Flip', 'Memory', 'Match all the pairs.', 'Flip two cards at a time to find pairs.'],
  tap_order: ['Tap in Order', 'Reaction', 'Tap the numbers in order.', 'Start at 1 and keep counting up.'],
  shell_game: ['Shell Game', 'Observation', 'Follow the hidden prize.', 'Watch the cups shuffle, then tap the right one.'],
  light_chase: ['Light Chase', 'Reaction', 'Catch the moving light.', 'Tap the glowing tile before it jumps.'],
  count_flash: ['Count Flash', 'Memory', 'Count the target symbol.', 'Memorise the flash, then pick the right count.'],
  pair_link: ['Pair Link', 'Word', 'Link pictures to names.', 'Tap a picture, then tap its name.'],
  rhythm_tap: ['Rhythm Tap', 'Timing', 'Hit every beat.', 'Tap when the marker is inside the glowing zone.'],
  word_guess: ['Word Guess', 'Word', 'Reveal the hidden word.', 'Tap letters to fill in the themed word.'],
  treasure_dig: ['Treasure Dig', 'Luck & Skill', 'Find the buried treasure.', 'Dig tiles and follow the hot and cold hints.'],
  safe_cracker: ['Safe Cracker', 'Logic', 'Crack the safe code.', 'Set each digit and use the ⬆️⬇️ hints to adjust.'],
};

export const ARCADE_CATALOG = Object.entries(ARCADE_STYLE_META).flatMap(([style, [label, category]]) =>
  Object.entries(ARCADE_THEME_LABELS).map(([theme, tl]) => ({ id: `arc_${style}_${theme}`, label: `${label} · ${tl}`, category: `Arcade: ${category}` })));

export function arcadeExperience(gameId) {
  const m = /^arc_([a-z_]+?)_(fruit|space|football|ocean|party|christmas|halloween|summer)$/.exec(gameId || '');
  const meta = m && ARCADE_STYLE_META[m[1]];
  return meta ? { objective: meta[2], controls: meta[3], win: 'Finish the challenge as fast and accurately as you can.' } : null;
}
