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
import { MemoryDuel, memoryInit } from './MemoryDuel';
import { DUELS as DUELS1, duelRender } from './duelGames';
import { DUELS2 } from './duelGames2';
import { SOLOS as SOLOS1, soloRender } from './solo';
import { DUELS3, SOLOS2 } from './batch3';
import { duelInit } from './duel';
import { DUELS4 } from './duels4';
import { DUELS5 } from './duels5';
import { DUELS6 } from './duels6';
import { SOLOS3 } from './solos3';
import { SOLOS4 } from './solos4';
import { SOLOS5 } from './solos5';

const DUELS = { ...DUELS1, ...DUELS2, ...DUELS3, ...DUELS4, ...DUELS5, ...DUELS6 };
const SOLOS = { ...SOLOS1, ...SOLOS2, ...SOLOS3, ...SOLOS4, ...SOLOS5 };

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
  pty_memory_duel: (config, onComplete) => <MemoryDuel config={config} onComplete={onComplete} />,
  ...Object.fromEntries(Object.entries(DUELS).map(([id, def]) => [id, duelRender(def)])),
  ...Object.fromEntries(Object.entries(SOLOS).map(([id, def]) => [id, soloRender(def)])),
};

// Games that can be played live with friends (room page renders them with the shared room state).
export const PARTY_ONLINE = {
  pty_ludo_royale: { label: 'Ludo Royale', init: ludoInit, render: (c, done, online) => <LudoRoyale config={c} onComplete={done} online={online} /> },
  pty_colour_cards: { label: 'Colour Clash Cards', init: colourInit, render: (c, done, online) => <ColourCards config={c} onComplete={done} online={online} /> },
  pty_four_in_row: { label: 'Four in a Row', init: fourInit, render: (c, done, online) => <FourInRow config={c} onComplete={done} online={online} /> },
  pty_dots_boxes: { label: 'Dots & Boxes', init: (n) => dotsInit(n, 4), render: (c, done, online) => <DotsBoxes config={c} onComplete={done} online={online} /> },
  pty_checkers: { label: 'Checkers', init: checkersInit, render: (c, done, online) => <Checkers config={c} onComplete={done} online={online} /> },
  pty_memory_duel: { label: 'Memory Duel', init: (n) => memoryInit(n, 10), render: (c, done, online) => <MemoryDuel config={c} onComplete={done} online={online} /> },
  ...Object.fromEntries(Object.entries(DUELS).map(([id, def]) => [id, { label: def.title, init: () => duelInit(def), render: duelRender(def) }])),
  pty_snakes_ladders: { label: 'Snakes & Ladders', init: snakesInit, render: (c, done, online) => <SnakesLadders config={c} onComplete={done} online={online} /> },
};

