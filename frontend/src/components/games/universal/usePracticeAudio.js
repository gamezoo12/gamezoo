import { useCallback, useEffect, useRef, useState } from 'react';

// Practice-only audio preferences. Does not overwrite the existing Profile Preferences
// contract or make any server-side settings changes.
const KEY = 'pl_universal_practice_audio_v1';
const DEFAULT = { muted: true, effectsVolume: 35 };
const clamp = n => Math.max(0, Math.min(100, Number(n) || 0));
function readSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    return { muted: typeof saved?.muted === 'boolean' ? saved.muted : DEFAULT.muted,
      effectsVolume: clamp(saved?.effectsVolume ?? DEFAULT.effectsVolume) };
  } catch (_) { return DEFAULT; }
}
export function usePracticeAudio() {
  const [settings, setSettings] = useState(readSettings);
  const contextRef = useRef(null);
  useEffect(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify(settings)); } catch (_) { /* storage blocked */ }
  }, [settings]);
  useEffect(() => () => {
    const ctx = contextRef.current;
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
  }, []);
  const setMuted = useCallback(muted => setSettings(s => ({ ...s, muted: Boolean(muted) })), []);
  const setEffectsVolume = useCallback(effectsVolume => setSettings(s => ({ ...s, effectsVolume: clamp(effectsVolume) })), []);
  const playEffect = useCallback((kind = 'tap') => {
    if (settings.muted || !settings.effectsVolume) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = contextRef.current || new AudioContext();
      contextRef.current = ctx;
      if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      const now = ctx.currentTime;
      const duration = kind === 'win' ? 0.25 : kind === 'error' ? 0.16 : 0.065;
      oscillator.type = kind === 'error' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(kind === 'win' ? 660 : kind === 'error' ? 180 : 430, now);
      if (kind === 'win') oscillator.frequency.linearRampToValueAtTime(880, now + duration);
      gain.gain.setValueAtTime(Math.min(0.12, settings.effectsVolume / 100 * 0.12), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.start(now); oscillator.stop(now + duration);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch (_) { /* sound must never interrupt gameplay */ }
  }, [settings]);
  return { ...settings, setMuted, setEffectsVolume, playEffect };
}
export const PRACTICE_AUDIO_STORAGE_KEY = KEY;
