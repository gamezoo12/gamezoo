import { Clock, Gamepad2, Play, Target } from 'lucide-react';
import { difficultyName } from '../../../lib/difficulty';
import { howToPlay, levelGoal, timeLimit } from '../../../lib/practiceGames';

export function PracticeIntro({ game, level, onStart, onBack }) {
  const guide = howToPlay(game);
  const goal = levelGoal(game, level);
  return (
    <div className="pl-practice-pop mx-auto max-w-lg" data-testid="practice-instructions">
      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">Level {level} · {difficultyName(level)}</div>
      <h2 className="mt-1 font-display text-2xl font-black text-white sm:text-3xl">How to play</h2>
      <ul className="mt-4 space-y-3 text-sm text-white/80">
        {guide.objective && <li className="flex gap-3"><Target className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><span data-testid="practice-objective">{guide.objective}</span></li>}
        {guide.controls && <li className="flex gap-3"><Gamepad2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" /><span>{guide.controls}</span></li>}
        <li className="flex gap-3"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" /><span>Finish before the clock hits zero: <b className="text-white" data-testid="practice-time-limit">{timeLimit(game, level)}s</b>. Faster and cleaner runs earn more stars.</span></li>
      </ul>
      {goal && <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm font-bold text-amber-200" data-testid="practice-level-goal">{goal}</div>}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={onStart} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 font-black text-slate-900 shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0" data-testid="practice-start">
          <Play className="h-4 w-4" />Start Level {level}
        </button>
        <button type="button" onClick={onBack} className="h-12 rounded-xl bg-white/10 px-5 font-bold text-white transition-colors hover:bg-white/15" data-testid="practice-back-levels">All levels</button>
      </div>
    </div>
  );
}
