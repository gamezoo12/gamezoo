export const gbp = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);

/**
 * Token formatter. 1 token = £1.
 * Accepts either an integer token count, or a float wallet balance (which
 * is numerically equal since 1:1). Always renders as a whole-number pill.
 *
 *   tokens(5)   → "5 tokens"
 *   tokens(1)   → "1 token"
 *   tokens(0)   → "0 tokens"
 *   tokens(12.5) → "13 tokens" (rounded — real balances are always whole)
 */
export const tokens = (n) => {
  const v = Math.round(Number(n) || 0);
  return `${v} ${v === 1 ? 'token' : 'tokens'}`;
};

/** Compact token count (no unit label) — for tight UI spots like the header. */
export const tokenCount = (n) => Math.round(Number(n) || 0);

export const percent = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 100));

export function countdown(iso) {
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  const secs = Math.floor((diff / 1000) % 60);
  return { days, hours, mins, secs, total: diff };
}
