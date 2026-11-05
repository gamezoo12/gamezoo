def rep(p, a, b):
    s = open(p).read(); assert a in s, (p, a[:60]); open(p, 'w').write(s.replace(a, b, 1))


DUEL = {
    'pty_morris': ("Three Men's Morris", 'Get three of your pieces in a row.', 'First each player places 3 pieces. After that, tap one of your pieces and slide it to a free neighbouring point (lines through the centre count). Three in a row wins.'),
    'pty_fox_hounds': ('Fox & Hounds', 'Trap the fox with your 4 hounds.', 'Hounds move one square diagonally up; the fox moves diagonally in any direction. Box the fox in so it cannot move. If it slips past all your hounds, the fox wins.'),
}
SOLO = {
    'pty_lights_out': ('Lights Out', 'Switch every light off.', 'Tapping a light flips it and its four neighbours. Plan your taps: you only have a limited number.'),
    'pty_flood_fill': ('Flood Fill', 'Turn the whole board one colour.', 'Tap a colour button: the area from the top-left corner floods into that colour and grows. Finish within the move limit.'),
    'pty_peg_solitaire': ('Peg Solitaire', 'Leave as few pegs as the level goal.', 'Tap a peg, then a green hole two squares away to jump over a neighbouring peg and remove it. Jumps are straight only.'),
    'pty_code_breaker': ('Code Breaker', 'Crack the secret colour code.', 'Tap colours to fill a guess, then Check. Green pin = right colour in the right spot, yellow = right colour, wrong spot. Use the clues before guesses run out.'),
}
COVERS = {'pty_morris': '72524695419024710515ae497036b57733142ac6acba945eff0f4b3226493507', 'pty_fox_hounds': 'ee4378e89db480276320fbe5cb43450c01c5eb60dc4febfddadf448cc0e02218',
          'pty_lights_out': '421c1a9dabccd7f610adc06adc0fc79e893864113698df91c2aaefdbd1aa9cde', 'pty_flood_fill': '0962c6be39c74cdfd24e6693e0fff9bcac52c10f97c459afda00433f895e960e',
          'pty_peg_solitaire': '3cd70680866d5a8350a167997f618eb5af0ffe9132d3a8670e6c05576628cff4', 'pty_code_breaker': 'add489e26fcce5f49700cf4097ed6419746b8493a49b6264876eab6ae55ef1d8'}
CLOCK = 'Turn clock: run out and a random move is made. Match clock: when it ends, the better position wins.'
p = '/app/frontend/src/components/games/party/index.jsx'
rep(p, "import { DUELS2 } from './duelGames2';", "import { DUELS2 } from './duelGames2';\nimport { SOLOS, soloRender } from './solo';")
rep(p, "  ...Object.fromEntries(Object.entries(DUELS).map(([id, def]) => [id, duelRender(def)])),\n};", "  ...Object.fromEntries(Object.entries(DUELS).map(([id, def]) => [id, duelRender(def)])),\n  ...Object.fromEntries(Object.entries(SOLOS).map(([id, def]) => [id, soloRender(def)])),\n};")
how = ''.join(f"  {k}: {{ objective: {v[1]!r}, controls: {v[2]!r}, clock: {CLOCK!r} }},\n" for k, v in DUEL.items())
how += ''.join(f"  {k}: {{ solo: true, objective: {v[1]!r}, controls: {v[2]!r}, clock: 'Level clock: solve it before it ends.' }},\n" for k, v in SOLO.items())
rep(p, "  pty_snakes_ladders: { objective: 'Reach square 100 first.',", how + "  pty_snakes_ladders: { objective: 'Reach square 100 first.',")
p = '/app/backend/routers/game_routes.py'
rows = ''.join(f"    {{'id': '{k}', 'label': \"{v[0]}\", 'category': 'strategy', 'target_time_s': 200, 'max_attempts': 3, 'family': 'party'}},\n" for k, v in DUEL.items())
rows += ''.join(f"    {{'id': '{k}', 'label': '{v[0]}', 'category': 'puzzle', 'target_time_s': 200, 'max_attempts': 3, 'family': 'party'}},\n" for k, v in SOLO.items())
rep(p, "    {'id': 'pty_snake_arena',", rows + "    {'id': 'pty_snake_arena',")
p = '/app/backend/routers/party_rooms_routes.py'
rep(p, "'pty_treblecross': 2}", "'pty_treblecross': 2, 'pty_morris': 2, 'pty_fox_hounds': 2}")
p = '/app/frontend/src/lib/partyRoom.js'
rep(p, "'pty_treblecross'];", "'pty_treblecross', 'pty_morris', 'pty_fox_hounds'];")
p = '/app/frontend/src/lib/gameCovers.js'
rep(p, "  pty_snake_arena:", ''.join(f"  {k}: '{h}',\n" for k, h in COVERS.items()) + "  pty_snake_arena:")
