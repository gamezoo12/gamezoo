def rep(p, a, b):
    s = open(p).read(); assert a in s, (p, a[:60]); open(p, 'w').write(s.replace(a, b, 1))


NEW = {
    'pty_isolation': ('Isolation', 'Leave the rival with no square to move to.', 'Tap your king, then a green square next to it (any direction). The square you leave crumbles forever. If you cannot move on your turn, you lose.'),
    'pty_breakthrough': ('Breakthrough', 'Get one pawn to the far row, or capture every rival pawn.', 'Tap a blue pawn, then a green square. Pawns move one step forward or diagonally forward, and capture only diagonally.'),
    'pty_domineering': ('Domino Duel', 'Make the last domino move.', 'You place vertical dominoes, the bot places horizontal ones. Tap the top square of a free vertical pair. Whoever cannot place a domino loses.'),
    'pty_clobber': ('Clobber', 'Make the last capture.', 'Tap one of your blue stones, then an enemy stone directly next to it (not diagonal) to clobber it. If you have no capture on your turn, you lose.'),
    'pty_nim': ('Matchstick Nim', 'Take the very last matchstick.', 'On your turn tap a stick: you take it and every stick to its right in that row. Take as many as you like, but only from one row.'),
    'pty_hex': ('Hex Link', 'Build a chain of blue cells from the top edge to the bottom edge.', 'Tap any empty hexagon. The bot is trying to link left to right. Hex can never end in a draw: block and build at the same time.'),
    'pty_treblecross': ('Treblecross', 'Be the one who completes three Xs in a row.', 'Both players place the same X on one strip. Whoever makes three in a row wins, so never leave two Xs with a gap the rival can finish.'),
}
CLOCK = 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.'
COVERS = {'pty_isolation': 'bde063e9ee7ecaafce7a9ca84b39e4d06a8987c4046aadc323249a8666b2b0d4', 'pty_breakthrough': '139604a5257a23dcc47a72e7d999961d54158b75575241350361e467e3e0ead7',
          'pty_domineering': '8571556ca0539a5da08b035abdd5d6fa7a987781760f348be977e4e39cec06d5', 'pty_clobber': 'c3aa96136850ca1c1c6e8a58a8599e6f30e1be322e40429ed57fc900873027b7',
          'pty_nim': '400b9fa2d5685d4f8a28f4fed6deae4ef1fc25eea37054b76ca6824155e72a24', 'pty_hex': '9e5c46c1cb743b17abab18b7109873709d2131500bfce1014342e81d961dd72a',
          'pty_treblecross': '2ff3fd8d358222ad954c6029008b5e8d36e707e24bb7ea93480c16f537c06d1d'}
p = '/app/frontend/src/components/games/party/index.jsx'
rep(p, "import { DUELS, duelRender } from './duelGames';", "import { DUELS as DUELS1, duelRender } from './duelGames';\nimport { DUELS2 } from './duelGames2';")
rep(p, "import { duelInit } from './duel';", "import { duelInit } from './duel';\n\nconst DUELS = { ...DUELS1, ...DUELS2 };")
how = ''.join(f"  {k}: {{ objective: {v[1]!r}, controls: {v[2]!r}, clock: {CLOCK!r} }},\n" for k, v in NEW.items())
rep(p, "  pty_snakes_ladders: { objective: 'Reach square 100 first.',", how + "  pty_snakes_ladders: { objective: 'Reach square 100 first.',")
p = '/app/backend/routers/game_routes.py'
rows = ''.join(f"    {{'id': '{k}', 'label': '{v[0]}', 'category': 'strategy', 'target_time_s': 200, 'max_attempts': 3, 'family': 'party'}},\n" for k, v in NEW.items())
rep(p, "    {'id': 'pty_snake_arena',", rows + "    {'id': 'pty_snake_arena',")
p = '/app/backend/routers/party_rooms_routes.py'
rep(p, "'pty_mancala': 2}", "'pty_mancala': 2, " + ', '.join(f"'{k}': 2" for k in NEW) + '}')
p = '/app/frontend/src/lib/partyRoom.js'
rep(p, "'pty_mancala'];", "'pty_mancala', " + ', '.join(f"'{k}'" for k in NEW) + '];')
p = '/app/frontend/src/lib/gameCovers.js'
rep(p, "  pty_snake_arena:", ''.join(f"  {k}: '{h}',\n" for k, h in COVERS.items()) + "  pty_snake_arena:")
