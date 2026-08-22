/**
 * Free World placeholder page.
 * The full 3D experience will replace this component. Until then, this
 * gives the /world route a polished landing so post-selection flow doesn't
 * dead-end.
 */
import { Link } from 'react-router-dom';
import { Castle, Sparkles, ArrowLeft, Compass, Wand2, Trophy } from 'lucide-react';

export default function FreeWorld() {
  return (
    <div
      className="min-h-[calc(100vh-4rem)] relative overflow-hidden"
      style={{ background: 'radial-gradient(120% 100% at 0% 0%, #10b98133 0%, transparent 55%), radial-gradient(120% 100% at 100% 100%, #6C2BFF33 0%, transparent 55%), linear-gradient(180deg, #0B0D1F 0%, #0a1a2f 100%)' }}
      data-testid="free-world-page"
    >
      <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-[#6C2BFF]/25 blur-3xl" aria-hidden="true" />

      <div className="max-w-4xl mx-auto px-4 md:px-8 py-10 md:py-16 text-center relative">
        <Link
          to="/choose-experience"
          className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-sm mb-6"
          data-testid="free-world-back"
        >
          <ArrowLeft className="w-4 h-4" /> Change experience
        </Link>

        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-400/30 px-3 py-1 text-[10px] uppercase tracking-[0.3em] font-black text-emerald-300">
          <Sparkles className="w-3 h-3" /> Coming soon
        </div>

        <h1 className="font-display font-black text-white text-4xl md:text-6xl mt-5 leading-[1.05]">
          The <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-300 bg-clip-text text-transparent">Free World</span> is being built.
        </h1>
        <p className="text-white/60 text-sm md:text-lg mt-4 max-w-xl mx-auto">
          A 3D adventure with 100 skill Levels, 10 Championship Castles and cinematic prize reveals — coming to Prize League soon. Play Paid Contests in the meantime to earn real prizes.
        </p>

        <div className="grid grid-cols-3 gap-3 md:gap-4 max-w-2xl mx-auto mt-8">
          <TeaserTile Icon={Wand2} title="Skill Levels" body="Progress through 100 Levels across every World." />
          <TeaserTile Icon={Castle} title="Championship Castles" body="Reach a Castle after every 10 Levels." />
          <TeaserTile Icon={Trophy} title="Prize Reveals" body="Cinematic prize unveilings at every Castle." />
        </div>

        <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full bg-[#FFD54A] hover:brightness-110 text-slate-900 font-black text-sm px-5 py-3 transition"
            data-testid="free-world-goto-paid"
          >
            <Trophy className="w-4 h-4" /> Play Paid Contests
          </Link>
          <Link
            to="/choose-experience"
            className="inline-flex items-center gap-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-sm px-5 py-3 transition"
          >
            <Compass className="w-4 h-4" /> Back to selection
          </Link>
        </div>
      </div>
    </div>
  );
}

function TeaserTile({ Icon, title, body }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-4 md:p-5 text-left">
      <Icon className="w-6 h-6 text-emerald-300 mb-2" />
      <div className="font-display font-black text-white text-sm md:text-base">{title}</div>
      <div className="text-[11px] md:text-xs text-white/50 mt-1 leading-snug">{body}</div>
    </div>
  );
}
