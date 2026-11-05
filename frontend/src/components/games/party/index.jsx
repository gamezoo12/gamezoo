import { ColourCards } from './ColourCards';
import { SweetSwap } from './SweetSwap';
import { FourInRow } from './FourInRow';
import { LudoRoyale, SnakesLadders } from './DiceRace';

export const PARTY_GAMES = {
  pty_colour_cards: (config, onComplete) => <ColourCards config={config} onComplete={onComplete} />,
  pty_ludo_royale: (config, onComplete) => <LudoRoyale config={config} onComplete={onComplete} />,
  pty_sweet_swap: (config, onComplete) => <SweetSwap config={config} onComplete={onComplete} />,
  pty_four_in_row: (config, onComplete) => <FourInRow config={config} onComplete={onComplete} />,
  pty_snakes_ladders: (config, onComplete) => <SnakesLadders config={config} onComplete={onComplete} />,
};

export const PARTY_HOW_TO = {
  pty_colour_cards: { objective: 'Get rid of all your cards before the bots do.', controls: 'Tap a card that matches the top card by colour or symbol. +2 makes the next player draw 2, ⦸ skips, ⇄ reverses. No match? Tap DRAW.' },
  pty_ludo_royale: { objective: 'Race all your yellow tokens round the board and home before the rivals.', controls: 'Tap the dice, then tap a glowing token. Land on a rival to knock it home; coloured squares are safe. A 6 gives another roll.' },
  pty_sweet_swap: { objective: 'Reach the score target before your moves run out.', controls: 'Tap a sweet, then a neighbour to swap them. Line up 3 or more of the same sweet. Chain reactions score combo bonuses.' },
  pty_four_in_row: { objective: 'Connect four yellow discs in a row before the AI connects four red ones.', controls: 'Tap any column to drop a disc. Lines can be across, up or diagonal. Block the AI when it has three.' },
  pty_snakes_ladders: { objective: 'Reach square 100 first.', controls: 'Roll two dice and pick the one that moves you best. Ladders lift you up, snakes slide you down. You must land exactly on 100.' },
};
