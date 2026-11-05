import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Heart } from 'lucide-react';
import { difficultyOf } from '../../../lib/difficulty';
import { BOTS, YOU, sfx, themeFor, useBanter, useClocks } from './kit';
import { PartyStage } from './stage';

// Snake Arena: classic snake vs a rival bot snake. Eat fruit to grow; first to the target wins.
// Walls, your own tail and the rival's body cost a life (3 lives). Match clock: most fruit wins when it ends.
const G = 18;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const RIVAL = BOTS[0];
const spawn = (side) => (side === 0 ? { body: [[3, 14], [3, 15], [3, 16]], dir: 'up', grow: 0 } : { body: [[14, 3], [14, 2], [14, 1]], dir: 'down', grow: 0 });
const key = ([x, y]) => y * G + x;
const out = ([x, y]) => x < 0 || y < 0 || x >= G || y >= G;
function freeCell(snakes) {
  const taken = new Set(snakes.flatMap((s) => (s ? s.body.map(key) : [])));
  for (let i = 0; i < 400; i += 1) { const c = [Math.floor(Math.random() * G), Math.floor(Math.random() * G)]; if (!taken.has(key(c))) return c; }
  return [0, 0];
}
function space(start, blocked, limit) {
  const seen = new Set([key(start)]); const q = [start];
  while (q.length && seen.size < limit) { const [x, y] = q.shift(); Object.values(DIRS).forEach(([dx, dy]) => { const n = [x + dx, y + dy]; if (!out(n) && !blocked.has(key(n)) && !seen.has(key(n))) { seen.add(key(n)); q.push(n); } }); }
  return seen.size;
}
function botDir(me, you, fruit, level) {
  const blocked = new Set([...me.body.slice(0, -1), ...(you ? you.body : [])].map(key));
  const [hx, hy] = me.body[0];
  const opts = Object.keys(DIRS).filter((d) => d !== OPP[me.dir]).map((d) => ({ d, n: [hx + DIRS[d][0], hy + DIRS[d][1]] }));
  const safe = opts.filter((o) => !out(o.n) && !blocked.has(key(o.n)));
  if (!safe.length) return me.dir;
  if (level <= 2 && Math.random() < 0.06) return opts[Math.floor(Math.random() * opts.length)].d;
  if (Math.random() < 0.2 - level * 0.018) return safe[Math.floor(Math.random() * safe.length)].d;
  const dist = (n) => Math.abs(n[0] - fruit[0]) + Math.abs(n[1] - fruit[1]);
  const scored = safe.map((o) => ({ ...o, v: -dist(o.n) + (level >= 6 && space(o.n, blocked, me.body.length + 4) < me.body.length + 2 ? -100 : 0) }));
  return scored.sort((a, b) => b.v - a.v)[0].d;
}

function useSnakeEngine({ level, onEvent }) {
  const S = useRef(null);
  if (!S.current) S.current = { you: spawn(0), bot: spawn(1), fruit: [9, 9], gold: false, queue: [], score: [0, 0], lives: 3, youDead: 0, botDead: 0, tick: 0, parts: [], over: false };
  const [hud, setHud] = useState({ score: [0, 0], lives: 3 });
  const evRef = useRef(onEvent); evRef.current = onEvent;
  const tickMs = Math.max(75, 175 - level * 9);
  const target = 6 + level;
  useEffect(() => {
    const id = setInterval(() => {
      const s = S.current; if (s.over) return;
      s.tick += 1;
      const now = Date.now();
      const step = (snk, who) => {
        if (who === 0 && s.queue.length) { const d = s.queue.shift(); if (d !== OPP[snk.dir]) snk.dir = d; }
        const [hx, hy] = snk.body[0];
        return [hx + DIRS[snk.dir][0], hy + DIRS[snk.dir][1]];
      };
      const botSkips = level <= 3 ? s.tick % 3 === 0 : level <= 6 ? s.tick % 5 === 0 : false;
      const yn = s.youDead < now ? step(s.you, 0) : null;
      if (s.botDead < now && !botSkips) s.bot.dir = botDir(s.bot, s.youDead < now ? s.you : null, s.fruit, level);
      const bn = s.botDead < now && !botSkips ? step(s.bot, 1) : null;
      const crash = (n, self, other) => out(n) || self.body.slice(0, -1).some((c) => key(c) === key(n)) || (other && other.body.some((c) => key(c) === key(n)));
      const youHit = yn && (crash(yn, s.you, s.botDead < now ? s.bot : null) || (bn && key(bn) === key(yn)));
      const botHit = bn && (crash(bn, s.bot, s.youDead < now ? s.you : null) || (yn && key(bn) === key(yn)));
      [[yn, youHit, 'you', 0], [bn, botHit, 'bot', 1]].forEach(([n, hit, k, who]) => {
        if (!n || hit) return;
        const snk = s[k];
        snk.body.unshift(n);
        if (key(n) === key(s.fruit)) {
          const pts = s.gold ? 2 : 1; s.score[who] += pts; snk.grow += pts;
          s.parts.push({ x: n[0], y: n[1], t: now, c: s.gold ? '#fde047' : '#f87171' });
          s.fruit = freeCell([s.you, s.bot]); s.gold = level >= 3 && Math.random() < 0.18;
          evRef.current({ kind: 'eat', who, score: [...s.score] });
        }
        if (snk.grow > 0) snk.grow -= 1; else snk.body.pop();
      });
      if (youHit) { s.lives -= 1; s.youDead = now + 1100; s.parts.push({ x: s.you.body[0][0], y: s.you.body[0][1], t: now, c: '#60a5fa' }); s.you = spawn(0); s.queue = []; evRef.current({ kind: 'crash', who: 0, lives: s.lives }); }
      if (botHit) { s.botDead = now + 1600; s.parts.push({ x: s.bot.body[0][0], y: s.bot.body[0][1], t: now, c: '#f472b6' }); s.bot = spawn(1); evRef.current({ kind: 'crash', who: 1 }); }
      if (s.score[0] >= target || s.score[1] >= target || s.lives <= 0) { s.over = true; evRef.current({ kind: 'over', won: s.score[0] >= target && s.lives > 0 }); }
      setHud({ score: [...s.score], lives: s.lives });
    }, tickMs);
    return () => clearInterval(id);
  }, [tickMs, level, target]);
  const turn = (d) => { const s = S.current; const last = s.queue[s.queue.length - 1] || s.you.dir; if (d !== last && d !== OPP[last] && s.queue.length < 3) s.queue.push(d); };
  return { S, hud, turn, target };
}

