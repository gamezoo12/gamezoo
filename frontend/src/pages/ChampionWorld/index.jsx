/**
 * Champion World — entry page.
 *
 * UX:
 *   1. Landing → avatar selector (male / female).
 *   2. On confirm, mount the R3F Canvas with the chosen gender.
 *   3. World HUD is intentionally minimal:
 *        top-left  → Exit + gender chip
 *        top-right → current Level chip
 *        bottom    → context-aware CTA (Play Level N) when the champion
 *                    stands on an available/current level.
 *   4. The full "developer" HUD (Idle / Walk / Run / Wave / Victory /
 *      Championship! / Defeat) is hidden by default and only shown when
 *      the URL contains ?worldDebug=1.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Link } from 'react-router-dom';
import { ArrowLeft, User, UserRound, Sparkles, ChevronRight, Hand, Trophy, Frown, Play, PersonStanding, Zap, Flag } from 'lucide-react';
import Scene from './Scene';
import { LEVELS, CASTLE_1 } from './worldConfig';
import { getPerfPolicy } from './perfPolicy';

const isDebug = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('worldDebug') === '1';

export default function ChampionWorld() {
  const [phase, setPhase] = useState('select'); // 'select' | 'world'
  const [gender, setGender] = useState(null);
  const [showPrize, setShowPrize] = useState(false);
  const championRef = useRef();
  const policy = getPerfPolicy();
  const debug = useMemo(isDebug, []);

  // Which Level is the champion currently on/near? Poll cheaply — 4Hz.
  const [currentLevel, setCurrentLevel] = useState(LEVELS[0]);
  useEffect(() => {
    if (phase !== 'world') return;
    const id = setInterval(() => {
      const c = championRef.current;
      if (!c) return;
      const t = c.getT?.() ?? 0;
      // Pick the closest level whose t is <= champion t + 0.01, else first level.
      let best = LEVELS[0], bestDelta = 1;
      for (const l of LEVELS) {
        const d = Math.abs(l.t - t);
        if (d < bestDelta) { bestDelta = d; best = l; }
      }
      setCurrentLevel(best);
    }, 250);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === 'select') {
    return <AvatarSelector onPick={(g) => { setGender(g); setPhase('world'); }} />;
  }

  const canPlayCurrent =
    currentLevel && (currentLevel.status === 'current' || currentLevel.status === 'available');

  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 4rem)' }} data-testid="champion-world-canvas-wrap">
      <Suspense fallback={<Loader />}>
        <Canvas
          dpr={policy.dpr}
          shadows={policy.shadows}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          camera={{ position: [10, 8, -8], fov: 55, near: 0.1, far: 500 }}
          onCreated={({ gl }) => {
            gl.setClearColor('#7ba8d6');
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = policy.toneMappingExposure;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <Scene gender={gender} championRef={championRef} />
        </Canvas>
      </Suspense>

      {/* Top-left: back + gender chip */}
      <div className="absolute top-4 left-4 flex items-center gap-2" data-testid="cw-top-bar">
        <Link
          to="/choose-experience"
          className="inline-flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur border border-white/20 text-white text-xs font-bold px-3 py-2 hover:bg-black/75"
          data-testid="cw-exit-btn"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Exit
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur border border-white/20 text-white text-xs font-bold px-3 py-2 capitalize">
          {gender === 'female' ? <UserRound className="w-3.5 h-3.5 text-emerald-300" /> : <User className="w-3.5 h-3.5 text-[#FFD54A]" />}
          {gender}
        </span>
      </div>

      {/* Top-right: current level chip */}
      <div className="absolute top-4 right-4" data-testid="cw-level-chip">
        <div
          className="inline-flex items-center gap-2 rounded-full bg-black/55 backdrop-blur border border-white/20 text-white px-3 py-2"
          style={{
            boxShadow:
              currentLevel?.status === 'current'
                ? '0 0 24px -6px #FFD54A'
                : 'none',
          }}
        >
          <Flag className={`w-3.5 h-3.5 ${currentLevel?.status === 'current' ? 'text-[#FFD54A]' : 'text-white/70'}`} />
          <div className="leading-tight">
            <div className="text-[9px] uppercase tracking-widest text-white/60 font-bold">
              Championship 1
            </div>
            <div className="text-xs font-black">
              Level {currentLevel?.number ?? 1}
              <span className="ml-1 text-[10px] font-bold text-white/60">
                • {currentLevel?.status ?? 'available'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Play CTA when on a playable level */}
      {!debug && canPlayCurrent && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2" data-testid="cw-play-cta-wrap">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-[#FFD54A] hover:brightness-110 text-slate-900 font-black text-sm px-6 py-3 shadow-[0_10px_36px_-10px_#FFD54A]"
            style={{ letterSpacing: '0.04em' }}
            onClick={() => setShowPrize(true)}
            data-testid="cw-play-cta"
          >
            <Play className="w-4 h-4" /> PLAY LEVEL {currentLevel?.number}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Developer HUD — only under ?worldDebug=1 */}
      {debug && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-1.5 md:gap-2 max-w-[95%] px-3 py-2 rounded-2xl bg-black/60 backdrop-blur border border-white/15" data-testid="cw-hud">
          <HudButton icon={PersonStanding} label="Idle" onClick={() => championRef.current?.setAction('idle')} testid="hud-idle" />
          <HudButton icon={Play} label="Walk to next" onClick={() => walkToNext(championRef)} testid="hud-walk" />
          <HudButton icon={Zap} label="Run to castle" onClick={() => championRef.current?.runTo(CASTLE_1.t)} testid="hud-run" />
          <HudButton icon={Hand} label="Wave" onClick={() => championRef.current?.setAction('wave')} testid="hud-wave" />
          <HudButton icon={Trophy} label="Victory" onClick={() => championRef.current?.setAction('victory')} testid="hud-victory" gold />
          <HudButton icon={Sparkles} label="Championship!" onClick={() => { championRef.current?.setAction('championship-victory'); setShowPrize(true); }} testid="hud-champ-victory" gold />
          <HudButton icon={Frown} label="Defeat" onClick={() => championRef.current?.setAction('defeat')} testid="hud-defeat" />
        </div>
      )}

      {/* Prize reveal panel */}
      {showPrize && <PrizeReveal onClose={() => setShowPrize(false)} />}
    </div>
  );
}

