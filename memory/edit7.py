def rep(p, a, b):
    s = open(p).read(); assert a in s, (p, a[:60]); open(p, 'w').write(s.replace(a, b, 1))


DUEL = {
    'pty_sim': ('Triangle Trap', 'Make the rival close a triangle in their own colour.', 'Take turns tapping a dashed line between two of the 6 dots. If three of your blue lines form a triangle, you lose.'),
    'pty_chomp': ('Chomp', 'Make the rival eat the poisoned square.', 'Tap any square to bite it plus every square below and to its right. Whoever has to eat the green poisoned square (top-left) loses.'),
    'pty_kayles': ('Bowling Kayles', 'Knock down the very last pin.', 'Tap a pin to knock it down, or tap the glowing gap between two standing neighbours to knock both. Whoever knocks the last pin wins.'),
    'pty_notakto': ('Notakto', 'Never be the one who completes three in a row.', 'Both players place the same X. A board with a full line is dead. Whoever kills the last board loses.'),
}
SOLO = {
    'pty_same_game': ('Same Game', 'Reach the points target by popping groups.', 'Tap a group of 2 or more touching bubbles of the same colour to pop them. Bigger groups score much more. Bubbles fall down and columns slide left.'),
    'pty_ball_sort': ('Ball Sort', 'Sort every colour into its own tube.', 'Tap a tube to pick up its top ball, then tap another tube to drop it. You can only drop onto the same colour or into an empty tube. Each tube holds 4.'),
    'pty_tile_triple': ('Tile Triple', 'Clear every tile from the board.', 'Tap tiles to move them into the 7-slot tray. Three matching tiles in the tray vanish. If the tray fills up, you lose.'),
    'pty_star_lights': ('Star Lights', 'Switch every star light off.', 'Tapping a light flips it and its four diagonal neighbours. Plan ahead: you only have a limited number of taps.'),
}
COVERS = {'pty_sim': '7835e9cf1d8002ef9dc0b30ba5f357077e39770047c1776beaa6e6b4260ef1b0', 'pty_chomp': 'f7575c9c2de8401ddb15ce79968aa6d110b4ac7978959370d1e2c42d7251db4f',
          'pty_kayles': '6bdccf2703dfbbf18a803eb2f1a094aea5578284c0e58c33f5954e4df272c746', 'pty_notakto': '0e321fbf2943e2069d350024ee510f5ddf127955999813002f6374da77ebed27',
          'pty_same_game': '793ac5f17c5f7a146d0839d6b048f28056f128454cef699df2f3b54483881b6b', 'pty_ball_sort': 'ab243d7b79067b550f6aa8a02d1a9f19d1e27257c0f32dd00adc05ee49bda989',
          'pty_tile_triple': '977fd2c9ba92a5174ad0df139f6f69125a2e6e2f815de533bc3feb3474df9035', 'pty_star_lights': 'fddfb2c91a70704abd4a6fdc5498be79fb80ed6518a520ee7becf3b2c3fb30f6'}
CLOCK = 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.'
p = '/app/frontend/src/components/games/party/index.jsx'
rep(p, "import { SOLOS, soloRender } from './solo';", "import { SOLOS as SOLOS1, soloRender } from './solo';\nimport { DUELS3, SOLOS2 } from './batch3';")
rep(p, "const DUELS = { ...DUELS1, ...DUELS2 };", "const DUELS = { ...DUELS1, ...DUELS2, ...DUELS3 };\nconst SOLOS = { ...SOLOS1, ...SOLOS2 };")
how = ''.join(f"  {k}: {{ objective: {v[1]!r}, controls: {v[2]!r}, clock: {CLOCK!r} }},\n" for k, v in DUEL.items())
how += ''.join(f"  {k}: {{ solo: true, objective: {v[1]!r}, controls: {v[2]!r}, clock: 'Level clock: solve it before it ends.' }},\n" for k, v in SOLO.items())
rep(p, "  pty_snakes_ladders: { objective: 'Reach square 100 first.',", how + "  pty_snakes_ladders: { objective: 'Reach square 100 first.',")
p = '/app/backend/routers/game_routes.py'
rows = ''.join(f"    {{'id': '{k}', 'label': '{v[0]}', 'category': 'strategy', 'target_time_s': 200, 'max_attempts': 3, 'family': 'party'}},\n" for k, v in DUEL.items())
rows += ''.join(f"    {{'id': '{k}', 'label': '{v[0]}', 'category': 'puzzle', 'target_time_s': 200, 'max_attempts': 3, 'family': 'party'}},\n" for k, v in SOLO.items())
rep(p, "    {'id': 'pty_snake_arena',", rows + "    {'id': 'pty_snake_arena',")
p = '/app/backend/routers/party_rooms_routes.py'
rep(p, "'pty_fox_hounds': 2}", "'pty_fox_hounds': 2, " + ', '.join(f"'{k}': 2" for k in DUEL) + '}')
p = '/app/frontend/src/lib/partyRoom.js'
rep(p, "'pty_fox_hounds'];", "'pty_fox_hounds', " + ', '.join(f"'{k}'" for k in DUEL) + '];')
p = '/app/frontend/src/lib/gameCovers.js'
rep(p, "  pty_snake_arena:", ''.join(f"  {k}: '{h}',\n" for k, h in COVERS.items()) + "  pty_snake_arena:")
