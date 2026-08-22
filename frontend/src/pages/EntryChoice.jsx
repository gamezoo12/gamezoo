/**
 * Prize League — Post-signup / Post-login "Choose Your Experience" gateway.
 *
 * Sits BETWEEN a successful auth event and the user's first landing page.
 * Two premium cards → PAID CONTESTS (routes to the existing home) or
 * FREE CONTESTS (routes to the 3D Free World at /world). This screen has
 * ZERO side-effects on wallet / tickets / contests / permissions — it is
 * pure client-side routing + presentation.
 *
 * We fire lightweight `window.dispatchEvent(new CustomEvent(...))` analytics
 * events so any future tracker can wire in without touching this file.
 *
 * The `preferredContestMode` localStorage key is SET on selection but
 * intentionally NOT read on subsequent logins — per spec, auto-routing based
 * on preference stays disabled until explicitly approved. The write exists
 * only to prepare the schema for that future toggle.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Coins, Sparkles, ArrowRight, Compass, Castle, Wand2, Gem, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const PREF_KEY = 'pl_preferred_contest_mode_v1';

function emit(name, detail = {}) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* ignore */ }
}

export default function EntryChoice() {
  const nav = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => { emit('entry_choice_viewed', { userId: user?.user_id || null }); }, [user?.user_id]);

  // Not logged in? Bounce to the login page. Server-side is already the
  // authority for permissions; this is a UX guard rail only. Wait for
  // AuthContext to finish hydrating so we don't kick out valid sessions.
  useEffect(() => {
    if (!loading && user === null) nav('/login', { replace: true });
  }, [user, loading, nav]);

  const pick = (mode, route) => {
    try { localStorage.setItem(PREF_KEY, mode); } catch { /* ignore */ }
    emit(mode === 'paid' ? 'paid_contests_selected' : 'free_contests_selected', { userId: user?.user_id || null });
    nav(route, { replace: true });
  };

  const firstName = (user?.name || user?.email || 'Champion').split(/[\s@]/)[0];

  return (
    <div
      className="min-h-[calc(100vh-4rem)] relative overflow-hidden"
      style={{ background: 'radial-gradient(120% 100% at 0% 0%, #6C2BFF33 0%, transparent 55%), radial-gradient(120% 100% at 100% 100%, #FFD54A22 0%, transparent 55%), linear-gradient(180deg, #0B0D1F 0%, #161433 100%)' }}
      data-testid="entry-choice-page"
    >
      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#6C2BFF]/25 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-[#FFD54A]/15 blur-3xl" aria-hidden="true" />

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-14 relative">
        {/* Header */}
        <div className="text-center mb-8 md:mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.3em] font-black text-[#FFD54A]" data-testid="entry-choice-badge">
            <Sparkles className="w-3 h-3" /> Welcome, {firstName}
          </div>
          <h1 className="font-display font-black text-white text-3xl md:text-5xl lg:text-6xl mt-4 leading-[1.05] tracking-tight">
            Choose your <span className="bg-gradient-to-r from-[#FFE68A] via-[#FFD54A] to-[#FF9A3C] bg-clip-text text-transparent">experience</span>
          </h1>
          <p className="text-white/60 text-sm md:text-base mt-3 max-w-xl mx-auto">
            Two ways to play Prize League. Both are yours to enter — pick where you'd like to start today.
          </p>
        </div>

        {/* Two cards */}
        <div className="grid gap-5 md:gap-6 md:grid-cols-2" role="group" aria-label="Choose experience">
          <PaidCard onSelect={() => pick('paid', '/')} />
          <FreeCard onSelect={() => pick('free', '/world')} />
        </div>

        {/* Reassurance strip */}
        <div className="mt-8 md:mt-10 flex items-center justify-center gap-2 text-white/40 text-[11px] md:text-xs">
          <ShieldCheck className="w-3.5 h-3.5" />
          You can switch between Paid Contests and Free World at any time from the header.
        </div>
      </div>
    </div>
  );
}

