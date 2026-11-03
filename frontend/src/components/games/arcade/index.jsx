import * as A from './stylesA';
import * as B from './stylesB';
import { ARCADE_THEMES } from './kit';

// Must mirror backend/services/arcade_catalog.py (ids arc_<style>_<theme>).
export const ARCADE_STYLES = {
  balloon_pop: A.BalloonPop, catch_fall: A.CatchFall, higher_lower: A.HigherLower, scratch_reveal: A.ScratchReveal,
  stack_tower: A.StackTower, dodge_runner: A.DodgeRunner, spin_match: A.SpinMatch, bubble_burst: A.BubbleBurst,
  quick_quiz: A.QuickQuiz, find_odd: A.FindOdd, memory_flip: B.MemoryFlip, tap_order: B.TapOrder,
  shell_game: B.ShellGame, light_chase: B.LightChase, count_flash: B.CountFlash, pair_link: B.PairLink,
  rhythm_tap: B.RhythmTap, word_guess: B.WordGuess, treasure_dig: B.TreasureDig, safe_cracker: B.SafeCracker,
};

export const ARCADE_GAMES = Object.fromEntries(
  Object.entries(ARCADE_STYLES).flatMap(([style, Game]) => Object.keys(ARCADE_THEMES).map((theme) => [
    `arc_${style}_${theme}`,
    // eslint-disable-next-line react/display-name
    (config, onComplete) => <Game key={`${style}-${theme}`} theme={theme} config={config} onComplete={onComplete} />,
  ])),
);
