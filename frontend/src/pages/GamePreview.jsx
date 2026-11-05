import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Star } from 'lucide-react';

import { api, gamesAPI } from '../lib/api';
import { resolveMediaUrl } from '../lib/media';
import { useAuth } from '../context/AuthContext';
import { LEVELS, starsFor, timeLimit, uniqueGames, uniqueIdFor } from '../lib/practiceGames';
import { levelState, loadProgress, saveLevel, totalStars } from '../lib/practiceProgress';
import { LevelPath } from '../components/games/practice/LevelPath';
import { PracticeIntro } from '../components/games/practice/PracticeIntro';
import { PracticeRun } from '../components/games/practice/PracticeRun';
import { PracticeResult } from '../components/games/practice/PracticeResult';

export default function GamePreview() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth() || {};
  const [settings, setSettings] = useState(null);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({});
  const [stage, setStage] = useState('levels');
  const [level, setLevel] = useState(1);
  const [result, setResult] = useState(null);
  const [runKey, setRunKey] = useState(0);

  useEffect(() => {
    Promise.all([api.get('/settings').then((r) => r.data), gamesAPI.types()])
      .then(([s, g]) => { setSettings(s || {}); setTypes(g?.games || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (!authLoading) loadProgress(user).then(setProgress); }, [user, authLoading]);

  const game = useMemo(() => uniqueGames(types).find((g) => g.id === gameId), [types, gameId]);
  const state = levelState(progress, gameId);

  if (uniqueIdFor(gameId) !== gameId) return <Navigate to={`/games/${uniqueIdFor(gameId)}`} replace />;
  if (loading) return <div className="mx-auto max-w-5xl px-4 py-16 text-center text-slate-500">Loading game…</div>;
  if (!settings?.game_preview_enabled) return <Navigate to="/" replace />;
  const allowed = gameId.startsWith('arc_') || (settings.game_preview_games || []).includes(gameId);
  if (!allowed || !game) return <Navigate to="/games" replace />;

  const cover = settings?.game_preview_images?.[gameId] ? resolveMediaUrl(settings.game_preview_images[gameId]) : game.cover;
  const go = (lv, s = 'intro') => { setLevel(lv); setResult(null); setRunKey((k) => k + 1); setStage(s); window.scrollTo({ top: 0, behavior: 'auto' }); };
  const finish = async (r) => {
    setResult(r);
    setStage('result');
    if (r.solved && !r.timeout) setProgress(await saveLevel(user, progress, gameId, level, starsFor(timeLimit(game, level), r)));
  };
  const earned = result && result.solved && !result.timeout ? starsFor(timeLimit(game, level), result) : 0;

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-4xl px-3 py-5 sm:px-6 md:py-10">
        <button type="button" onClick={() => (stage !== 'levels' ? setStage('levels') : location.key !== 'default' ? navigate(-1) : navigate('/games'))} aria-label="Back" data-page-back-control="true" className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white" data-testid="practice-page-back">
          <ArrowLeft className="h-4 w-4" />Back
        </button>

        {stage === 'levels' && (
          <div className="pl-practice-pop mt-4 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]" data-testid="practice-game-hub">
            <div className="relative aspect-[16/8] sm:aspect-[16/6]">
              {cover && <img src={cover} alt={game.label} className="h-full w-full object-cover" data-testid="practice-cover" />}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">{game.category} · {LEVELS} levels</div>
                <h1 className="mt-1 font-display text-3xl font-black text-white sm:text-5xl" data-testid="practice-game-title">{game.label}</h1>
              </div>
            </div>
            <div className="p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-white/70">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />Free play · no ticket · no official score</span>
                <span className="inline-flex items-center gap-1 font-bold text-amber-300" data-testid="practice-total-stars"><Star className="h-3.5 w-3.5 fill-amber-400" />{totalStars(state)}/{LEVELS * 3}</span>
              </div>
              <p className="mb-3 text-sm text-white/70">Beat each level to unlock the next. It starts easy and gets brutal by level 100.</p>
              <LevelPath state={state} onPick={(lv) => go(lv)} />
            </div>
          </div>
        )}

        {stage !== 'levels' && (
          <div className="mt-4 rounded-3xl border border-white/10 bg-gradient-to-b from-[#17104a] to-[#07041a] p-3 sm:p-6" data-testid="practice-stage">
            <div className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-white/50">{game.label}</div>
            {stage === 'intro' && <PracticeIntro game={game} level={level} onStart={() => go(level, 'play')} onBack={() => setStage('levels')} />}
            {stage === 'play' && <PracticeRun key={runKey} game={game} level={level} onFinish={finish} onQuit={() => setStage('intro')} />}
            {stage === 'result' && result && <PracticeResult result={result} level={level} stars={earned} guest={!user} onNext={() => go(level + 1)} onRetry={() => go(level, 'play')} onLevels={() => setStage('levels')} />}
          </div>
        )}
      </div>
    </div>
  );
}