/* ------------------------- PAID card ------------------------- */
function PaidCard({ onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      data-testid="entry-choice-paid-card"
      aria-label="Enter Paid Contests — premium Prize League competitions"
      className="group relative text-left rounded-3xl overflow-hidden border-2 border-[#FFD54A]/30 hover:border-[#FFD54A] transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-[#FFD54A]/40 shadow-[0_20px_60px_-20px_#FFD54A44] hover:shadow-[0_25px_70px_-15px_#FFD54A66] hover:-translate-y-1"
      style={{ background: 'linear-gradient(160deg, #2a1e5c 0%, #1a1236 45%, #0f0a1f 100%)' }}
    >
      {/* Gold spotlight */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-[#FFD54A]/25 blur-3xl group-hover:bg-[#FFD54A]/40 transition-colors" aria-hidden="true" />
      {/* Trophy watermark */}
      <div className="pointer-events-none absolute -bottom-8 -left-8 opacity-10 rotate-[-15deg]" aria-hidden="true">
        <Trophy className="w-52 h-52 text-[#FFD54A]" strokeWidth={1.5} />
      </div>

      <div className="relative p-6 md:p-8 min-h-[380px] md:min-h-[440px] flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="w-14 h-14 rounded-2xl grid place-items-center bg-gradient-to-br from-[#FFE68A] via-[#FFD54A] to-[#FF9A3C] text-slate-900 shadow-[0_8px_25px_-8px_#FFD54A88]">
            <Trophy className="w-7 h-7" />
          </div>
          <span className="text-[10px] uppercase tracking-[0.3em] font-black text-[#FFD54A] rounded-full border border-[#FFD54A]/40 px-2.5 py-1">Premium</span>
        </div>

        <div className="mt-6 md:mt-8">
          <div className="text-[11px] uppercase tracking-[0.35em] font-black text-[#FFD54A]/80">Option one</div>
          <h2 className="font-display font-black text-white text-3xl md:text-4xl mt-2 leading-tight">Paid Contests</h2>
          <p className="text-white/65 text-sm md:text-base mt-3 max-w-md">
            Enter live Prize League competitions with real prizes. Use your wallet tokens to buy tickets, play the skill game and climb the leaderboard.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <MiniFeature Icon={Coins} label="Token entries" />
          <MiniFeature Icon={Trophy} label="Real prizes" />
          <MiniFeature Icon={Gem} label="Verified draws" />
        </div>

        <div className="mt-auto pt-6">
          <div className="inline-flex items-center justify-between w-full rounded-xl bg-[#FFD54A] hover:brightness-110 text-slate-900 font-black text-sm md:text-base px-5 py-3 md:py-3.5 transition group-hover:pl-6" data-testid="entry-choice-paid-cta">
            Enter Paid Contests
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    </button>
  );
}

/* ------------------------- FREE card ------------------------- */
function FreeCard({ onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      data-testid="entry-choice-free-card"
      aria-label="Enter Free World — 3D adventure with skill levels and Championship Castles"
      className="group relative text-left rounded-3xl overflow-hidden border-2 border-emerald-400/25 hover:border-emerald-400 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-emerald-400/40 shadow-[0_20px_60px_-20px_#10b98155] hover:shadow-[0_25px_70px_-15px_#10b98188] hover:-translate-y-1"
      style={{ background: 'linear-gradient(160deg, #0b3d2e 0%, #0f2a4a 55%, #0a1a2f 100%)' }}
    >
      {/* Emerald spotlight */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-emerald-500/25 blur-3xl group-hover:bg-emerald-400/40 transition-colors" aria-hidden="true" />

      {/* CSS-only fantasy preview: distant mountains + castle + winding path.
          No 3D lib loaded — the real 3D world only mounts after selection. */}
      <div className="pointer-events-none absolute inset-x-0 top-16 h-40 md:h-48" aria-hidden="true">
        <svg viewBox="0 0 400 200" className="w-full h-full">
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4a2b8c" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#0a1a2f" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="hillA" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e6f4f" />
              <stop offset="100%" stopColor="#0e3b2a" />
            </linearGradient>
            <linearGradient id="hillB" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2b8a63" />
              <stop offset="100%" stopColor="#134a30" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="400" height="200" fill="url(#sky)" />
          {/* Distant mountains */}
          <polygon points="0,120 60,60 110,110 180,55 260,105 340,70 400,110 400,200 0,200" fill="url(#hillA)" opacity="0.9" />
          {/* Nearer hills */}
          <polygon points="0,160 80,120 160,150 240,115 320,145 400,125 400,200 0,200" fill="url(#hillB)" />
          {/* Castle silhouette */}
          <g transform="translate(190,60)" opacity="0.85">
            <rect x="0" y="10" width="26" height="30" fill="#FFD54A" />
            <rect x="26" y="4" width="10" height="36" fill="#FFD54A" />
            <rect x="36" y="10" width="26" height="30" fill="#FFD54A" />
            <polygon points="0,10 13,0 26,10" fill="#FF9A3C" />
            <polygon points="36,10 49,0 62,10" fill="#FF9A3C" />
            <rect x="10" y="24" width="6" height="12" fill="#4a2b8c" />
            <rect x="46" y="24" width="6" height="12" fill="#4a2b8c" />
          </g>
          {/* Winding path */}
          <path d="M -20 195 Q 100 175 160 165 T 220 140 T 300 130" stroke="#FFD54A" strokeWidth="3" fill="none" strokeDasharray="4 6" opacity="0.7" />
          {/* Level nodes */}
          <circle cx="60" cy="188" r="6" fill="#FFD54A" />
          <circle cx="140" cy="170" r="6" fill="#FFD54A" />
          <circle cx="200" cy="150" r="6" fill="#FFD54A" />
          <circle cx="260" cy="135" r="6" fill="#FFD54A" opacity="0.6" />
        </svg>
      </div>

      <div className="relative p-6 md:p-8 min-h-[380px] md:min-h-[440px] flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="w-14 h-14 rounded-2xl grid place-items-center bg-gradient-to-br from-emerald-300 via-emerald-500 to-teal-700 text-white shadow-[0_8px_25px_-8px_#10b98188]">
            <Castle className="w-7 h-7" />
          </div>
          <span className="text-[10px] uppercase tracking-[0.3em] font-black text-emerald-300 rounded-full border border-emerald-400/40 px-2.5 py-1">Adventure</span>
        </div>

        <div className="mt-6 md:mt-8">
          <div className="text-[11px] uppercase tracking-[0.35em] font-black text-emerald-300/80">Option two</div>
          <h2 className="font-display font-black text-white text-3xl md:text-4xl mt-2 leading-tight">Free Contests</h2>
          <p className="text-white/65 text-sm md:text-base mt-3 max-w-md">
            Step into the Prize League 3D World. Complete skill Levels, reach Championship Castles, and unlock premium prizes as you progress.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <MiniFeature Icon={Wand2} label="Skill Levels" green />
          <MiniFeature Icon={Castle} label="Castles" green />
          <MiniFeature Icon={Compass} label="Free entry" green />
        </div>

        <div className="mt-auto pt-6">
          <div className="inline-flex items-center justify-between w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-sm md:text-base px-5 py-3 md:py-3.5 transition group-hover:pl-6" data-testid="entry-choice-free-cta">
            Enter Free World
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    </button>
  );
}

function MiniFeature({ Icon, label, green }) {
  const cls = green
    ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-200'
    : 'bg-[#FFD54A]/10 border-[#FFD54A]/25 text-[#FFD54A]';
  return (
    <div className={`rounded-lg border ${cls} px-2.5 py-2 flex items-center gap-1.5 text-[11px] font-bold`}>
      <Icon className="w-3.5 h-3.5" />
      <span className="truncate">{label}</span>
    </div>
  );
}
