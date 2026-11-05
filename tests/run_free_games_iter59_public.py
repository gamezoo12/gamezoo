# Standalone public-URL runner for backend/tests/test_free_games_leaderboard_ads.py (conftest only allows loopback)
import inspect, sys, traceback
sys.path.insert(0, '/app/backend/tests')
import test_free_games_leaderboard_ads as T
fx = {'admin': T._login("bachanta8@gmail.com", "Herts@910022"), 'player': T._login("player1@example.com", "Player@12345")}
fx['fresh'] = fx['player']
ok = fail = 0
for cname in ['TestUnlimited', 'TestLeaderboard', 'TestEventsStats', 'TestAds', 'TestCommentary']:
    cls = getattr(T, cname); inst = cls()
    for n, f in inspect.getmembers(cls, inspect.isfunction):
        if not n.startswith('test_'): continue
        args = [fx[a] for a in inspect.signature(f).parameters if a != 'self']
        try:
            f(inst, *args); ok += 1; print('PASS', cname, n)
        except Exception as e:
            fail += 1; print('FAIL', cname, n, repr(e)[:400])
print(f'{ok} passed, {fail} failed')
