import { ColourCards } from './ColourCards';
import { SweetSwap } from './SweetSwap';
import { FourInRow } from './FourInRow';
import { LudoRoyale } from './LudoRoyale';
import { SnakesLadders } from './SnakesLadders';
import { SnakeArena } from './SnakeArena';

export const PARTY_GAMES = {
  pty_colour_cards: (config, onComplete) => <ColourCards config={config} onComplete={onComplete} />,
  pty_ludo_royale: (config, onComplete) => <LudoRoyale config={config} onComplete={onComplete} />,
  pty_sweet_swap: (config, onComplete) => <SweetSwap config={config} onComplete={onComplete} />,
  pty_four_in_row: (config, onComplete) => <FourInRow config={config} onComplete={onComplete} />,
  pty_snakes_ladders: (config, onComplete) => <SnakesLadders config={config} onComplete={onComplete} />,
  pty_snake_arena: (config, onComplete) => <SnakeArena config={config} onComplete={onComplete} />,
};

const NO_CLOCK = 'No clock: board games are played at your own pace. Win the race to clear the level.';
export const PARTY_HOW_TO = {
  pty_colour_cards: { objective: 'Get rid of all your cards before the bots do.', controls: 'Play a card that matches the colour or symbol. Skip, Reverse, +2, Wild and Wild +4 work like the classic game. No match? Tap the deck. Down to 2 cards? Tap Shout ONE! first or you draw 2.', clock: 'Turn clock: run out and you draw a card automatically. Match clock: when it ends, the player with the fewest cards wins.' },
  pty_ludo_royale: { objective: 'Get all your blue tokens round the board and into home before your rivals.', controls: 'Tap the dice, then tap a glowing token. You need a 6 to leave base. Land on a rival to send it home. Stars and start squares are safe. A 6, a capture or reaching home gives an extra roll. Three 6s in a row lose the turn.', clock: NO_CLOCK },
  pty_sweet_swap: { objective: 'Race your rival to the score target.', controls: 'Tap a sweet, then a neighbour to swap. Line up 3 or more. Match 4 for a striped sweet that clears a line, 5 for a colour bomb.', clock: 'Turn clock: wait too long and you lose a move. Match clock: when it ends, the higher score wins.' },
  pty_four_in_row: { objective: 'Connect four yellow discs before the bot connects four red ones.', controls: 'Tap any column to drop a disc. Lines can go across, up or diagonally. Block the bot when it has three.', clock: 'Turn clock: run out and your disc drops in a random column. Match clock: when it ends, the stronger position wins.' },
  pty_snake_arena: { objective: 'Eat fruit and reach the target before the rival snake.', controls: 'Steer with arrow keys, WASD, swipes or the arrow pad. Each fruit makes you longer; gold fruit is worth 2. Hitting a wall, yourself or the rival costs one of your 3 lives.', clock: 'Match clock: when it ends, whoever has eaten the most fruit wins. Snakes speed up every level.' },
  pty_snakes_ladders: { objective: 'Reach square 100 first.', controls: 'Tap the dice to move. Ladders lift you up, snakes slide you down. A 6 rolls again. You must land exactly on 100.', clock: NO_CLOCK },
};
