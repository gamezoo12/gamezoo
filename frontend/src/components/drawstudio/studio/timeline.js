export const now = () => performance.now();
export const elapsed = (s) => (now() - (s.t0 || now())) / 1000;

// Draw stage: each winner gets `reveal_duration_s`; numbers cycle until 72% then the fixed winner emerges.
export function drawPhase(s) {
  if (!s.winners?.length || !s.drawT0) return { w: 0, local: 0, waiting: true, done: false };
  const D = Math.max(1, s.cfg.reveal_duration_s);
  const t = (now() - s.drawT0) / 1000;
  const w = Math.min(s.winners.length - 1, Math.floor(t / D));
  return { w, local: Math.min(1, (t - w * D) / D), done: t >= D * s.winners.length, waiting: false };
}

export const STAGE_CAPTION = {
  ready: 'GET READY',
  loading: 'TICKETS ENTERING THE POOL',
  loaded: 'ALL TICKETS ARE IN THE POOL',
  mixing: 'SHUFFLING TICKETS',
  mixed: 'TICKETS SHUFFLED · READY TO DRAW',
  drawing: 'DRAWING THE WINNING TICKET',
  drawn: 'WINNING TICKET DRAWN',
  revealed: 'CONGRATULATIONS',
  complete: 'DRAW COMPLETE',
};

export const REWARD_LABEL = { winnings: 'Winnings Tokens', bonus: 'Bonus Tokens' };
export const gbp = (v) => `£${Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function eligibleFor(roundIndex, rounds, outcomes, tickets) {
  if (rounds[roundIndex]?.allow_previous_winners) return tickets;
  const won = new Set(outcomes.slice(0, roundIndex).flatMap((o) => (o || []).map((w) => w.ticket_number)));
  return tickets.filter((t) => !won.has(t.ticket_number));
}

export function simulateWinners(pool, count) {
  const copy = [...pool];
  const out = [];
  const buf = new Uint32Array(1);
  for (let i = 0; i < Math.min(count, copy.length); i += 1) {
    crypto.getRandomValues(buf);
    out.push(copy.splice(buf[0] % copy.length, 1)[0]);
  }
  return out;
}

export function sampleNumbers(pool, max = 420) {
  if (pool.length <= max) return pool.map((t) => t.ticket_number);
  const step = pool.length / max;
  return Array.from({ length: max }, (_, i) => pool[Math.floor(i * step)].ticket_number);
}
