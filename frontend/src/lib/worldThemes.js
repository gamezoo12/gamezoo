import './worldTheme.css';

const HUES = [
  ['Royal Purple', 266], ['Indigo', 240], ['Ocean Blue', 215], ['Sky', 199], ['Teal', 174],
  ['Mint', 160], ['Emerald', 145], ['Forest', 125], ['Lime', 88], ['Gold', 45],
  ['Amber', 35], ['Sunset', 22], ['Coral', 10], ['Cherry', 355], ['Ruby', 342],
  ['Rose', 330], ['Magenta', 305], ['Orchid', 285], ['Slate', 215, 25], ['Mocha', 25, 35],
];
const STYLES = ['Classic', 'Deep', 'Pastel', 'Neon', 'Midnight'];
const hsl = (h, s, l) => `hsl(${h} ${s}% ${l}%)`;

function build(name, h, satCap, style) {
  const s = (v) => Math.min(v, satCap ?? 100);
  if (style === 'Midnight') {
    return { accent: hsl(h, s(80), 66), accentStrong: hsl(h, s(70), 52), accentSoft: hsl(h, s(35), 22),
      ink: '#f1f5f9', muted: hsl(h, 15, 72), card: hsl(h, s(30), 11), soft: hsl(h, s(28), 16), line: hsl(h, s(22), 28) };
  }
  const a = { Classic: [70, 46], Deep: [75, 32], Pastel: [55, 56], Neon: [95, 50] }[style];
  const tint = style === 'Pastel' ? 94 : 97;
  return { accent: hsl(h, s(a[0]), a[1]), accentStrong: hsl(h, s(a[0]), a[1] - 10), accentSoft: hsl(h, s(80), 94),
    ink: hsl(h, s(45), 10), muted: hsl(h, 12, 34), card: style === 'Pastel' ? hsl(h, s(60), 99) : '#ffffff',
    soft: hsl(h, s(70), tint), line: hsl(h, s(45), 86) };
}

export const DEFAULT_THEME_ID = 'royal-purple-classic';
const DEFAULT_COLOURS = { accent: '#6724c7', accentStrong: '#5620bd', accentSoft: '#f1edff', ink: '#071226',
  muted: '#39465a', card: '#ffffff', soft: '#fbf9ff', line: '#d8c8fa' };

export const WORLD_THEMES = HUES.flatMap(([name, h, cap]) => STYLES.map((style) => {
  const id = `${name}-${style}`.toLowerCase().replace(/\s+/g, '-');
  return { id, name: `${name} ${style}`, dark: style === 'Midnight',
    colours: id === DEFAULT_THEME_ID ? DEFAULT_COLOURS : build(name, h, cap, style) };
}));

export const themeById = (id) => WORLD_THEMES.find((t) => t.id === id) || WORLD_THEMES.find((t) => t.id === DEFAULT_THEME_ID);

const luminance = (colour) => {
  let r; let g; let b;
  const m = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(colour);
  if (m) {
    const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
    const f = (n) => { const k = (n + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    [r, g, b] = [f(0), f(8), f(4)];
  } else {
    [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16) / 255);
  }
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
// White text unless it would fall below ~3:1 contrast on the accent.
const onAccent = (accent) => (1.05 / (luminance(accent) + 0.05) >= 3 ? '#ffffff' : '#0b1220');

export const themeVars = (theme) => {
  const c = theme.colours;
  return { '--fw-accent': c.accent, '--fw-accent-strong': c.accentStrong, '--fw-accent-soft': c.accentSoft,
    '--fw-ink': c.ink, '--fw-muted': c.muted, '--fw-card': c.card, '--fw-soft': c.soft, '--fw-line': c.line,
    '--fw-on-accent': onAccent(c.accent) };
};

export function applyWorldTheme(id) {
  const vars = themeVars(themeById(id));
  Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  try { localStorage.setItem('pl_world_theme', id); } catch { /* storage unavailable */ }
}

export const cachedWorldThemeId = () => { try { return localStorage.getItem('pl_world_theme') || DEFAULT_THEME_ID; } catch { return DEFAULT_THEME_ID; } };
