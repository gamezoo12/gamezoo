import { drawStudioAPI } from '../../../lib/api';

// Splits a spoken line into caption-sized chunks (sentences, max ~110 chars each).
export function captionChunks(text) {
  const sentences = String(text || '').match(/[^.!?।؟]+[.!?।؟]*/g) || [];
  return sentences.flatMap((s) => {
    const words = s.trim().split(/\s+/);
    const out = [];
    let cur = '';
    words.forEach((w) => { if ((cur + ' ' + w).trim().length > 110) { out.push(cur); cur = w; } else cur = `${cur} ${w}`.trim(); });
    if (cur) out.push(cur);
    return out;
  }).filter(Boolean);
}

// Current caption for a subtitle cue { chunks, t0, dur }, timed by each chunk's share of the characters.
export function captionAt(cue, t = performance.now()) {
  if (!cue) return null;
  const sec = (t - cue.t0) / 1000;
  if (sec < 0 || sec > cue.dur + 0.8) return null;
  const total = cue.chunks.reduce((a, c) => a + c.length, 0) || 1;
  let acc = 0;
  for (const c of cue.chunks) { acc += c.length; if (sec <= (acc / total) * cue.dur) return c; }
  return cue.chunks[cue.chunks.length - 1] || null;
}

// Plays a commentary line host by host (duo banter alternates), publishing a caption cue for each.
export async function playSegments(segments, audio, onCaption, stillCurrent = () => true) {
  for (const seg of segments) {
    if (!stillCurrent()) return;
    const dur = (await audio?.speak(seg.audio)) || seg.text.length / 14;
    onCaption?.({ chunks: captionChunks(seg.text), t0: performance.now(), dur, host: seg.host, name: seg.name, action: seg.action, mood: seg.mood });
    await new Promise((r) => setTimeout(r, dur * 1000 + 150));
  }
}

// Fetches AI commentary lines ahead of time (they take a few seconds) and plays them on cue with captions.
export function createCommentator(enabled, mode, { override, onCaption } = {}) {
  const lines = new Map();
  let current = null;
  const prefetch = (key, payload) => {
    if (!enabled) return null;
    if (!lines.has(key)) {
      const ask = () => drawStudioAPI.commentary({ mode, ...payload, ...(override ? { override } : {}) });
      const p = ask().catch(() => ask()).catch(() => { lines.delete(key); return null; });
      lines.set(key, p);
    }
    return lines.get(key);
  };
  const say = async (key, payload, audio) => {
    const p = prefetch(key, payload);
    if (!p) return;
    current = key;
    const line = await p;
    if (!line || current !== key) return;
    try { await playSegments(line.segments, audio, onCaption, () => current === key); } catch { /* voice is optional */ }
  };
  return { enabled, prefetch, say, reset: () => { lines.clear(); current = null; onCaption?.(null); } };
}

export function roundFacts(contest, rounds, round, eligible) {
  const r = rounds[round] || {};
  return { contest_title: contest?.title || '', round_name: r.name || `Round ${round + 1}`, round_index: round, total_rounds: rounds.length,
    prize_amount: Number(r.prize_amount) || 0, num_winners: Number(r.num_winners) || 1, eligible,
    total_prize: rounds.reduce((a, x) => a + Number(x.prize_amount || 0) * Number(x.num_winners || 0), 0) };
}

export const winnerFacts = (list = []) => list.map((w) => ({ ticket_number: String(w.ticket_number ?? ''), display_name: w.display_name || '' }));
