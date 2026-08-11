const BACKEND_ORIGIN = String(
  process.env.REACT_APP_BACKEND_URL || ''
).replace(/\/+$/, '');

export const FALLBACK_CONTEST_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 800">
      <rect width="1600" height="800" fill="#111128"/>
      <text
        x="50%"
        y="50%"
        text-anchor="middle"
        dominant-baseline="middle"
        fill="#FFD54A"
        font-family="Arial, sans-serif"
        font-size="72"
        font-weight="700"
      >
        Prize League
      </text>
    </svg>
  `);

export function resolveMediaUrl(value) {
  const raw = String(value || '').trim();

  if (!raw) return FALLBACK_CONTEST_IMAGE;

  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:')
  ) {
    return raw;
  }

  const path = raw.startsWith('/') ? raw : `/${raw}`;

  return BACKEND_ORIGIN
    ? `${BACKEND_ORIGIN}${path}`
    : path;
}

export function useFallbackImage(event) {
  const image = event.currentTarget;

  if (image.src !== FALLBACK_CONTEST_IMAGE) {
    image.src = FALLBACK_CONTEST_IMAGE;
  }
}