const DC = 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.';
const SC = 'Level clock: solve it before it ends.';
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
  pty_memory_duel: { objective: 'Find more matching pairs than your rivals.', controls: 'On your turn flip two cards. A pair is yours and you go again; no match and the turn passes. Watch every flip: the bots remember more on harder levels.', clock: 'Turn clock: run out and a random card is flipped for you.' },
  pty_reversi: { objective: 'Finish with more white discs than black.', controls: 'Tap a glowing dot to place a disc. Every black line you trap between two whites flips to white. Corners can never flip, so grab them!', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_gomoku: { objective: 'Be first to line up five stones in a row.', controls: 'Tap any empty point to place a jade stone. Five in a row across, down or diagonally wins. Block the bot when it has four.', clock: 'Turn clock: run out and a random stone is placed. Match clock: when it ends, the better position wins.' },
  pty_tictactoe: { objective: 'Line up your X before the bot lines up its O.', controls: 'Tap an empty square. 3x3 needs three in a row; on bigger boards in later levels you need four. A draw does not clear the level.', clock: 'Turn clock: run out and a random square is taken. Match clock: when it ends, the better position wins.' },
  pty_mancala: { objective: 'Collect more gems in your store (right) than the rival.', controls: 'Tap one of your bottom pits to sow its gems one by one anticlockwise. Land in your store for an extra turn. Land in an empty pit on your side to capture the gems opposite.', clock: 'Turn clock: run out and a random pit is played. Match clock: when it ends, the better position wins.' },
  pty_isolation: { objective: 'Leave the rival with no square to move to.', controls: 'Tap your king, then a green square next to it (any direction). The square you leave crumbles forever. If you cannot move on your turn, you lose.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_breakthrough: { objective: 'Get one pawn to the far row, or capture every rival pawn.', controls: 'Tap a blue pawn, then a green square. Pawns move one step forward or diagonally forward, and capture only diagonally.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_domineering: { objective: 'Make the last domino move.', controls: 'You place vertical dominoes, the bot places horizontal ones. Tap the top square of a free vertical pair. Whoever cannot place a domino loses.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_clobber: { objective: 'Make the last capture.', controls: 'Tap one of your blue stones, then an enemy stone directly next to it (not diagonal) to clobber it. If you have no capture on your turn, you lose.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_nim: { objective: 'Take the very last matchstick.', controls: 'On your turn tap a stick: you take it and every stick to its right in that row. Take as many as you like, but only from one row.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_hex: { objective: 'Build a chain of blue cells from the top edge to the bottom edge.', controls: 'Tap any empty hexagon. The bot is trying to link left to right. Hex can never end in a draw: block and build at the same time.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_treblecross: { objective: 'Be the one who completes three Xs in a row.', controls: 'Both players place the same X on one strip. Whoever makes three in a row wins, so never leave two Xs with a gap the rival can finish.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_morris: { objective: 'Get three of your pieces in a row.', controls: 'First each player places 3 pieces. After that, tap one of your pieces and slide it to a free neighbouring point (lines through the centre count). Three in a row wins.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_fox_hounds: { objective: 'Trap the fox with your 4 hounds.', controls: 'Hounds move one square diagonally up; the fox moves diagonally in any direction. Box the fox in so it cannot move. If it slips past all your hounds, the fox wins.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_lights_out: { solo: true, objective: 'Switch every light off.', controls: 'Tapping a light flips it and its four neighbours. Plan your taps: you only have a limited number.', clock: 'Level clock: solve it before it ends.' },
  pty_flood_fill: { solo: true, objective: 'Turn the whole board one colour.', controls: 'Tap a colour button: the area from the top-left corner floods into that colour and grows. Finish within the move limit.', clock: 'Level clock: solve it before it ends.' },
  pty_peg_solitaire: { solo: true, objective: 'Leave as few pegs as the level goal.', controls: 'Tap a peg, then a green hole two squares away to jump over a neighbouring peg and remove it. Jumps are straight only.', clock: 'Level clock: solve it before it ends.' },
  pty_code_breaker: { solo: true, objective: 'Crack the secret colour code.', controls: 'Tap colours to fill a guess, then Check. Green pin = right colour in the right spot, yellow = right colour, wrong spot. Use the clues before guesses run out.', clock: 'Level clock: solve it before it ends.' },
  pty_sim: { objective: 'Make the rival close a triangle in their own colour.', controls: 'Take turns tapping a dashed line between two of the 6 dots. If three of your blue lines form a triangle, you lose.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_chomp: { objective: 'Make the rival eat the poisoned square.', controls: 'Tap any square to bite it plus every square below and to its right. Whoever has to eat the green poisoned square (top-left) loses.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_kayles: { objective: 'Knock down the very last pin.', controls: 'Tap a pin to knock it down, or tap the glowing gap between two standing neighbours to knock both. Whoever knocks the last pin wins.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_notakto: { objective: 'Never be the one who completes three in a row.', controls: 'Both players place the same X. A board with a full line is dead. Whoever kills the last board loses.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_same_game: { solo: true, objective: 'Reach the points target by popping groups.', controls: 'Tap a group of 2 or more touching bubbles of the same colour to pop them. Bigger groups score much more. Bubbles fall down and columns slide left.', clock: 'Level clock: solve it before it ends.' },
  pty_ball_sort: { solo: true, objective: 'Sort every colour into its own tube.', controls: 'Tap a tube to pick up its top ball, then tap another tube to drop it. You can only drop onto the same colour or into an empty tube. Each tube holds 4.', clock: 'Level clock: solve it before it ends.' },
  pty_tile_triple: { solo: true, objective: 'Clear every tile from the board.', controls: 'Tap tiles to move them into the 7-slot tray. Three matching tiles in the tray vanish. If the tray fills up, you lose.', clock: 'Level clock: solve it before it ends.' },
  pty_star_lights: { solo: true, objective: 'Switch every star light off.', controls: 'Tapping a light flips it and its four diagonal neighbours. Plan ahead: you only have a limited number of taps.', clock: 'Level clock: solve it before it ends.' },
  pty_misere_ttt: { objective: 'Avoid making three in a row: whoever completes a line LOSES.', controls: 'Tap an empty square to place your X. Force the bot to finish a line of O.', clock: DC },
  pty_tiny_drop: { objective: 'Connect three of your discs before the bot.', controls: 'Tap a column to drop a disc to the lowest free spot. Lines can go across, up or diagonally.', clock: DC },
  pty_dont_connect: { objective: 'Never be the one who makes four in a row.', controls: 'Tap a column to drop a disc. Whoever connects four of their own colour loses, so leave the bot no safe column.', clock: DC },
  pty_order_chaos: { objective: 'You are Order: get five of the SAME symbol in a row. The bot is Chaos and tries to fill the board first.', controls: 'Pick X or O at the top, then tap an empty square. Both sides may place either symbol.', clock: DC },
  pty_wild_ttt: { objective: 'Be the player who completes any three in a row.', controls: 'Pick X or O, then tap an empty square. Any line of three matching symbols wins for whoever placed the last one.', clock: DC },
  pty_pick15: { objective: 'Own three numbers that add up to exactly 15.', controls: 'Take turns tapping a number from 1 to 9. It becomes yours. Watch the bot: block any pair it could finish.', clock: DC },
  pty_last_coin: { objective: 'Take the very last coin.', controls: 'Tap a button to take 1 to 3 coins (1 to 4 on harder levels). Leave the bot a pile it cannot win from.', clock: DC },
  pty_square_coins: { objective: 'Take the very last coin.', controls: 'Take a square number of coins each turn: 1, 4, 9, 16 and so on.', clock: DC },
  pty_half_one: { objective: 'Be the one who brings the number to 0.', controls: 'On your turn either subtract 1 or halve the number (rounding down).', clock: DC },
  pty_corner_queen: { objective: 'Be the one who moves the queen into the gold corner.', controls: 'Tap a glowing square to slide the queen any distance left, down or diagonally down-left.', clock: DC },
  pty_grundy: { objective: 'Make the last split.', controls: 'Tap a block to split its stack at that point into two stacks. The two parts must be different sizes. Stacks of 1 or 2 cannot be split.', clock: DC },
  pty_northcott: { objective: 'Make the last move.', controls: 'Tap a square in a row to slide your blue slider toward the red one. You cannot jump over it.', clock: DC },
  pty_cram: { objective: 'Place the last domino.', controls: 'Tap two side-by-side empty squares (across or down) to place a domino there. Both players can use either direction.', clock: DC },
  pty_snort: { objective: 'Make the last move.', controls: 'Tap a glowing grass square to place a cow. You cannot place next to (above, below, left or right of) a rival bull.', clock: DC },
  pty_col: { objective: 'Make the last move.', controls: 'Tap a light region to paint it blue. You may never paint next to your own blue region.', clock: DC },
  pty_konane: { objective: 'Make the last jump.', controls: 'Tap a black stone, then a glowing gap. Jump straight over a white stone into an empty square; multiple jumps in a straight line are allowed.', clock: DC },
  pty_hexapawn: { objective: 'Get a pawn to the far row, take every rival pawn, or leave the bot with no move.', controls: 'Tap a pawn, then a glowing square. Pawns move one step forward, and capture one step diagonally forward.', clock: DC },
  pty_pong_hau: { objective: 'Leave the rival with no move.', controls: 'Tap one of your pieces, then the glowing empty point joined to it by a line.', clock: DC },
  pty_mu_torere: { objective: 'Leave the rival with no move.', controls: 'Tap a piece, then the empty point. Pieces move round the star to a neighbour, or into the centre only when next to a rival piece.', clock: DC },
  pty_dodgem: { objective: 'Be first to drive all your cars off the top edge.', controls: 'Tap a blue car, then a glowing square: up, left or right. At the top edge tap Drive off the board. Blocking the rival completely makes them win, so be careful.', clock: DC },
  pty_ataxx: { objective: 'Own more blobs than the rival when the board fills.', controls: 'Tap your blob, then a glowing square: 1 step clones it, 2 steps jumps it. Every rival blob touching the landing square turns yours.', clock: DC },
  pty_atari_go: { objective: 'Be the first to capture any rival stones.', controls: 'Tap a point to place a stone. A group is captured when it has no empty points touching it. Watch your own groups that have only one gap left.', clock: DC },
  pty_stalks: { objective: 'Make the last chop.', controls: 'Tap a blue segment of any stalk. It and everything above it falls off. The bot can only chop red segments.', clock: DC },
  pty_toads_frogs: { objective: 'Make the last move.', controls: 'Tap a toad to hop one pad right, or jump over a single crocodile into an empty pad. Crocodiles move left the same way.', clock: DC },
  pty_ultimate_ttt: { objective: 'Win three small boards in a row on the big board.', controls: 'Play in a glowing small board. The square you pick decides which small board the rival must play in next.', clock: DC },
  pty_turtles: { objective: 'Make the last flip.', controls: 'Tap a standing turtle to flip it over. You may also tap one turtle to its left to flip that one too (either way up), or tap Flip just this turtle.', clock: DC },
  pty_teeko: { objective: 'Make four in a row or a 2×2 square of your pieces.', controls: 'First place 4 pieces each. Then tap a piece and a glowing neighbouring square to slide it one step (any direction).', clock: DC },
  pty_achi: { objective: 'Get three of your pieces in a row.', controls: 'First place 4 pieces each. Then slide a piece along a line into the one empty point. If you cannot move, you lose.', clock: DC },
  pty_corner_race: { objective: 'Move all 6 of your pieces into the far corner first.', controls: 'Tap a piece, then a glowing square: step one square, or hop over any piece, chaining hops in one move.', clock: DC },
  pty_euclid: { objective: 'Be the one who makes a 0.', controls: 'Take any multiple of the smaller number away from the bigger one. Tap the button for how much to take.', clock: DC },
  pty_staircase: { objective: 'Make the last move.', controls: 'Tap a coin on a stair: that coin and every coin to its right drop down one stair. Coins on the ground are out of play.', clock: DC },
  pty_dominoes: { objective: 'Play all your dominoes first.', controls: 'Tap a glowing domino to add it to the chain where its number matches an end. If it fits both ends, choose left or right. No move means you pass. If nobody can move, fewest pips wins.', clock: DC },
  pty_square_hunt: { objective: 'Own the four corners of any square.', controls: 'Tap a dot to claim it. Squares of any size count, as long as they line up straight with the grid.', clock: DC },
  pty_knight_trap: { objective: 'Leave the rival knight with no move.', controls: 'Tap a glowing square to jump your knight in an L shape. The square you leave crumbles and nobody can land there again.', clock: DC },
  pty_oware: { objective: 'Capture more than 24 seeds.', controls: 'Tap one of your bottom pits to sow its seeds one by one anticlockwise. If the last seed makes a rival pit 2 or 3, you capture it (and any 2s and 3s before it). You must give the rival seeds if they have none.', clock: DC },
  pty_coin_line: { objective: 'Collect more coin value than the rival.', controls: 'Tap the coin at either end of the line to take it. Think ahead: what does each choice open up?', clock: DC },
  pty_slide15: { solo: true, objective: 'Put the tiles in order from 1, with the gap at the end.', controls: 'Tap a tile next to the gap to slide it in.', clock: SC },
  pty_merge2048: { solo: true, objective: 'Make the target tile shown at the bottom.', controls: 'Swipe, use arrow keys or tap the arrows. Matching tiles that touch merge into one.', clock: SC },
  pty_mine_sweep: { solo: true, objective: 'Uncover every safe square without hitting a mine.', controls: 'Tap to dig. Numbers show how many mines touch that square. Switch to flag mode (or long-press) to mark mines.', clock: SC },
  pty_sudoku6: { solo: true, objective: 'Fill the grid so every row, column and 2×3 box has 1 to 6 once.', controls: 'Tap an empty square, then a number. Clashes turn red.', clock: SC },
  pty_picross: { solo: true, objective: 'Reveal the hidden picture.', controls: 'Numbers show the runs of filled squares in each row and column, in order. Tap to fill; switch mode to mark squares that must stay empty.', clock: SC },
  pty_word_hunt: { solo: true, objective: 'Find every word in the list.', controls: 'Tap the first letter of a word, then its last letter. Words go across, down and, on harder levels, diagonally and backwards.', clock: SC },
  pty_hanoi: { solo: true, objective: 'Move the whole tower to the right peg.', controls: 'Tap a peg to lift its top disc, then tap another peg to drop it. A disc can never sit on a smaller one.', clock: SC },
  pty_pipe_flow: { solo: true, objective: 'Connect every pipe so water flows to every tile.', controls: 'Tap a tile to rotate it. Water flows from the centre tile; lit pipes are connected.', clock: SC },
  pty_echo_pads: { solo: true, objective: 'Repeat longer and longer light patterns.', controls: 'Watch and listen, then tap the pads in the same order. Each round adds one more step.', clock: SC },
  pty_pair_flip: { solo: true, objective: 'Find every matching pair.', controls: 'Tap two cards to flip them. A match stays open; a miss flips back and costs a miss.', clock: SC },
  pty_pyramid: { solo: true, objective: 'Clear the target number of pyramid cards.', controls: 'Tap two uncovered cards that add up to 13 (J=11, Q=12, K=13 alone). Tap the deck to draw a new card.', clock: SC },
  pty_golf: { solo: true, objective: 'Clear the target number of cards.', controls: 'Tap a column to move its bottom card to the pile if it is one higher or lower. Tap the deck when stuck.', clock: SC },
  pty_binary: { solo: true, objective: 'Fill the grid with suns and moons.', controls: 'Tap to cycle a square. Every row and column needs equal suns and moons, and never three the same in a row.', clock: SC },
  pty_line_five: { solo: true, objective: 'Reach the points target by lining up balls.', controls: 'Tap a ball, then an empty square it can travel to. Line up 4 or 5 of one colour to clear them. Every move without a line adds 3 new balls.', clock: SC },
  pty_word_five: { solo: true, objective: 'Guess the secret five-letter word.', controls: 'Type a guess and press Enter. Green = right letter, right spot; yellow = in the word, wrong spot.', clock: SC },
  pty_hangman: { solo: true, objective: 'Guess the word before the balloons run out.', controls: 'Tap letters. A wrong letter pops a balloon.', clock: SC },
  pty_make24: { solo: true, objective: 'Make 24 from four numbers, several times.', controls: 'Tap a number, an operation, then another number. Keep combining until one number is left: it must be 24.', clock: SC },
  pty_sum_ten: { solo: true, objective: 'Pick the target number of apples.', controls: 'Tap two corners of a box. If the numbers inside add to exactly 10, those apples are picked.', clock: SC },
  pty_knight_tour: { solo: true, objective: 'Visit as many squares as the goal with the knight.', controls: 'Tap any square to start, then keep jumping in L shapes to squares you have not visited. Tap the previous square to undo.', clock: SC },
  pty_queens: { solo: true, objective: 'Place one queen per row so none attack each other.', controls: 'Tap a square to add or remove a queen. Queens attack along rows, columns and diagonals; clashing queens turn red.', clock: SC },
  pty_magic_square: { solo: true, objective: 'Make every row, column and diagonal add to the magic total.', controls: 'Tap a square, then a number. Each number can be used once.', clock: SC },
  pty_jugs: { solo: true, objective: 'Measure the exact amount of water.', controls: 'Tap a jug, then another to pour until one is empty or full. Fill and Empty buttons work on easier levels.', clock: SC },
  pty_pancakes: { solo: true, objective: 'Sort the stack: smallest on top.', controls: 'Tap a pancake to flip it and every pancake above it.', clock: SC },
  pty_yacht: { solo: true, objective: 'Score the target points in 7 turns.', controls: 'Roll up to 3 times, tapping dice to hold them. Then tap a scorecard box to bank its points. Each box is used once.', clock: SC },
  pty_dot_link: { solo: true, objective: 'Reach the points target before links run out.', controls: 'Tap touching dots of the same colour one by one to build a chain, then tap the last dot again to pop them. Chains of 5+ score double.', clock: SC },
  pty_skyline: { solo: true, objective: 'Fill the city so the clues are right.', controls: 'Each row and column holds towers 1 to N once. A clue says how many towers you can see from that side. Tap a square to change its height.', clock: SC },
  pty_greater: { solo: true, objective: 'Fill the grid obeying every arrow.', controls: 'Each row and column holds 1 to N once. Arrows between squares show which is greater. Tap to change a number.', clock: SC },
  pty_zip_path: { solo: true, objective: 'Draw one path through every square, visiting the numbers in order.', controls: 'Start on 1 and tap neighbouring squares. Tap an earlier square to rewind.', clock: SC },
  pty_snakes_ladders: { objective: 'Reach square 100 first.', controls: 'Tap the dice to move. Ladders lift you up, snakes slide you down. A 6 rolls again. You must land exactly on 100.', clock: NO_CLOCK },
};
