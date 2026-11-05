import { Clock, Gamepad2, Play, Target, Users } from 'lucide-react';
import { howToPlay, levelGoal, tierName, tierOf, timeLimit } from '../../../lib/practiceGames';

function Rule({ icon: Icon, color, title, children, testId }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-white/[0.06] p-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="h-4 w-4 text-white" /></span>
      <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-widest text-white/50">{title}</div><div className="text-[13px] leading-snug text-white/90" data-testid={testId}>{children}</div></div>
    </div>
  );
}

// Mobile-first "game card" briefing shown before every level.
export function PracticeIntro({ game, cover, level, onStart, onBack }) {
  const guide = howToPlay(game);
  const goal = levelGoal(game, level);
  const limit = timeLimit(game, level);
  return (
    <div className="pl-practice-pop mx-auto w-full max-w-sm overflow-hidden rounded-[28px] border border-white/15 bg-gradient-to-b from-[#211668] to-[#0b0726] shadow-[0_30px_80px_rgba(80,60,255,0.35)]" data-testid="practice-instructions">
      <div className="relative aspect-[16/10]">
        {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#211668] via-[#211668]/30 to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300 backdrop-blur">Level {level} · {tierName(tierOf(level))}</span>
        <h2 className="absolute bottom-2 left-4 right-4 font-display text-2xl font-black leading-tight text-white drop-shadow">{game.label}</h2>
      </div>
      <div className="space-y-2 p-4">
        {goal && <div className="rounded-2xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-center text-sm font-black text-amber-200" data-testid="practice-level-goal">{goal}</div>}
        {guide.objective && <Rule icon={Target} color="bg-amber-500" title="Goal" testId="practice-objective">{guide.objective}</Rule>}
        {guide.controls && <Rule icon={Gamepad2} color="bg-sky-500" title="How to play">{guide.controls}</Rule>}
        <Rule icon={Clock} color="bg-rose-500" title="Clock" testId="practice-time-limit">{limit ? `Finish within ${limit}s. Faster, cleaner runs earn more stars.` : guide.clock || 'No time limit: take your turns, outsmart the bots and win to clear the level.'}</Rule>
        {game.category === 'Party' && <Rule icon={Users} color="bg-emerald-500" title="Opponents">{guide.solo ? 'Solo game: just you against the level.' : 'Bots chat and react as you play. Send emoji reactions or type a message back!'}</Rule>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onBack} className="h-12 shrink-0 rounded-2xl bg-white/10 px-4 text-sm font-bold text-white" data-testid="practice-back-levels">Levels</button>
          <button type="button" onClick={onStart} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-300 to-amber-500 font-black text-slate-900 shadow-lg transition-transform active:scale-95" data-testid="practice-start"><Play className="h-4 w-4 fill-slate-900" />Play level {level}</button>
        </div>
      </div>
    </div>
  );
}
