def rep(p, a, b):
    s = open(p).read(); assert a in s, (p, a[:60]); open(p, 'w').write(s.replace(a, b, 1))


p = 'pages/GamePreview.jsx'
rep(p, "import { ArrowLeft, ShieldCheck, Star } from 'lucide-react';", "import { ArrowLeft, ShieldCheck, Star, Users } from 'lucide-react';\nimport { ONLINE_GAMES, roomAPI } from '../lib/partyRoom';")
rep(p, """              <p className="mb-3 text-sm text-white/70">Beat each level""", """              {ONLINE_GAMES.includes(gameId) && (
                <button type="button" onClick={async () => { if (!user) { navigate(`/login?next=/games/${gameId}`); return; } try { const r = await roomAPI.create(gameId); navigate(`/play/${r.code}`); } catch { /* ignore */ } }}
                  className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 p-3 text-left shadow-lg transition-transform hover:-translate-y-0.5" data-testid="practice-play-friends">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20"><Users className="h-5 w-5 text-white" /></span>
                  <span className="min-w-0"><span className="block font-display text-base font-black text-white">Play with friends</span><span className="block text-xs text-white/80">{user ? 'Create a room and send the invite link' : 'Sign in to invite friends to a live game'}</span></span>
                </button>
              )}
              <p className="mb-3 text-sm text-white/70">Beat each level""")
rep(p, "<PracticeIntro game={game} level={level}", "<PracticeIntro game={game} cover={cover} level={level}")
