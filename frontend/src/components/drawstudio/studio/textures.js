import * as THREE from 'three';

export const FONTS = {
  title: '/fonts/cinzel-900.woff',
  num: '/fonts/oswald-700.woff',
  bold: '/fonts/montserrat-800.woff',
  semi: '/fonts/montserrat-600.woff',
};
export const COLS = 16;
export const ROWS = 32;
const CELL_W = 128;
const CELL_H = 64;
export const TIERS = [
  { name: 'gold', a: '#fff3b0', b: '#f5b301', c: '#8a5a00', glow: '#ffcf3a' },
  { name: 'silver', a: '#f4f7ff', b: '#9fb4d9', c: '#3c4d74', glow: '#bcd3ff' },
  { name: 'bronze', a: '#ffd6b0', b: '#d8742c', c: '#6b2f08', glow: '#ff9a4a' },
];
export const tierOf = (roundIndex) => TIERS[Math.min(roundIndex, 2)];

let fontsReady;
export function loadCanvasFonts() {
  if (!fontsReady) {
    fontsReady = Promise.all([['PLNum', FONTS.num], ['PLTitle', FONTS.title], ['PLBold', FONTS.bold]].map(async ([family, url]) => {
      try { const f = new FontFace(family, `url(${url})`); await f.load(); document.fonts.add(f); } catch { /* system fallback */ }
    }));
  }
  return fontsReady;
}

export const pad = (n) => String(n).padStart(4, '0');

export function makeAtlas(numbers) {
  const c = document.createElement('canvas');
  c.width = COLS * CELL_W;
  c.height = ROWS * CELL_H;
  const g = c.getContext('2d');
  numbers.forEach((n, i) => {
    const x = (i % COLS) * CELL_W;
    const y = Math.floor(i / COLS) * CELL_H;
    const grad = g.createLinearGradient(x, y, x + CELL_W, y + CELL_H);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#e9e4f5');
    g.fillStyle = grad;
    g.fillRect(x + 2, y + 2, CELL_W - 4, CELL_H - 4);
    g.strokeStyle = 'rgba(40,20,90,0.55)';
    g.setLineDash([5, 4]);
    g.lineWidth = 2;
    g.strokeRect(x + 7, y + 7, CELL_W - 14, CELL_H - 14);
    g.setLineDash([]);
    g.fillStyle = '#1d1450';
    g.font = '700 34px PLNum, Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(pad(n), x + CELL_W / 2, y + CELL_H / 2 + 2);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeWinnerTicket(number, roundIndex) {
  const t = tierOf(roundIndex);
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 1024, 512);
  grad.addColorStop(0, t.a);
  grad.addColorStop(0.55, t.b);
  grad.addColorStop(1, t.c);
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(8, 8, 1008, 496, 48);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 10;
  g.setLineDash([22, 14]);
  g.strokeRect(46, 46, 932, 420);
  g.setLineDash([]);
  g.fillStyle = 'rgba(30,10,60,0.9)';
  g.font = '900 54px PLTitle, Georgia, serif';
  g.textAlign = 'center';
  g.fillText('PRIZE LEAGUE', 512, 130);
  g.font = '700 230px PLNum, Impact, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(`#${pad(number)}`, 512, 300);
  g.font = '800 34px PLBold, sans-serif';
  g.fillText('WINNING TICKET', 512, 440);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeCard(roundIndex) {
  const t = tierOf(roundIndex);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 640;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 640);
  grad.addColorStop(0, t.c);
  grad.addColorStop(0.45, '#140b38');
  grad.addColorStop(1, '#07041a');
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(6, 6, 500, 628, 36);
  g.fill();
  const edge = g.createLinearGradient(0, 0, 512, 640);
  edge.addColorStop(0, t.a);
  edge.addColorStop(0.5, t.b);
  edge.addColorStop(1, t.a);
  g.strokeStyle = edge;
  g.lineWidth = 10;
  g.stroke();
  g.fillStyle = edge;
  g.beginPath();
  g.roundRect(40, 470, 432, 130, 22);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makePanel(color = '#ffcf3a') {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, 'rgba(32,18,92,0.92)');
  grad.addColorStop(1, 'rgba(8,5,30,0.95)');
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(6, 6, 1012, 500, 40);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 8;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 2;
  g.strokeRect(28, 28, 968, 456);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeSlide(item, image) {
  const c = document.createElement('canvas');
  c.width = 1792;
  c.height = 800;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 1792, 800);
  bg.addColorStop(0, '#1a0b4d');
  bg.addColorStop(1, '#3a0f6b');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1792, 800);
  if (image) {
    const s = Math.max(1000 / image.width, 800 / image.height);
    g.drawImage(image, 1792 - image.width * s, (800 - image.height * s) / 2, image.width * s, image.height * s);
    const fade = g.createLinearGradient(700, 0, 1200, 0);
    fade.addColorStop(0, '#1a0b4d');
    fade.addColorStop(1, 'rgba(26,11,77,0)');
    g.fillStyle = fade;
    g.fillRect(700, 0, 520, 800);
  }
  g.fillStyle = item.kind === 'offer' ? '#34d399' : '#ff4f8b';
  g.beginPath();
  g.roundRect(110, 150, 300, 64, 32);
  g.fill();
  g.fillStyle = '#fff';
  g.font = '800 34px PLBold, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(item.kind === 'offer' ? 'SPECIAL OFFER' : 'LIVE CONTEST', 140, 183);
  g.font = '700 150px PLNum, Impact, sans-serif';
  g.fillStyle = '#ffd54a';
  g.fillText(item.headline || '', 110, 340);
  g.font = '800 52px PLBold, sans-serif';
  g.fillStyle = '#ffffff';
  (item.title || '').slice(0, 64).match(/.{1,30}(\s|$)/g)?.slice(0, 2).forEach((line, i) => g.fillText(line.trim(), 110, 480 + i * 66));
  g.font = '600 36px PLBold, sans-serif';
  g.fillStyle = '#c9b8ff';
  g.fillText((item.subtitle || '').slice(0, 60), 110, 650);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