function walkToNext(championRef) {
  const c = championRef.current;
  if (!c) return;
  const currentT = c.getT();
  const next = LEVELS.find((l) => l.t > currentT + 0.005);
  if (next) c.walkTo(next.t);
  else c.walkTo(CASTLE_1.t);
}

function HudButton({ icon: Icon, label, onClick, testid, gold }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] md:text-xs font-black transition ${
        gold
          ? 'bg-[#FFD54A] hover:brightness-110 text-slate-900'
          : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
      }`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function PrizeReveal({ onClose }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10 animate-in fade-in duration-300" data-testid="cw-prize-reveal">
      <div className="relative rounded-3xl overflow-hidden border-2 border-[#FFD54A] shadow-2xl max-w-md w-[90%]"
        style={{ background: 'linear-gradient(160deg, #2a1e5c 0%, #1a1236 55%, #0f0a1f 100%)' }}
      >
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-[#FFD54A]/30 blur-3xl" aria-hidden="true" />
        <div className="relative p-6 md:p-8 text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] font-black text-[#FFD54A]">Championship 1</div>
          <h2 className="font-display font-black text-white text-3xl md:text-4xl mt-2">Prize Revealed</h2>
          <div className="mt-6 w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-[#FFE68A] via-[#FFD54A] to-[#FF9A3C] grid place-items-center shadow-[0_10px_50px_-5px_#FFD54A]">
            <Trophy className="w-12 h-12 text-slate-900" />
          </div>
          <div className="mt-4 font-display text-2xl text-white font-black">{CASTLE_1.prize.title}</div>
          <div className="text-white/60 text-sm mt-1">{CASTLE_1.prize.description}</div>
          <div className="text-[10px] text-white/40 mt-4 uppercase tracking-widest">Real prize values are verified by admin</div>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FFD54A] hover:brightness-110 text-slate-900 font-black text-sm px-5 py-2.5"
            data-testid="cw-prize-close"
          >
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Avatar selector ---------- */
function AvatarSelector({ onPick }) {
  return (
    <div
      className="relative w-full min-h-[calc(100vh-4rem)] overflow-hidden"
      style={{ background: 'radial-gradient(120% 100% at 0% 0%, #10b98122 0%, transparent 55%), radial-gradient(120% 100% at 100% 100%, #FFD54A22 0%, transparent 55%), linear-gradient(180deg, #0B0D1F 0%, #0a1a2f 100%)' }}
      data-testid="cw-avatar-select"
    >
      <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-emerald-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-[#FFD54A]/15 blur-3xl" />

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-14 relative">
        <Link to="/choose-experience" className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-sm mb-6" data-testid="cw-back">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.3em] font-black text-[#FFD54A]">
            <Sparkles className="w-3 h-3" /> Choose your champion
          </div>
          <h1 className="font-display font-black text-white text-3xl md:text-5xl mt-4 leading-[1.05]">
            Enter the <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-300 bg-clip-text text-transparent">Wonderland</span>
          </h1>
          <p className="text-white/60 text-sm md:text-base mt-3 max-w-xl mx-auto">
            Pick your Champion. Both play the same skill Levels and reach the same Championship Castles.
          </p>
        </div>

        <div className="grid gap-4 md:gap-6 md:grid-cols-2">
          <ChampionCard gender="male" onPick={onPick} />
          <ChampionCard gender="female" onPick={onPick} />
        </div>

        <p className="text-[11px] text-white/40 text-center mt-8 max-w-lg mx-auto">
          Preview build — the final visible characters will be premium fantasy-hero GLB models. This selector wires into any GLB pipeline via a single URL swap.
        </p>
      </div>
    </div>
  );
}

function ChampionCard({ gender, onPick }) {
  const isFemale = gender === 'female';
  const color = isFemale ? 'emerald' : 'gold';
  const swatch = isFemale
    ? { bg: 'linear-gradient(160deg, #0b3d2e 0%, #0f2a4a 55%, #0a1a2f 100%)', border: 'border-emerald-400/40 hover:border-emerald-400', ring: 'focus:ring-emerald-400/40', chipBg: 'bg-emerald-500/10 border-emerald-400/40 text-emerald-200', shadow: 'shadow-[0_20px_60px_-20px_#10b98155] hover:shadow-[0_25px_70px_-15px_#10b98188]', capeFill: '#10b981', tunic: '#2A6A9C', hair: '#a04a20' }
    : { bg: 'linear-gradient(160deg, #2a1e5c 0%, #1a1236 55%, #0f0a1f 100%)',   border: 'border-[#FFD54A]/40 hover:border-[#FFD54A]', ring: 'focus:ring-[#FFD54A]/40', chipBg: 'bg-[#FFD54A]/10 border-[#FFD54A]/40 text-[#FFD54A]', shadow: 'shadow-[0_20px_60px_-20px_#FFD54A44] hover:shadow-[0_25px_70px_-15px_#FFD54A66]', capeFill: '#6C2BFF', tunic: '#3B2AA8', hair: '#3a2416' };
  return (
    <button
      type="button"
      onClick={() => onPick(gender)}
      data-testid={`cw-champion-${gender}`}
      className={`group relative rounded-3xl overflow-hidden border-2 transition-all duration-300 focus:outline-none focus:ring-4 ${swatch.border} ${swatch.ring} ${swatch.shadow} hover:-translate-y-1 text-left`}
      style={{ background: swatch.bg }}
    >
      <div className={`absolute -top-16 -right-16 w-56 h-56 rounded-full ${color === 'gold' ? 'bg-[#FFD54A]/25' : 'bg-emerald-400/25'} blur-3xl`} aria-hidden="true" />
      <div className="relative p-5 md:p-6 min-h-[400px] flex flex-col items-center">
        {/* SVG portrait — quick premium-feeling silhouette */}
        <ChampionPortraitSVG capeFill={swatch.capeFill} tunic={swatch.tunic} hair={swatch.hair} isFemale={isFemale} />

        <div className="mt-auto w-full">
          <div className={`text-[11px] uppercase tracking-[0.3em] font-black ${color === 'gold' ? 'text-[#FFD54A]' : 'text-emerald-300'} text-center`}>
            {isFemale ? 'Champion II' : 'Champion I'}
          </div>
          <h3 className="font-display font-black text-white text-2xl md:text-3xl mt-1 text-center">{isFemale ? 'Female' : 'Male'} Champion</h3>

          <div className="mt-4 grid grid-cols-3 gap-1.5">
            <span className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold text-center ${swatch.chipBg}`}>Same skills</span>
            <span className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold text-center ${swatch.chipBg}`}>Same Levels</span>
            <span className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold text-center ${swatch.chipBg}`}>Same prizes</span>
          </div>

          <div className={`mt-4 inline-flex items-center justify-between w-full rounded-xl font-black text-sm px-4 py-2.5 ${color === 'gold' ? 'bg-[#FFD54A] text-slate-900 group-hover:brightness-110' : 'bg-emerald-500 text-white group-hover:bg-emerald-400'} transition`}>
            Enter as {isFemale ? 'Female' : 'Male'} <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </button>
  );
}

