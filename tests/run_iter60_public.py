# Standalone public-URL runner for iter59 + iter60 backend tests (conftest only allows loopback)
import inspect, sys
sys.path.insert(0, '/app/backend/tests')
import test_free_games_leaderboard_ads as T59
import test_draw_hosts_leaderboard_iter60 as T60
fx = {'admin': T60._login("bachanta8@gmail.com", "Herts@910022"), 'player': T60._login("player1@example.com", "Player@12345")}
fx['fresh'] = fx['player']
ok = fail = 0
for mod, names in [(T60, ['TestHosts', 'TestSegments', 'TestGlobalBoard', 'TestAdFixes']),
                   (T59, ['TestUnlimited', 'TestLeaderboard', 'TestEventsStats', 'TestAds', 'TestCommentary'])]:
    for cname in names:
        cls = getattr(mod, cname); inst = cls()
        for n, f in inspect.getmembers(cls, inspect.isfunction):
            if not n.startswith('test_'): continue
            args = [fx[a] for a in inspect.signature(f).parameters if a != 'self']
            try:
                f(inst, *args); ok += 1; print('PASS', mod.__name__, cname, n)
            except Exception as e:
                fail += 1; print('FAIL', mod.__name__, cname, n, repr(e)[:400])
print(f'{ok} passed, {fail} failed')
