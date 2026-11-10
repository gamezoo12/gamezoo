import { useSyncExternalStore } from 'react';
import { worldAPI } from './api';

const P = {
  none: 'none',
  dots: 'radial-gradient(rgba(255,255,255,.10) 1.2px, transparent 1.6px) 0 0/16px 16px',
  grid: 'linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px) 0 0/22px 22px',
  stripes: 'repeating-linear-gradient(45deg, rgba(255,255,255,.06) 0 10px, transparent 10px 22px)',
  pinstripe: 'repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 1px, transparent 1px 14px)',
  checker: 'conic-gradient(rgba(255,255,255,.06) 25%, transparent 0 50%, rgba(255,255,255,.06) 0 75%, transparent 0) 0 0/28px 28px',
  stars: 'radial-gradient(1.5px 1.5px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 20%, #fff, transparent), radial-gradient(1.2px 1.2px at 40% 80%, #fff, transparent), radial-gradient(1px 1px at 85% 65%, #fff, transparent), radial-gradient(1.4px 1.4px at 10% 75%, #fff, transparent)',
  waves: 'repeating-radial-gradient(circle at 50% 130%, rgba(255,255,255,.06) 0 6px, transparent 6px 18px)',
  carbon: 'repeating-linear-gradient(45deg, rgba(0,0,0,.25) 0 3px, transparent 3px 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,.04) 0 3px, transparent 3px 6px)',
  brushed: 'repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 1px, transparent 1px 3px)',
  wood: 'repeating-linear-gradient(95deg, rgba(0,0,0,.18) 0 2px, transparent 2px 9px, rgba(255,255,255,.04) 9px 11px, transparent 11px 19px)',
  felt: 'repeating-radial-gradient(circle at 30% 30%, rgba(255,255,255,.03) 0 1px, transparent 1px 3px)',
  snow: 'radial-gradient(2.5px 2.5px at 15% 20%, rgba(255,255,255,.7), transparent), radial-gradient(2px 2px at 60% 40%, rgba(255,255,255,.6), transparent), radial-gradient(3px 3px at 80% 15%, rgba(255,255,255,.6), transparent), radial-gradient(2px 2px at 35% 70%, rgba(255,255,255,.5), transparent), radial-gradient(2.5px 2.5px at 90% 80%, rgba(255,255,255,.6), transparent)',
  candy: 'repeating-linear-gradient(-45deg, rgba(255,255,255,.14) 0 12px, rgba(220,38,38,.18) 12px 24px)',
  aurora: 'linear-gradient(120deg, rgba(52,211,153,.18), transparent 40%, rgba(167,139,250,.18) 70%, transparent)',
  hex: 'radial-gradient(circle at 50% 0, rgba(255,255,255,.07) 30%, transparent 31%) 0 0/24px 21px, radial-gradient(circle at 50% 100%, rgba(255,255,255,.07) 30%, transparent 31%) 12px 10px/24px 21px',
  scan: 'repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 2px, transparent 2px 4px)',
  glass: 'linear-gradient(135deg, rgba(255,255,255,.14), rgba(255,255,255,.02) 55%)',
};

