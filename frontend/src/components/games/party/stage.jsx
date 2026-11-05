import { useMemo, useState } from 'react';
import { Clock, MessageCircle } from 'lucide-react';
import { QUICK_REPLIES, REACTIONS, themeFor } from './kit';

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Sparks({ theme }) {
  const dots = useMemo(() => Array.from({ length: theme.sparks }, (_, i) => ({ l: (i * 37 + theme.lv * 13) % 100, d: 6 + ((i * 7) % 9), dl: (i * 0.9) % 7, s: 3 + (i % 4) * 2 })), [theme.sparks, theme.lv]);
  return <div className="pointer-events-none absolute inset-0 overflow-hidden">{dots.map((p, i) => <span key={i} className="pty-spark" style={{ left: `${p.l}%`, width: p.s, height: p.s, background: theme.spark, boxShadow: `0 0 ${p.s * 3}px ${theme.spark}`, animationDuration: `${p.d}s`, animationDelay: `-${p.dl}s` }} />)}</div>;
}

export function Avatar({ p, active, turnPct, bubble, idx, edge }) {
  const pos = edge === 'l' ? 'left-0' : edge === 'r' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <div className="relative flex min-w-0 flex-col items-center" data-testid={`party-player-${idx}`}>
      {bubble && <div key={bubble.id} className={`pty-bubble absolute bottom-full z-20 mb-1 w-max max-w-[150px] ${pos} rounded-2xl bg-white px-2.5 py-1.5 text-[11px] font-bold leading-tight text-slate-900 shadow-xl`} data-testid={`party-bubble-${idx}`}>{bubble.text}</div>}
      <div className="relative h-12 w-12 rounded-full p-[3px] sm:h-14 sm:w-14" style={{ background: active && turnPct != null ? `conic-gradient(${p.color} ${turnPct * 360}deg, rgba(255,255,255,0.15) 0)` : p.color, boxShadow: active ? `0 0 22px ${p.color}` : 'none' }}>
        {p.img ? <img src={p.img} alt={p.name} className={`h-full w-full rounded-full object-cover ${active ? '' : 'opacity-80 saturate-50'}`} /> : <span className="flex h-full w-full items-center justify-center rounded-full bg-slate-900 font-display text-lg font-black text-white">{p.name.slice(0, 1).toUpperCase()}</span>}
        {active && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-white px-1.5 text-[8px] font-black uppercase text-slate-900">turn</span>}
      </div>
      <div className="mt-1 max-w-[72px] truncate text-[10px] font-black text-white">{p.name}</div>
      {p.info != null && <div className="text-[9px] font-bold text-white/70" data-testid={`party-player-info-${idx}`}>{p.info}</div>}
    </div>
  );
}

// Full-bleed themed stage: AI backdrop per world, HUD with live avatars + speech bubbles, clocks, chat and quick replies.
export function PartyStage({ config, title, players, active, turnLeft, turnSec, matchLeft, banter, children, flash, meIdx = 0 }) {
  const th = themeFor(config);
  const latest = {};
  const now = Date.now();
  (banter?.msgs || []).forEach((m) => { if (now - m.at < 4500) latest[m.who] = m; });
  const flying = (banter?.msgs || []).filter((m) => m.emoji && now - m.at < 2500);
  const turnPct = turnSec && turnLeft != null ? turnLeft / turnSec : null;
  return (
    <div className={`relative mx-auto w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/15 shadow-2xl ${flash === 'bad' ? 'pty-shake' : ''}`} style={{ boxShadow: `0 30px 90px ${th.glow}55` }} data-testid="party-stage" data-theme={th.id}>
      <img src={th.bg} alt="" className="pty-kenburns absolute inset-0 h-full w-full object-cover" style={{ objectPosition: th.pan, filter: `hue-rotate(${th.hue}deg) saturate(1.15)` }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0.25) 70%, rgba(0,0,0,0.75) 100%)' }} />
      <Sparks theme={th} />
      <div className="relative p-3 sm:p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-display text-base font-black uppercase tracking-wider text-white drop-shadow sm:text-lg">{title}</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: th.accent }} data-testid="party-theme-name">Level {th.lv} · {th.name}</div>
          </div>
          {matchLeft != null && <div className={`flex items-center gap-1 rounded-full bg-black/50 px-3 py-1 font-display text-sm font-black tabular-nums backdrop-blur ${matchLeft < 20 ? 'animate-pulse text-rose-300' : 'text-white'}`} data-testid="party-match-clock"><Clock className="h-3.5 w-3.5" />{fmt(matchLeft)}</div>}
        </div>
        <div className="mb-3 mt-10 flex items-start justify-around gap-1">
          {players.map((p, i) => <Avatar key={p.name} p={p} idx={i} active={active === i} turnPct={active === i ? turnPct : null} bubble={latest[i - 1] && (latest[i - 1].text || latest[i - 1].emoji) ? { ...latest[i - 1], text: latest[i - 1].text || latest[i - 1].emoji } : null} edge={players.length > 1 && i === 0 ? 'l' : players.length > 1 && i === players.length - 1 ? 'r' : null} />)}
        </div>
        {flying.map((m) => <span key={m.id} className="pty-float pointer-events-none absolute z-30 text-5xl" style={{ left: `${((m.who + 1.5) / Math.max(1, players.length)) * 100}%`, top: '120px' }}>{m.emoji}</span>)}
        {turnLeft != null && active === meIdx && <div className={`mx-auto mb-2 w-fit rounded-full bg-black/55 px-3 py-0.5 text-center text-[11px] font-black backdrop-blur ${turnLeft < 4 ? 'animate-pulse text-rose-300' : 'text-white'}`} data-testid="party-turn-clock">Your move · {Math.ceil(turnLeft)}s</div>}
        <div className="relative">{children}</div>
        {banter && <ChatBar banter={banter} accent={th.accent} />}
      </div>
    </div>
  );
}

