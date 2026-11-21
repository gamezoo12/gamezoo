import { referralAPI } from './api';
import { BRAND } from './brand';

const referralRequests = new Map();
const SHARE_IMAGE_WIDTH = 3840;
const SHARE_IMAGE_HEIGHT = 2160;
const SHARE_LAYOUT_WIDTH = 1920;
const SHARE_LAYOUT_HEIGHT = 1080;

export function sharedUrl(path, referralCode) {
  const url = new URL(path || '/', window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('Share links must stay on this site.');
  if (referralCode) url.searchParams.set('ref', referralCode);
  return url.toString();
}

export async function referralCodeFor(user) {
  if (!user?.user_id) return '';
  if (user.referral_code) return user.referral_code;
  if (!referralRequests.has(user.user_id)) {
    const request = referralAPI.me().then((data) => {
      if (!data?.code) throw new Error('Referral link unavailable');
      return data.code;
    }).catch((error) => { referralRequests.delete(user.user_id); throw error; });
    referralRequests.set(user.user_id, request);
  }
  return referralRequests.get(user.user_id);
}

function loadImage(src) {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function roundedRect(context, x, y, width, height, radius, fill, stroke) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 1;
    context.stroke();
  }
}

function drawCover(context, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, 24);
  context.clip();
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  context.restore();
}

function fitFont(context, text, maxWidth, startingSize, weight = 700) {
  let size = startingSize;
  do {
    context.font = `${weight} ${size}px Arial, sans-serif`;
    if (context.measureText(String(text || '')).width <= maxWidth || size <= 14) return size;
    size -= 2;
  } while (size > 14);
  return size;
}

