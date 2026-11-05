import { ColourCards, colourInit } from './ColourCards';
import { SweetSwap } from './SweetSwap';
import { FourInRow, fourInit } from './FourInRow';
import { LudoRoyale, ludoInit } from './LudoRoyale';
import { SnakesLadders, snakesInit } from './SnakesLadders';
import { SnakeArena } from './SnakeArena';
import { DotsBoxes, dotsInit } from './DotsBoxes';
import { Checkers, checkersInit } from './Checkers';
import { BlockBlast } from './BlockBlast';
import { SeaBattle } from './SeaBattle';

export const PARTY_GAMES = {
  pty_colour_cards: (config, onComplete) => <ColourCards config={config} onComplete={onComplete} />,
  pty_ludo_royale: (config, onComplete) => <LudoRoyale config={config} onComplete={onComplete} />,
  pty_sweet_swap: (config, onComplete) => <SweetSwap config={config} onComplete={onComplete} />,
  pty_four_in_row: (config, onComplete) => <FourInRow config={config} onComplete={onComplete} />,
  pty_snakes_ladders: (config, onComplete) => <SnakesLadders config={config} onComplete={onComplete} />,
  pty_snake_arena: (config, onComplete) => <SnakeArena config={config} onComplete={onComplete} />,
  pty_dots_boxes: (config, onComplete) => <DotsBoxes config={config} onComplete={onComplete} />,
  pty_checkers: (config, onComplete) => <Checkers config={config} onComplete={onComplete} />,
  pty_block_blast: (config, onComplete) => <BlockBlast config={config} onComplete={onComplete} />,
  pty_sea_battle: (config, onComplete) => <SeaBattle config={config} onComplete={onComplete} />,
};

// Games that can be played live with friends (room page renders them with the shared room state).
export const PARTY_ONLINE = {
  pty_ludo_royale: { label: 'Ludo Royale', init: ludoInit, render: (c, done, online) => <LudoRoyale config={c} onComplete={done} online={online} /> },
  pty_colour_cards: { label: 'Colour Clash Cards', init: colourInit, render: (c, done, online) => <ColourCards config={c} onComplete={done} online={online} /> },
  pty_four_in_row: { label: 'Four in a Row', init: fourInit, render: (c, done, online) => <FourInRow config={c} onComplete={done} online={online} /> },
  pty_dots_boxes: { label: 'Dots & Boxes', init: (n) => dotsInit(n, 4), render: (c, done, online) => <DotsBoxes config={c} onComplete={done} online={online} /> },
  pty_checkers: { label: 'Checkers', init: checkersInit, render: (c, done, online) => <Checkers config={c} onComplete={done} online={online} /> },
  pty_snakes_ladders: { label: 'Snakes & Ladders', init: snakesInit, render: (c, done, online) => <SnakesLadders config={c} onComplete={done} online={online} /> },
};

const NO_CLOCK = 'No clock: board games are played at your own pace. Win the race to clear the level.';
export const PARTY_HOW_TO = {
  pty_colour_cards: { objective: 'Get rid of all your cards before the bots do.', controls: 'Play a card that matches the colour or symbol. Skip, Reverse, +2, Wild and Wild +4 work like the classic game. No match? Tap the deck. Down to 2 cards? Tap Shout ONE! first or you draw 2.', clock: 'Turn clock: run out and you draw a card automatically. Match clock: when it ends, the player with the fewest cards wins.' },
  pty_ludo_royale: { objective: 'Get all your blue tokens round the board and into home before your rivals.', controls: 'Tap the dice, then tap a glowing token. You need a 6 to leave base. Land on a rival to send it home. Stars and start squares are safe. A 6, a capture or reaching home gives an extra roll. Three 6s in a row lose the turn.', clock: NO_CLOCK },
  pty_sweet_swap: { solo: true, objective: 'Reach the level target score before your moves run out. Solo game: the host cheers you on.', controls: 'Tap a sweet, then a neighbour to swap. Line up 3 or more. Match 4 for a striped sweet that clears a line, 5 for a colour bomb.', clock: 'Turn clock: wait too long and you lose a move. Level clock: hit the target before it ends.' },
  pty_four_in_row: { objective: 'Connect four yellow discs before the bot connects four red ones.', controls: 'Tap any column to drop a disc. Lines can go across, up or diagonally. Block the bot when it has three.', clock: 'Turn clock: run out and your disc drops in a random column. Match clock: when it ends, the stronger position wins.' },
  pty_snake_arena: { objective: 'Eat fruit and reach the target before the rival snake.', controls: 'Steer with arrow keys, WASD, swipes or the arrow pad. Each fruit makes you longer; gold fruit is worth 2. Hitting a wall, yourself or the rival costs one of your 3 lives.', clock: 'Match clock: when it ends, whoever has eaten the most fruit wins. Snakes speed up every level.' },
  pty_dots_boxes: { objective: 'Claim more boxes than your rivals.', controls: 'Tap a dotted line between two dots to draw it. Close the fourth side of a box to claim it and draw again. Avoid drawing the third side of a box.', clock: 'Turn clock: run out and a random line is drawn for you.' },
  pty_checkers: { objective: 'Capture or block every piece of your rival.', controls: 'Tap one of your red pieces, then a green spot. Pieces move diagonally forward. Captures are compulsory and chain jumps continue. Reach the far row to crown a king that moves both ways.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, more pieces wins.' },
  pty_block_blast: { solo: true, objective: 'Score the level target by blasting full rows and columns.', controls: 'Tap one of the 3 blocks, then tap the board where its top-left square should go. Fill a row or column to blast it; several at once score big combos. You lose if no block fits.', clock: 'Level clock: reach the target before it ends.' },
  pty_sea_battle: { objective: 'Sink the whole enemy fleet before they sink yours.', controls: 'Tap a square in enemy waters to fire. Fire = hit, ring = miss. A hit lets you fire again. Before your first shot you can tap Move my ships to reshuffle your fleet.', clock: 'Turn clock: run out and a random shot is fired. Match clock: when it ends, most hits wins.' },
  pty_snakes_ladders: { objective: 'Reach square 100 first.', controls: 'Tap the dice to move. Ladders lift you up, snakes slide you down. A 6 rolls again. You must land exactly on 100.', clock: NO_CLOCK },
};