function ChatBar({ banter, accent }) {
  const last = banter.msgs.filter((m) => m.text).slice(-2);
  const [text, setText] = useState('');
  const send = (e) => { e.preventDefault(); if (text.trim()) { banter.reply(text.trim().slice(0, 120)); setText(''); } };
  return (
    <div className="mt-3" data-testid="party-chat">
      <div className="min-h-[38px] space-y-1">
        {last.map((m) => <div key={m.id} className={`pty-bubble flex ${m.mine ? 'justify-end' : ''}`}><span className={`max-w-[85%] rounded-2xl px-2.5 py-1 text-[11px] font-semibold ${m.mine ? 'bg-white text-slate-900' : 'bg-black/55 text-white backdrop-blur'}`}>{!m.mine && <b style={{ color: accent }}>{m.name || ''}</b>}{m.text}</span></div>)}
      </div>
      <div className="mt-2 flex items-center justify-between gap-1" data-testid="party-reactions">
        {REACTIONS.map(([e], i) => <button key={e} type="button" onClick={() => banter.react(e)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xl backdrop-blur transition-transform hover:scale-110 active:scale-90" data-testid={`party-react-${i}`}>{e}</button>)}
      </div>
      <form onSubmit={send} className="mt-2 flex items-center gap-1.5">
        <MessageCircle className="h-4 w-4 shrink-0 text-white/60" />
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={120} placeholder="Type a message…" className="h-9 min-w-0 flex-1 rounded-full border border-white/20 bg-black/40 px-3 text-xs text-white placeholder:text-white/40 focus:outline-none" data-testid="party-chat-input" />
        <button type="submit" className="h-9 shrink-0 rounded-full px-3 text-xs font-black text-slate-900" style={{ background: accent }} data-testid="party-chat-send">Send</button>
      </form>
      {banter.quick && <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
        {QUICK_REPLIES.map((q, i) => <button key={q} type="button" onClick={() => banter.reply(q)} className="shrink-0 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur transition-colors hover:bg-white/25" data-testid={`party-reply-${i}`}>{q}</button>)}
      </div>}
    </div>
  );
}

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACE = { 1: 'rotateY(0deg)', 6: 'rotateY(180deg)', 2: 'rotateY(90deg)', 5: 'rotateY(-90deg)', 3: 'rotateX(90deg)', 4: 'rotateX(-90deg)' };
const SHOW = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };
// Real 3D dice that tumbles to the rolled face. spin increments on every roll.
export function Dice3D({ value = 1, spin = 0, size = 56, color = '#ffffff', pip = '#111827', onClick, disabled, testId }) {
  const [rx, ry] = SHOW[value || 1];
  const h = size / 2;
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="relative disabled:cursor-default" style={{ width: size, height: size, perspective: size * 6 }} data-testid={testId} aria-label={`Dice showing ${value}`}>
      <div className="relative h-full w-full transition-transform duration-700 ease-out" style={{ transformStyle: 'preserve-3d', transform: `rotateX(${rx + spin * 720}deg) rotateY(${ry + spin * 360}deg)` }}>
        {[1, 2, 3, 4, 5, 6].map((f) => (
          <div key={f} className="absolute inset-0 grid grid-cols-3 grid-rows-3 rounded-[22%] p-[14%]" style={{ transform: `${FACE[f]} translateZ(${h}px)`, background: `radial-gradient(circle at 30% 25%, #fff, ${color})`, boxShadow: 'inset 0 -4px 8px rgba(0,0,0,0.25)', backfaceVisibility: 'hidden' }}>
            {Array.from({ length: 9 }, (_, i) => <span key={i} className="m-auto rounded-full" style={{ width: '70%', height: '70%', background: PIPS[f].includes(i) ? pip : 'transparent', boxShadow: PIPS[f].includes(i) ? 'inset 0 2px 2px rgba(0,0,0,0.6)' : 'none' }} />)}
          </div>
        ))}
      </div>
    </button>
  );
}