function drawShareImage({ context, logo, image, title, subtitle, rows }) {
  const width = SHARE_LAYOUT_WIDTH;
  const height = SHARE_LAYOUT_HEIGHT;
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#07041a');
  background.addColorStop(0.55, '#15103b');
  background.addColorStop(1, '#08051f');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width * 0.84, height * 0.12, 0, width * 0.84, height * 0.12, width * 0.55);
  glow.addColorStop(0, 'rgba(255,213,74,0.12)');
  glow.addColorStop(1, 'rgba(255,213,74,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  roundedRect(context, 34, 30, width - 68, 128, 24, 'rgba(9,6,35,0.88)', 'rgba(255,255,255,0.12)');
  if (logo) context.drawImage(logo, 66, 45, 80, 96);
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.font = '900 35px Arial, sans-serif';
  context.fillStyle = BRAND.gold;
  context.fillText('PRIZE', 164, 83);
  context.fillStyle = '#ffffff';
  context.fillText('LEAGUE', 164 + context.measureText('PRIZE ').width, 83);
  context.font = '600 19px Arial, sans-serif';
  context.fillStyle = '#c9c4e7';
  context.fillText('OFFICIAL RESULTS', 164, 123);

  context.textAlign = 'right';
  context.font = '700 17px Arial, sans-serif';
  context.fillStyle = '#c9c4e7';
  context.fillText('OFFICIAL', width - 66, 94);

  const titleText = String(title || 'Prize League');
  fitFont(context, titleText, width - 132, 45, 800);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#ffffff';
  context.fillText(titleText, 66, 224, width - 132);
  if (subtitle) {
    context.font = '500 22px Arial, sans-serif';
    context.fillStyle = '#c9c4e7';
    context.fillText(String(subtitle), 68, 265, width - 136);
  }

  if (rows.length) {
    const tableX = 52;
    const tableY = 298;
    const tableWidth = width - 104;
    const headerHeight = 48;
    const rowHeight = Math.min(88, Math.floor((height - tableY - headerHeight - 42) / Math.max(rows.length, 1)));
    roundedRect(context, tableX, tableY, tableWidth, headerHeight + rowHeight * rows.length + 2, 20, 'rgba(15,11,45,0.92)', 'rgba(255,255,255,0.13)');
    roundedRect(context, tableX + 1, tableY + 1, tableWidth - 2, headerHeight, 19, 'rgba(255,255,255,0.06)');
    context.font = '800 16px Arial, sans-serif';
    context.fillStyle = BRAND.gold;
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.fillText('RANK', tableX + 24, tableY + headerHeight / 2);
    context.fillText('PLAYER', tableX + 118, tableY + headerHeight / 2);
    context.textAlign = 'right';
    context.fillText('RESULT', tableX + tableWidth - 28, tableY + headerHeight / 2);

    rows.forEach((row, index) => {
      const y = tableY + headerHeight + index * rowHeight;
      if (index % 2 === 0) roundedRect(context, tableX + 4, y, tableWidth - 8, rowHeight, 8, 'rgba(255,255,255,0.035)');
      const rank = row && typeof row === 'object' ? row.rank ?? index + 1 : index + 1;
      const name = row && typeof row === 'object' ? row.name ?? row.user_name ?? row.player ?? 'Player' : String(row);
      const detail = row && typeof row === 'object' ? row.detail ?? row.details ?? '' : '';
      const result = row && typeof row === 'object' ? row.result ?? row.prize ?? row.time ?? '' : '';
      context.textAlign = 'left';
      context.font = `900 ${Math.min(20, rowHeight * 0.52)}px Arial, sans-serif`;
      context.fillStyle = Number(rank) <= 5 ? BRAND.gold : '#e5e2f4';
      context.fillText(`#${rank}`, tableX + 24, y + rowHeight / 2, 76);
      context.font = `700 ${Math.min(19, rowHeight * 0.48)}px Arial, sans-serif`;
      context.fillStyle = '#ffffff';
      context.fillText(String(name), tableX + 118, y + rowHeight / 2, tableWidth * 0.45);
      if (detail) {
        context.font = `500 ${Math.min(14, rowHeight * 0.34)}px Arial, sans-serif`;
        context.fillStyle = '#bdb8d9';
        context.fillText(String(detail), tableX + tableWidth * 0.54, y + rowHeight / 2, tableWidth * 0.25);
      }
      if (result) {
        context.textAlign = 'right';
        context.font = `800 ${Math.min(18, rowHeight * 0.45)}px Arial, sans-serif`;
        context.fillStyle = BRAND.gold;
        context.fillText(String(result), tableX + tableWidth - 28, y + rowHeight / 2, tableWidth * 0.2);
      }
      context.textAlign = 'left';
    });
  } else {
    roundedRect(context, 52, 310, width - 104, 650, 22, 'rgba(15,11,45,0.88)', 'rgba(255,255,255,0.13)');
    if (image) drawCover(context, image, 72, 330, width - 144, 610);
    else {
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = '900 54px Arial, sans-serif';
      context.fillStyle = BRAND.gold;
      context.fillText(titleText, width / 2, height / 2, width - 200);
    }
  }

  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.font = '600 15px Arial, sans-serif';
  context.fillStyle = 'rgba(220,216,240,0.68)';
  context.fillText('Shared with Prize League', 66, height - 32);
  context.textAlign = 'right';
  context.fillText(`${rows.length ? 'OFFICIAL STANDINGS' : 'PRIZE LEAGUE'}`, width - 66, height - 32);
}

export async function fetchShareImage(imageUrl) {
  const response = await fetch(imageUrl, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error('Contest image is unavailable for sharing.');
  const blob = await response.blob();
  if (!blob || !blob.type.startsWith('image/')) throw new Error('Contest image is unavailable for sharing.');
  return blob;
}

export async function renderShareImages({ title, subtitle, imageUrl, rows = [], maxRows }) {
  const visibleRows = rows.slice(0, Number.isInteger(maxRows) ? maxRows : 20);
  const [logo, image] = await Promise.all([loadImage(BRAND.logoUrl), loadImage(imageUrl)]);
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_IMAGE_WIDTH;
  canvas.height = SHARE_IMAGE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image creation is unavailable.');
  context.scale(2, 2);
  drawShareImage({ context, logo, image, title, subtitle, rows: visibleRows });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create the share image.');
  return [blob];
}

export function downloadShareImage(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}