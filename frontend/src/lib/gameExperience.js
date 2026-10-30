export const RESULT_QUOTES = {
  success: [
    'Brilliant focus. You made every second count! 🏆✨',
    'That was all skill, and it showed. Enjoy the win! 🎯🎉',
    'You showed up, locked in, and got it done! 🚀👏',
    'A fantastic finish. Your next great run starts here! 🌟🥇',
    'Look at you go! That challenge never stood a chance! 💥🏆',
  ],
  retry: [
    'Ooh, a tough round! Your focus is getting stronger every try. 💪✨',
    'Not this time, and that is okay. Take a breath and come back swinging! 🌈🎯',
    'Every attempt is practice for your next great run. You have got this! 🚀💛',
    'That was a close one! Reset, refocus, and give it another go. 🔄⭐',
    'The best runs have a few plot twists. Your comeback can start now! 🎬💪',
    'Keep that determination. One round never defines your skill! 🌟🙌',
  ],
};

export function pickResultQuote(solved, previous = '') {
  const pool = solved ? RESULT_QUOTES.success : RESULT_QUOTES.retry;
  const choices = pool.filter((quote) => quote !== previous);
  return choices[Math.floor(Math.random() * choices.length)] || pool[0];
}

export const GAME_EXPERIENCE = {
  memory_match: { objective: 'Match all 8 image pairs.', controls: 'Tap two cards to reveal them. Matched pairs stay face up.', win: 'Find every matching pair.', mistakes: 'Unmatched cards turn back over; fewer moves improve your accuracy.', timer: 'The server measures your verified completion time for the leaderboard.' },
  number_sequence: { objective: 'Tap the numbers in ascending order.', controls: 'Select the next number shown in the progress display.', win: 'Reach the final number without running out of time.', mistakes: 'Out-of-order taps do not advance the sequence.', timer: 'The official countdown is enforced by the server.' },
  target_tap: { objective: 'Hit the moving target as accurately as you can.', controls: 'Tap the target when it appears.', win: 'Complete every target round.', mistakes: 'Missed taps reduce your accuracy.', timer: 'Your official time is measured by the server.' },
  word_unscramble: { objective: 'Rebuild the hidden word from its scrambled letters.', controls: 'Choose or arrange letters using the controls shown.', win: 'Submit the correctly spelled word.', mistakes: 'Incorrect guesses reduce your accuracy.', timer: 'Your official time is measured by the server.' },
  emoji_riddle: { objective: 'Decode the phrase represented by the emoji clues.', controls: 'Choose the answer that matches the clue.', win: 'Solve the riddle correctly.', mistakes: 'Wrong answers reduce your accuracy.', timer: 'Your official time is measured by the server.' },
  jigsaw_3x3: { objective: 'Restore the picture by arranging its nine tiles.', controls: 'Tap a tile to move it into the empty space.', win: 'Recreate the reference image.', mistakes: 'Extra moves affect your efficiency score.', timer: 'Your official time is measured by the server.' },
  jigsaw_4x4: { objective: 'Restore the picture by arranging its sixteen tiles.', controls: 'Tap a tile to move it into the empty space.', win: 'Recreate the reference image.', mistakes: 'Extra moves affect your efficiency score.', timer: 'Your official time is measured by the server.' },
  slider_puzzle: { objective: 'Slide the numbered tiles into their correct order.', controls: 'Move a tile into the adjacent empty cell.', win: 'Arrange the board from 1 to 15.', mistakes: 'Extra moves affect your efficiency score.', timer: 'Your official time is measured by the server.' },
  math_sprint: { objective: 'Solve each quick arithmetic question accurately.', controls: 'Select the correct answer before moving on.', win: 'Answer every question.', mistakes: 'Wrong answers lower your accuracy.', timer: 'Your official time is measured by the server.' },
  reaction_time: { objective: 'React as soon as the signal appears.', controls: 'Wait for the prompt, then tap once.', win: 'Complete the reaction rounds.', mistakes: 'Tapping early counts against your result.', timer: 'Your official response time is measured by the server.' },
  trivia_quiz: { objective: 'Answer the quiz questions correctly.', controls: 'Select one answer for each question.', win: 'Complete the quiz with the best accuracy you can.', mistakes: 'Incorrect answers reduce your score.', timer: 'Your official time is measured by the server.' },
  simon_says: { objective: 'Remember and repeat the growing colour sequence.', controls: 'Tap the lights in the same order they flash.', win: 'Complete the target sequence.', mistakes: 'An incorrect sequence ends the run.', timer: 'Your official time is measured by the server.' },
  whack_a_mole: { objective: 'Catch each target as it appears.', controls: 'Tap the active target; ignore empty spaces.', win: 'Reach the target number of hits.', mistakes: 'Misses reduce your accuracy.', timer: 'Your official time is measured by the server.' },
  odd_one_out: { objective: 'Spot the item that does not match the group.', controls: 'Tap the odd item in each round.', win: 'Correctly identify every round’s outlier.', mistakes: 'Wrong choices reduce your accuracy.', timer: 'Your official time is measured by the server.' },
  color_match: { objective: 'Name the ink colour, not the word being displayed.', controls: 'Tap the colour label matching the ink.', win: 'Answer all rounds accurately.', mistakes: 'Choosing the printed word is a common trap.', timer: 'Your official time is measured by the server.' },
  pattern_repeat: { objective: 'Observe and repeat the shown pattern.', controls: 'Tap the same tiles in the same order.', win: 'Complete the target sequence length.', mistakes: 'A wrong tile ends the sequence.', timer: 'Your official time is measured by the server.' },
  sudoku_mini: { objective: 'Complete the 4×4 Sudoku grid.', controls: 'Fill empty cells with 1–4.', win: 'Each row, column and 2×2 box must contain 1–4 once.', mistakes: 'Incorrect entries lower your accuracy.', timer: 'Your official time is measured by the server.' },
  sequence_predict: { objective: 'Find the rule in each number sequence.', controls: 'Choose the number that comes next.', win: 'Answer the sequence questions correctly.', mistakes: 'Wrong answers reduce your accuracy.', timer: 'Your official time is measured by the server.' },
  countdown_numbers: { objective: 'Combine the available numbers to reach the target.', controls: 'Use the displayed operations and number tiles.', win: 'Reach the target using a valid calculation.', mistakes: 'Invalid calculations do not solve the round.', timer: 'Your official time is measured by the server.' },
  word_ladder: { objective: 'Transform the starting word into the goal word.', controls: 'Change one letter at a time to make a valid word.', win: 'Reach the target word using valid steps.', mistakes: 'Invalid words do not advance the ladder.', timer: 'Your official time is measured by the server.' },
  chess_mate_in_one: { objective: 'Find the move that delivers checkmate.', controls: 'Select the piece and its destination square.', win: 'Choose a legal checkmating move.', mistakes: 'A non-mating move does not solve the puzzle.', timer: 'Your official time is measured by the server.' },
  tower_of_hanoi: { objective: 'Move the tower to the destination peg.', controls: 'Move one disc at a time; never place a larger disc on a smaller one.', win: 'Stack every disc on the target peg.', mistakes: 'Illegal moves are not accepted; extra moves reduce efficiency.', timer: 'Your official time is measured by the server.' },
  lights_out: { objective: 'Turn every light off.', controls: 'Tap a cell to toggle it and its neighbours.', win: 'Clear the entire board.', mistakes: 'Each tap changes multiple cells; plan the pattern.', timer: 'Your official time is measured by the server.' },
  minesweeper_mini: { objective: 'Reveal safe cells without hitting a mine.', controls: 'Tap cells to reveal them; use the numbers as clues.', win: 'Reveal enough safe cells to clear the board.', mistakes: 'A mine ends the run.', timer: 'Your official time is measured by the server.' },
  nonogram_mini: { objective: 'Reveal the picture encoded by the row and column clues.', controls: 'Mark cells as filled or empty to match each clue.', win: 'Complete the 5×5 picture.', mistakes: 'Incorrect cells reduce your accuracy.', timer: 'Your official time is measured by the server.' },
  tf2048_mini: { objective: 'Combine matching tiles to reach 32.', controls: 'Swipe or use the directional controls to move the board.', win: 'Create a tile of 32.', mistakes: 'Plan moves to avoid filling the board.', timer: 'Your official time is measured by the server.' },
  cryptogram: { objective: 'Decode the encrypted phrase.', controls: 'Use letter patterns to enter the original phrase.', win: 'Submit the exact decoded phrase.', mistakes: 'Incorrect guesses can be revised.', timer: 'Your official time is measured by the server.' },
  anagram_finder: { objective: 'Find valid words from the supplied letters.', controls: 'Enter or select words using the available letters.', win: 'Find the required number of valid words.', mistakes: 'Invalid words do not count.', timer: 'Your official time is measured by the server.' },
  maze_solver: { objective: 'Navigate from the maze entrance to its exit.', controls: 'Use the directional controls to move through open paths.', win: 'Reach the exit.', mistakes: 'Dead ends cost time; retrace your route.', timer: 'Your official time is measured by the server.' },
  spot_pattern: { objective: 'Identify the item that breaks the visual pattern.', controls: 'Tap the odd shape in each round.', win: 'Answer every pattern round.', mistakes: 'Wrong selections lower your accuracy.', timer: 'Your official time is measured by the server.' },
};

export function gameExperienceFor(gameId) {
  return GAME_EXPERIENCE[gameId] || null;
}

const SOUND_KEY = 'pl-game-sound-enabled';
let audioContext;
export function gameSoundEnabled() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}
export function setGameSoundEnabled(enabled) {
  try { localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off'); } catch {}
  window.dispatchEvent(new Event('pl-game-sound-change'));
}
export function playGameSound(kind = 'tap') {
  if (!gameSoundEnabled()) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    audioContext ||= new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const patterns = { tap: [520, 0.045], correct: [760, 0.12], incorrect: [190, 0.16],
      countdown: [430, 0.09], start: [880, 0.2], success: [1040, 0.28], failure: [150, 0.3] };
    const [frequency, duration] = patterns[kind] || patterns.tap;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.08, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(now); oscillator.stop(now + duration);
  } catch {}
}