function draw(cv, s, theme) {
  const ctx = cv.getContext('2d'); const W = cv.width; const c = W / G; const now = Date.now();
  for (let y = 0; y < G; y += 1) for (let x = 0; x < G; x += 1) { ctx.fillStyle = theme.felt; ctx.fillRect(x * c, y * c, c, c); if ((x + y) % 2) { ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x * c, y * c, c, c); } }
  ctx.strokeStyle = `${theme.accent}22`; ctx.lineWidth = 1;
  for (let i = 0; i <= G; i += 1) { ctx.beginPath(); ctx.moveTo(i * c, 0); ctx.lineTo(i * c, W); ctx.moveTo(0, i * c); ctx.lineTo(W, i * c); ctx.stroke(); }
  const [fx, fy] = s.fruit; const pulse = 1 + Math.sin(now / 160) * 0.08;
  ctx.save(); ctx.shadowColor = s.gold ? '#fde047' : '#f87171'; ctx.shadowBlur = c * 0.8;
  const gr = ctx.createRadialGradient(fx * c + c * 0.38, fy * c + c * 0.38, c * 0.05, fx * c + c / 2, fy * c + c / 2, c * 0.45);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, s.gold ? '#fde047' : '#ef4444'); gr.addColorStop(1, s.gold ? '#a16207' : '#7f1d1d');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(fx * c + c / 2, fy * c + c / 2, c * 0.4 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.ellipse(fx * c + c * 0.62, fy * c + c * 0.14, c * 0.14, c * 0.07, -0.6, 0, Math.PI * 2); ctx.fill();
  const snake = (snk, head, tail, dead) => {
    if (dead) ctx.globalAlpha = 0.35 + Math.abs(Math.sin(now / 90)) * 0.4;
    const pts = snk.body.map(([x, y]) => [x * c + c / 2, y * c + c / 2]);
    const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.save(); ctx.shadowColor = head; ctx.shadowBlur = c * 0.6; ctx.strokeStyle = tail; ctx.lineWidth = c * 0.8; path(); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = head; ctx.lineWidth = c * 0.58; path(); ctx.stroke();
    ctx.setLineDash([c * 0.12, c * 0.38]); ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = c * 0.22; path(); ctx.stroke(); ctx.setLineDash([]);
    const [px, py] = pts[0]; const hg = ctx.createRadialGradient(px - c * 0.12, py - c * 0.12, 1, px, py, c * 0.55);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.35, head); hg.addColorStop(1, tail);
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(px, py, c * 0.5, 0, Math.PI * 2); ctx.fill();
    const [hx, hy] = snk.body[0]; const [dx, dy] = DIRS[snk.dir];
    [[-1], [1]].forEach(([side]) => {
      const ex = hx * c + c / 2 + dx * c * 0.15 + -dy * side * c * 0.18; const ey = hy * c + c / 2 + dy * c * 0.15 + dx * side * c * 0.18;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, c * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex + dx * c * 0.04, ey + dy * c * 0.04, c * 0.065, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  };
  snake(s.bot, '#f472b6', '#be185d', s.botDead > now);
  snake(s.you, '#60a5fa', '#1d4ed8', s.youDead > now);
  s.parts = s.parts.filter((p) => now - p.t < 500);
  s.parts.forEach((p) => { const a = (now - p.t) / 500; for (let i = 0; i < 10; i += 1) { const ang = (i / 10) * Math.PI * 2; ctx.globalAlpha = 1 - a; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x * c + c / 2 + Math.cos(ang) * a * c * 1.6, p.y * c + c / 2 + Math.sin(ang) * a * c * 1.6, c * 0.12, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; });
}

export function SnakeArena({ config, onComplete }) {
  const level = difficultyOf(config);
  const theme = themeFor(config);
  const banter = useBanter('Snake Arena (a snake game race for fruit)', [RIVAL]);
  const cv = useRef(null);
  const [start] = useState(Date.now);
  const done = useRef(false);
  const matchSec = Math.max(75, 150 - level * 5);
  const finish = (won, why) => {
    if (done.current) return; done.current = true; engine.S.current.over = true;
    sfx(won ? 'win' : 'lose');
    banter.say(0, won ? 'you_win' : 'bot_win', { big: true, force: true, event: won ? 'the human beat you at snake' : 'you beat the human at snake', detail: why || '' });
    const s = engine.S.current;
    setTimeout(() => onComplete({ solved: won, accuracy: won ? Math.min(1, 0.4 + s.lives * 0.2) : Math.min(0.9, s.score[0] / engine.target), duration_ms: Date.now() - start }), 1800);
  };
  const engine = useSnakeEngine({ level, onEvent: (e) => {
    if (e.kind === 'eat') { sfx(e.who === 0 ? 'pop' : 'step'); if (e.who === 1 && Math.random() < 0.35) banter.say(0, 'bot_good'); if (e.who === 0 && e.score[0] > e.score[1] + 1) banter.say(0, 'you_good'); }
    if (e.kind === 'crash') { sfx(e.who === 0 ? 'capture' : 'bad'); if (e.who === 0) banter.say(0, 'bot_hit', { big: true, event: 'the human snake just crashed', detail: `they have ${e.lives} lives left` }); else banter.say(0, 'bot_bad', { big: Math.random() < 0.4, event: 'you crashed your own snake' }); }
    if (e.kind === 'over') finish(e.won, e.won ? 'reached the fruit target' : 'rival got there first or out of lives');
  } });
  const { matchLeft } = useClocks({ matchSec, running: !done.current, onMatchOut: () => { const s = engine.S.current; finish(s.score[0] > s.score[1], 'match clock ran out, most fruit won'); } });

  useEffect(() => { banter.say(0, 'start', { force: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let raf;
    const loop = () => { if (cv.current) draw(cv.current, engine.S.current, theme); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [theme.id, theme.lv]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    const onKey = (e) => { const d = map[e.key]; if (d) { e.preventDefault(); engine.turn(d); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const touch = useRef(null);
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const t = e.changedTouches[0]; const dx = t.clientX - touch.current[0]; const dy = t.clientY - touch.current[1];
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 18) engine.turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };
  const { score, lives } = engine.hud;
  const players = [{ ...YOU, color: '#60a5fa', info: `${score[0]}/${engine.target} fruit` }, { ...RIVAL, color: '#f472b6', info: `${score[1]}/${engine.target} fruit` }];
  const Pad = ({ d, Icon, cls }) => <button type="button" onClick={() => engine.turn(d)} className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur active:scale-90 active:bg-white/30 ${cls}`} data-testid={`snake-${d}`}><Icon className="h-6 w-6" /></button>;
  return (
    <PartyStage config={config} title="Snake Arena" players={players} active={0} matchLeft={matchLeft} banter={banter}>
      <div className="mb-2 flex items-center justify-center gap-1" data-testid="snake-lives">{[0, 1, 2].map((i) => <Heart key={i} className={`h-4 w-4 ${i < lives ? 'fill-rose-500 text-rose-500' : 'text-white/30'}`} />)}</div>
      <div className="mx-auto max-w-[440px] rounded-[22px] p-2" style={{ background: theme.frame, boxShadow: `0 0 0 2px ${theme.accent}99, 0 25px 60px rgba(0,0,0,0.55)` }}>
        <canvas ref={cv} width={720} height={720} className="block aspect-square w-full touch-none rounded-xl" onTouchStart={(e) => { touch.current = [e.touches[0].clientX, e.touches[0].clientY]; }} onTouchEnd={onTouchEnd} data-testid="snake-board" />
      </div>
      <div className="mx-auto mt-3 grid w-44 grid-cols-3 justify-items-center gap-1.5">
        <span /><Pad d="up" Icon={ArrowUp} /><span />
        <Pad d="left" Icon={ArrowLeft} /><Pad d="down" Icon={ArrowDown} /><Pad d="right" Icon={ArrowRight} />
      </div>
      <p className="mt-2 text-center text-[11px] text-white/70">Arrow keys, WASD or swipe to steer. Gold fruit = 2 points. Avoid walls and snakes!</p>
    </PartyStage>
  );
}
