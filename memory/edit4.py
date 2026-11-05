def rep(p, a, b):
    s = open(p).read(); assert a in s, (p, a[:60]); open(p, 'w').write(s.replace(a, b, 1))


p = '/app/frontend/src/components/games/party/index.jsx'
rep(p, "import { SeaBattle } from './SeaBattle';", "import { SeaBattle } from './SeaBattle';\nimport { MemoryDuel, memoryInit } from './MemoryDuel';\nimport { DUELS, duelRender } from './duelGames';\nimport { duelInit } from './duel';")
rep(p, "  pty_sea_battle: (config, onComplete) => <SeaBattle config={config} onComplete={onComplete} />,\n};",
    "  pty_sea_battle: (config, onComplete) => <SeaBattle config={config} onComplete={onComplete} />,\n  pty_memory_duel: (config, onComplete) => <MemoryDuel config={config} onComplete={onComplete} />,\n  ...Object.fromEntries(Object.entries(DUELS).map(([id, def]) => [id, duelRender(def)])),\n};")
rep(p, "  pty_snakes_ladders: { label: 'Snakes & Ladders', init: snakesInit,", "  pty_memory_duel: { label: 'Memory Duel', init: (n) => memoryInit(n, 10), render: (c, done, online) => <MemoryDuel config={c} onComplete={done} online={online} /> },\n  ...Object.fromEntries(Object.entries(DUELS).map(([id, def]) => [id, { label: def.title, init: () => duelInit(def), render: duelRender(def) }])),\n  pty_snakes_ladders: { label: 'Snakes & Ladders', init: snakesInit,")
rep(p, "  pty_snakes_ladders: { objective: 'Reach square 100 first.',", """  pty_memory_duel: { objective: 'Find more matching pairs than your rivals.', controls: 'On your turn flip two cards. A pair is yours and you go again; no match and the turn passes. Watch every flip: the bots remember more on harder levels.', clock: 'Turn clock: run out and a random card is flipped for you.' },
  pty_reversi: { objective: 'Finish with more white discs than black.', controls: 'Tap a glowing dot to place a disc. Every black line you trap between two whites flips to white. Corners can never flip, so grab them!', clock: 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.' },
  pty_gomoku: { objective: 'Be first to line up five stones in a row.', controls: 'Tap any empty point to place a jade stone. Five in a row across, down or diagonally wins. Block the bot when it has four.', clock: 'Turn clock: run out and a random stone is placed. Match clock: when it ends, the better position wins.' },
  pty_tictactoe: { objective: 'Line up your X before the bot lines up its O.', controls: 'Tap an empty square. 3x3 needs three in a row; on bigger boards in later levels you need four. A draw does not clear the level.', clock: 'Turn clock: run out and a random square is taken. Match clock: when it ends, the better position wins.' },
  pty_mancala: { objective: 'Collect more gems in your store (right) than the rival.', controls: 'Tap one of your bottom pits to sow its gems one by one anticlockwise. Land in your store for an extra turn. Land in an empty pit on your side to capture the gems opposite.', clock: 'Turn clock: run out and a random pit is played. Match clock: when it ends, the better position wins.' },
  pty_snakes_ladders: { objective: 'Reach square 100 first.',""")
p = '/app/backend/routers/game_routes.py'
rep(p, "    {'id': 'pty_snake_arena',", """    {'id': 'pty_memory_duel', 'label': 'Memory Duel', 'category': 'memory', 'target_time_s': 150, 'max_attempts': 3, 'family': 'party'},
    {'id': 'pty_reversi', 'label': 'Reversi', 'category': 'strategy', 'target_time_s': 300, 'max_attempts': 3, 'family': 'party'},
    {'id': 'pty_gomoku', 'label': 'Five in a Row', 'category': 'strategy', 'target_time_s': 240, 'max_attempts': 3, 'family': 'party'},
    {'id': 'pty_tictactoe', 'label': 'Tic Tac Toe Showdown', 'category': 'strategy', 'target_time_s': 90, 'max_attempts': 3, 'family': 'party'},
    {'id': 'pty_mancala', 'label': 'Mancala', 'category': 'strategy', 'target_time_s': 240, 'max_attempts': 3, 'family': 'party'},
    {'id': 'pty_snake_arena',""")
p = '/app/backend/routers/party_rooms_routes.py'
rep(p, "'pty_dots_boxes': 4, 'pty_checkers': 2}", "'pty_dots_boxes': 4, 'pty_checkers': 2, 'pty_memory_duel': 4, 'pty_reversi': 2, 'pty_gomoku': 2, 'pty_tictactoe': 2, 'pty_mancala': 2}")
p = '/app/frontend/src/lib/partyRoom.js'
rep(p, "'pty_dots_boxes', 'pty_checkers'];", "'pty_dots_boxes', 'pty_checkers', 'pty_memory_duel', 'pty_reversi', 'pty_gomoku', 'pty_tictactoe', 'pty_mancala'];")
p = '/app/frontend/src/lib/gameCovers.js'
rep(p, "  pty_snake_arena:", "  pty_memory_duel: '07de3aacb695f48f6842269d633a128dff707905d944f1b61f57fe5e5d3f59ea',\n  pty_reversi: '1100a4258ead506cadb76cd8afd17f1d914ad21e51322d37b3590063a8df2457',\n  pty_gomoku: '7cb589b768f9d5e6aef3b8ef21f30d8202a53b4a0571bf4f23b5d90fcf34f543',\n  pty_tictactoe: 'd2b6b6b02764178f8f1c733289f1e50f5fc691f8f79174bd9392c8dfbefa1646',\n  pty_mancala: '090190f5b168d2cd113c85659f9c089773512b98feedc6656e013cdd6807036b',\n  pty_snake_arena:")