function ChampionPortraitSVG({ capeFill, tunic, hair, isFemale }) {
  return (
    <svg viewBox="0 0 220 240" className="w-40 md:w-48 h-auto drop-shadow-2xl">
      {/* cape */}
      <path d="M60 90 Q60 200 90 220 L130 220 Q160 200 160 90 Z" fill={capeFill} opacity="0.85" />
      {/* body */}
      <rect x="80" y="105" width="60" height="80" rx="10" fill={tunic} />
      {/* belt */}
      <rect x="80" y="150" width="60" height="12" fill="#3a2416" />
      <rect x="102" y="150" width="16" height="12" fill="#FFD54A" />
      {/* head */}
      <ellipse cx="110" cy="70" rx="28" ry="30" fill="#e8b892" />
      {/* hair */}
      {isFemale ? (
        <>
          <path d="M82 65 Q82 40 110 35 Q138 40 138 65 L138 78 Q125 68 110 68 Q95 68 82 78 Z" fill={hair} />
          <ellipse cx="150" cy="95" rx="10" ry="24" fill={hair} />
        </>
      ) : (
        <path d="M82 60 Q82 40 110 38 Q138 40 138 60 L134 68 Q125 60 110 60 Q95 60 86 68 Z" fill={hair} />
      )}
      {/* forehead gem */}
      <circle cx="110" cy="52" r="4" fill="#FFD54A" />
      {/* eyes */}
      <circle cx="100" cy="72" r="2.5" fill="#1a1330" />
      <circle cx="120" cy="72" r="2.5" fill="#1a1330" />
      {/* smile */}
      <path d="M100 84 Q110 90 120 84" stroke="#1a1330" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* arms */}
      <rect x="66" y="108" width="16" height="52" rx="8" fill={tunic} />
      <rect x="138" y="108" width="16" height="52" rx="8" fill={tunic} />
      {/* hands */}
      <circle cx="74" cy="168" r="9" fill="#e8b892" />
      <circle cx="146" cy="168" r="9" fill="#e8b892" />
      {/* legs */}
      <rect x="88" y="185" width="14" height="42" rx="6" fill="#1a1330" />
      <rect x="118" y="185" width="14" height="42" rx="6" fill="#1a1330" />
    </svg>
  );
}

function Loader() {
  // Sky-tone background (matches the R3F clear colour) so the switch from
  // loader → world is seamless, never a black/white flash.
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{
        background:
          'radial-gradient(ellipse at 50% 30%, #b6d3f2 0%, #7ba8d6 40%, #4a76ac 100%)',
      }}
      data-testid="cw-loader"
    >
      <div className="text-center">
        <div className="text-white/90 text-xs font-bold tracking-[0.4em] mb-3">
          PRIZE LEAGUE
        </div>
        <div className="text-white text-lg font-black tracking-wide drop-shadow">
          Entering Wonderland…
        </div>
        <div className="mt-4 mx-auto h-1 w-32 rounded-full bg-white/25 overflow-hidden">
          <div className="h-full w-1/3 bg-white/90 animate-pulse rounded-full" />
        </div>
      </div>
    </div>
  );
}
