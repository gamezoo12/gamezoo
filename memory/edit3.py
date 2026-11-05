def rep(p, a, b):
    s = open(p).read(); assert a in s, (p, a[:60]); open(p, 'w').write(s.replace(a, b, 1))


p = '/app/frontend/src/components/games/party/index.jsx'
rep(p, "import { SnakeArena } from './SnakeArena';", "import { SnakeArena } from './SnakeArena';\nimport { DotsBoxes, dotsInit } from './DotsBoxes';\nimport { Checkers, checkersInit } from './Checkers';\nimport { BlockBlast } from './BlockBlast';\nimport { SeaBattle } from './SeaBattle';")
rep(p, "  pty_snake_arena: (config, onComplete) => <SnakeArena config={config} onComplete={onComplete} />,\n};",
    "  pty_snake_arena: (config, onComplete) => <SnakeArena config={config} onComplete={onComplete} />,\n  pty_dots_boxes: (config, onComplete) => <DotsBoxes config={config} onComplete={onComplete} />,\n  pty_checkers: (config, onComplete) => <Checkers config={config} onComplete={onComplete} />,\n  pty_block_blast: (config, onComplete) => <BlockBlast config={config} onComplete={onComplete} />,\n  pty_sea_battle: (config, onComplete) => <SeaBattle config={config} onComplete={onComplete} />,\n};")
rep(p, "  pty_snakes_ladders: { label: 'Snakes & Ladders', init: snakesInit,", "  pty_dots_boxes: { label: 'Dots & Boxes', init: (n) => dotsInit(n, 4), render: (c, done, online) => <DotsBoxes config={c} onComplete={done} online={online} /> },\n  pty_checkers: { label: 'Checkers', init: checkersInit, render: (c, done, online) => <Checkers config={c} onComplete={done} online={online} /> },\n  pty_snakes_ladders: { label: 'Snakes & Ladders', init: snakesInit,")
rep(p, "  pty_snakes_ladders: { objective: 'Reach square 100 first.',", """  pty_dots_boxes: { objective: 'Claim more boxes than your rivals.', controls: 'Tap a dotted line between two dots to draw it. Close the fourth side of a box to claim it and draw again. Avoid drawing the third side of a box.', clock: 'Turn clock: run out and a random line is drawn for you.' },
  pty_checkers: { objective: 'Capture or block every piece of your rival.', controls: 'Tap one of your red pieces, then a green spot. Pieces move diagonally forward. Captures are compulsory and chain jumps continue. Reach the far row to crown a king that moves both ways.', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, more pieces wins.' },
  pty_block_blast: { solo: true, objective: 'Score the level target by blasting full rows and columns.', controls: 'Tap one of the 3 blocks, then tap the board where its top-left square should go. Fill a row or column to blast it; several at once score big combos. You lose if no block fits.', clock: 'Level clock: reach the target before it ends.' },
  pty_sea_battle: { objective: 'Sink the whole enemy fleet before they sink yours.', controls: 'Tap a square in enemy waters to fire. Fire = hit, ring = miss. A hit lets you fire again. Before your first shot you can tap Move my ships to reshuffle your fleet.', clock: 'Turn clock: run out and a random shot is fired. Match clock: when it ends, most hits wins.' },
  pty_snakes_ladders: { objective: 'Reach square 100 first.',""")
p = '/app/backend/routers/game_routes.py'
rep(p, "    {'id': 'pty_snake_arena',", """    {'id': 'pty_dots_boxes', 'label': 'Dots & Boxes', 'category': 'strategy', 'target_time_s': 150, 'max_attempts': 3, 'family': 'party'},
    {'id': 'pty_checkers', 'label': 'Checkers', 'category': 'strategy', 'target_time_s': 300, 'max_attempts': 3, 'family': 'party'},
    {'id': 'pty_block_blast', 'label': 'Block Blast', 'category': 'puzzle', 'target_time_s': 150, 'max_attempts': 3, 'family': 'party'},
    {'id': 'pty_sea_battle', 'label': 'Sea Battle', 'category': 'strategy', 'target_time_s': 200, 'max_attempts': 3, 'family': 'party'},
    {'id': 'pty_snake_arena',""")
p = '/app/frontend/src/lib/gameCovers.js'
rep(p, "  pty_snake_arena:", "  pty_dots_boxes: 'b37df4fb595b7d9a9fb45d8c25aa9368a35959afffe1b5e4fee48c7e828d93f4',\n  pty_checkers: 'ec1ea5bd59ecd2cdf2c0db7a5ac33cd5ff6b21c8add9df2c3da7f3a550f11982',\n  pty_block_blast: 'f85ee4df0197777c25f1b716812de22e22bf6f810cceab542ec95ba44f8ee0b5',\n  pty_sea_battle: '538b053a81abba7e633a9e2ac588d46aec2adb2932a2d848276cb183722d1825',\n  pty_snake_arena:")
