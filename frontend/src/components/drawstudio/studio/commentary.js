import { drawStudioAPI } from '../../../lib/api';

// Fetches AI commentary lines ahead of time (they take a few seconds) and plays them on cue.
export function createCommentator(enabled, mode) {
  const lines = new Map();
  let current = null;
  const prefetch = (key, payload) => {
    if (!enabled) return null;
    if (!lines.has(key)) lines.set(key, drawStudioAPI.commentary({ mode, ...payload }).catch(() => null));
    return lines.get(key);
  };
  const say = async (key, payload, audio) => {
    const p = prefetch(key, payload);
    if (!p) return;
    current = key;
    const buf = await p;
    if (buf && current === key) audio?.speak(buf).catch(() => {});
  };
  return { enabled, prefetch, say, reset: () => { lines.clear(); current = null; } };
}

export function roundFacts(contest, rounds, round, eligible) {
  const r = rounds[round] || {};
  return { contest_title: contest?.title || '', round_name: r.name || `Round ${round + 1}`, round_index: round, total_rounds: rounds.length,
    prize_amount: Number(r.prize_amount) || 0, num_winners: Number(r.num_winners) || 1, eligible,
    total_prize: rounds.reduce((a, x) => a + Number(x.prize_amount || 0) * Number(x.num_winners || 0), 0) };
}

export const winnerFacts = (list = []) => list.map((w) => ({ ticket_number: String(w.ticket_number ?? ''), display_name: w.display_name || '' }));