// [name, from, to, accent, pattern, radius, border, tilt]
const RAW = [
  ['Galaxy', '#1e1b4b', '#020617', '#a5b4fc', 'stars', 28, 'none', 10],
  ['Nebula', '#4c1d95', '#0f0326', '#f0abfc', 'stars', 32, 'neon', 8],
  ['Starlight Night', '#0c1445', '#01030f', '#fde68a', 'stars', 24, 'gold', 10],
  ['Cosmic Teal', '#134e4a', '#021412', '#5eead4', 'stars', 30, 'accent', 6],
  ['Supernova', '#7c2d12', '#1a0503', '#fdba74', 'waves', 36, 'neon', 12],
  ['Neon Grid', '#0f0a2a', '#04020d', '#22d3ee', 'grid', 18, 'neon', 14],
  ['Synthwave', '#581c87', '#1e0332', '#f472b6', 'grid', 22, 'neon', 16],
  ['Cyber Lime', '#14290a', '#030801', '#a3e635', 'hex', 16, 'neon', 10],
  ['Laser Pink', '#500724', '#14010a', '#fb7185', 'scan', 20, 'neon', 8],
  ['Electric Blue', '#0b2a6b', '#020617', '#38bdf8', 'pinstripe', 24, 'neon', 10],
  ['Forest Moss', '#14532d', '#03140a', '#86efac', 'felt', 26, 'accent', 8],
  ['Ocean Deep', '#0c4a6e', '#020c17', '#7dd3fc', 'waves', 34, 'none', 10],
  ['Coral Reef', '#9f1239', '#2a0410', '#fda4af', 'waves', 30, 'accent', 8],
  ['Desert Dune', '#78350f', '#1c0b02', '#fcd34d', 'waves', 28, 'gold', 6],
  ['Arctic Ice', '#164e63', '#03161c', '#cffafe', 'glass', 30, 'accent', 10],
  ['Royal Velvet', '#3b0764', '#12021f', '#e9d5ff', 'felt', 28, 'gold', 10],
  ['Gold Leaf', '#422006', '#0f0702', '#facc15', 'brushed', 22, 'gold', 8],
  ['Black Diamond', '#18181b', '#000000', '#e4e4e7', 'hex', 20, 'double', 10],
  ['Rose Gold', '#5b2333', '#1a0910', '#fecdd3', 'brushed', 30, 'gold', 8],
  ['Emerald Vault', '#064e3b', '#01140e', '#6ee7b7', 'checker', 22, 'gold', 10],
  ['Christmas Eve', '#7f1d1d', '#1c0505', '#fde047', 'snow', 28, 'gold', 10],
  ['Candy Cane', '#7f1d1d', '#2a0808', '#fecaca', 'candy', 30, 'double', 8],
  ['Snowfall', '#1e3a5f', '#06101c', '#e0f2fe', 'snow', 32, 'accent', 10],
  ['New Year Gold', '#1c1917', '#050403', '#fbbf24', 'stars', 26, 'gold', 12],
  ['Winter Pine', '#14532d', '#041a0d', '#fef08a', 'snow', 24, 'accent', 8],
  ['Arcade Cabinet', '#1e1b4b', '#050414', '#facc15', 'scan', 12, 'double', 6],
  ['Retro Checker', '#27272a', '#09090b', '#f87171', 'checker', 14, 'accent', 8],
  ['Pinball', '#4a044e', '#140116', '#fde047', 'dots', 40, 'neon', 14],
  ['Jukebox', '#7c2d12', '#1f0a04', '#fda4af', 'pinstripe', 44, 'gold', 8],
  ['VHS Sunset', '#831843', '#1e0b3a', '#fdba74', 'scan', 18, 'accent', 10],
  ['Carbon Fibre', '#262626', '#050505', '#f97316', 'carbon', 18, 'accent', 8],
  ['Brushed Steel', '#475569', '#0f172a', '#e2e8f0', 'brushed', 16, 'double', 6],
  ['Slate Board', '#1f2937', '#030712', '#cbd5e1', 'felt', 12, 'none', 4],
  ['Wood Table', '#78350f', '#2a1206', '#fde68a', 'wood', 20, 'gold', 8],
  ['Casino Felt', '#065f46', '#022c22', '#fde047', 'felt', 36, 'gold', 10],
  ['Lava Core', '#991b1b', '#1c0303', '#fb923c', 'waves', 30, 'neon', 10],
  ['Thunderstorm', '#312e81', '#070720', '#fef08a', 'stripes', 24, 'neon', 10],
  ['Toxic Glow', '#1a2e05', '#050a01', '#bef264', 'dots', 26, 'neon', 12],
  ['Frostbite', '#0e7490', '#031d24', '#ecfeff', 'hex', 28, 'accent', 8],
  ['Solar Flare', '#9a3412', '#260a03', '#fde047', 'aurora', 32, 'neon', 12],
  ['Bubblegum', '#9d174d', '#3a0820', '#fbcfe8', 'dots', 40, 'accent', 8],
  ['Lavender Mist', '#5b21b6', '#1e0b45', '#ddd6fe', 'glass', 34, 'none', 8],
  ['Mint Cream', '#0f766e', '#042f2c', '#ccfbf1', 'dots', 36, 'accent', 6],
  ['Peach Sorbet', '#c2410c', '#3b1204', '#fed7aa', 'glass', 38, 'none', 8],
  ['Cotton Candy', '#86198f', '#2b0730', '#bae6fd', 'aurora', 40, 'accent', 10],
  ['Midnight Minimal', '#0f172a', '#020617', '#94a3b8', 'none', 20, 'none', 4],
  ['Graphite', '#27272a', '#0a0a0a', '#a1a1aa', 'pinstripe', 14, 'accent', 0],
  ['Ink Blue', '#172554', '#030712', '#93c5fd', 'none', 24, 'accent', 6],
  ['Charcoal Glass', '#262626', '#0a0a0a', '#fafafa', 'glass', 26, 'double', 8],
  ['Northern Lights', '#052e2b', '#020617', '#a7f3d0', 'aurora', 30, 'neon', 10],
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const hexA = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

export const BOARD_STYLES = RAW.map(([name, from, to, accent, pattern, radius, border, tilt]) => ({
  id: slug(name), name, from, to, accent, glow: hexA(accent, 0.45), pattern: P[pattern], radius, border, tilt,
}));
const byId = Object.fromEntries(BOARD_STYLES.map((s) => [s.id, s]));
export const boardStyleById = (id) => byId[id];

export const GAME_TYPES = [
  ['memory', 'Memory games'], ['target', 'Aim & target games'], ['words', 'Word games'], ['math', 'Number & logic games'],
  ['reaction', 'Speed & reaction games'], ['party', 'Party games'], ['sweet', 'Match & sweet games'],
];
export const DEFAULT_BY_TYPE = { memory: 'royal-velvet', target: 'lava-core', words: 'forest-moss', math: 'neon-grid', reaction: 'thunderstorm', party: 'synthwave', sweet: 'bubblegum' };

export const borderShadow = (style, glow) => ({
  none: '', accent: `0 0 0 2px ${style.accent}`, double: `0 0 0 2px ${style.accent}, 0 0 0 6px rgba(0,0,0,.5), 0 0 0 8px ${style.accent}`,
  neon: `0 0 0 2px ${style.accent}, 0 0 24px ${glow}`, gold: '0 0 0 3px #d4a017, inset 0 0 0 1px rgba(255,236,170,.6)',
}[style.border] || '');

// Resolves the admin-chosen board style for a game type; null means classic look.
export function resolveBoardStyle(config, type) {
  if (!config || config.mode === 'classic') return null;
  if (config.mode === 'single') return byId[config.style_id] || null;
  return byId[(config.by_type || {})[type] || DEFAULT_BY_TYPE[type]] || null;
}

let current = null;
let loading = false;
const listeners = new Set();
export const setBoardStyleConfig = (cfg) => { current = cfg; listeners.forEach((l) => l()); };
const subscribe = (l) => {
  listeners.add(l);
  if (!current && !loading) {
    loading = true;
    worldAPI.boardStyle().then(setBoardStyleConfig).catch(() => setBoardStyleConfig({ mode: 'classic' }));
  }
  return () => listeners.delete(l);
};
export const useBoardStyleConfig = () => useSyncExternalStore(subscribe, () => current);
