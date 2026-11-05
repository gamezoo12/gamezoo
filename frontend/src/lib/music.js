// Background music: one CC0 loop per theme world, with its own on/off switch.
const KEY = 'pl-game-music-enabled';
const BASE = `${process.env.PUBLIC_URL || ''}/sounds/music/`;
const VOL = 0.22;
let el = null; let cur = -1; let want = -1; let fade = null;

export const musicEnabled = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
export const worldOfLevel = (lv) => Math.floor((Math.max(1, Number(lv) || 1) - 1) / 5) % 8;

const ramp = (to, done) => { clearInterval(fade); if (!el) return; const a = el; fade = setInterval(() => { const v = a.volume + (to > a.volume ? 0.02 : -0.03); if ((to > a.volume && v >= to) || (to <= a.volume && v <= to)) { a.volume = Math.max(0, Math.min(1, to)); clearInterval(fade); done?.(); } else a.volume = Math.max(0, Math.min(1, v)); }, 60); };
const retryOnTap = () => { const go = () => { if (el && want >= 0) el.play().catch(() => {}); window.removeEventListener('pointerdown', go, true); }; window.addEventListener('pointerdown', go, true); };

export function startMusic(world) {
  want = world % 8;
  if (!musicEnabled()) return;
  if (el && cur === want) { el.play().catch(retryOnTap); ramp(VOL); return; }
  if (el) el.pause();
  el = new Audio(`${BASE}world${want}.mp3`); el.loop = true; el.volume = 0; el.setAttribute('playsinline', ''); cur = want;
  el.play().catch(retryOnTap); ramp(VOL);
}
export function stopMusic() { want = -1; if (!el) return; const a = el; ramp(0, () => { if (want < 0) a.pause(); }); setTimeout(() => { if (want < 0) a.pause(); }, 700); }
export function setMusicEnabled(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event('pl-game-music-change'));
  if (!on) { clearInterval(fade); if (el) el.pause(); } else if (want >= 0) startMusic(want);
}
