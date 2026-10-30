import { drawStudioAPI } from '../../lib/api';

export const SOUND_SLOTS = ['entry', 'music', 'heartbeat', 'countdown', 'drumroll', 'reveal', 'announcement', 'celebration'];
export const DEFAULT_VOLUMES = { entry: 0.5, music: 0.45, heartbeat: 0.9, countdown: 0.9, drumroll: 0.7, reveal: 1, announcement: 1, celebration: 0.8 };

// Built-in fallback tones (used only for slots without an uploaded file).
function synth(ctx, slot) {
  const sr = ctx.sampleRate;
  const len = { entry: 0.09, countdown: 0.35, heartbeat: 0.9, music: 8, drumroll: 2.5, reveal: 2.2, announcement: 2.4, celebration: 3 }[slot];
  const buf = ctx.createBuffer(1, Math.floor(sr * len), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) {
    const t = i / sr;
    let v = 0;
    if (slot === 'entry') v = (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.6 + Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 80) * 0.2;
    if (slot === 'announcement') v = [392, 523.3, 659.3, 784].reduce((a, f, k) => a + (t > k * 0.18 ? Math.sin(2 * Math.PI * f * t) * (Math.sin(2 * Math.PI * f * 2 * t) * 0.3 + 1) * Math.exp(-(t - k * 0.18) * 1.6) : 0), 0) * 0.16;
    if (slot === 'countdown') v = Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 9);
    if (slot === 'heartbeat') v = [0, 0.28].reduce((a, s) => a + (t > s ? Math.sin(2 * Math.PI * 55 * (t - s)) * Math.exp(-(t - s) * 14) : 0), 0);
    if (slot === 'music') v = [110, 164.8, 220, 277.2].reduce((a, f, k) => a + Math.sin(2 * Math.PI * f * t + k) * (0.5 + 0.5 * Math.sin(t * 0.8 + k)), 0) * 0.12;
    if (slot === 'drumroll') v = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 22 * t)) * Math.min(1, t / 2) * 0.5;
    if (slot === 'reveal') v = [523.3, 659.3, 784, 1046.5].reduce((a, f) => a + Math.sin(2 * Math.PI * f * t), 0) * Math.exp(-t * 1.4) * 0.22;
    if (slot === 'celebration') v = Math.sin(2 * Math.PI * [523, 659, 784, 1046, 1318][Math.floor(t * 6) % 5] * t) * Math.exp(-(t % (1 / 6)) * 8) * 0.3;
    d[i] = v;
  }
  return buf;
}

export class DrawAudio {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.stream = this.ctx.createMediaStreamDestination();
    this.master.connect(this.ctx.destination);
    this.master.connect(this.stream);
    this.buffers = {};
    this.sources = {};
    this.custom = {};
    this.volumes = { ...DEFAULT_VOLUMES };
  }

  setVolumes(v) { this.volumes = { ...DEFAULT_VOLUMES, ...(v || {}) }; Object.entries(this.sources).forEach(([k, s]) => { s.gain.gain.value = s.base * this.volumes[k]; }); }

  async load(uploadedSlots = []) {
    await Promise.all(SOUND_SLOTS.map(async (slot) => {
      if (uploadedSlots.includes(slot)) {
        try {
          const blob = await drawStudioAPI.audioBlob(slot);
          this.buffers[slot] = await this.ctx.decodeAudioData(await blob.arrayBuffer());
          this.custom[slot] = true;
          return;
        } catch { /* fall back to tone */ }
      }
      this.buffers[slot] = synth(this.ctx, slot);
      this.custom[slot] = false;
    }));
  }

  play(slot, { loop = false, rate = 1, volume = 1, overlap = false } = {}) {
    if (!this.buffers[slot]) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!overlap) this.stop(slot);
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = volume * (this.volumes[slot] ?? 1);
    src.buffer = this.buffers[slot];
    src.loop = loop;
    src.playbackRate.value = rate;
    src.connect(gain).connect(this.master);
    src.start();
    if (!overlap) this.sources[slot] = { src, gain, base: volume };
  }

  setRate(slot, rate) { if (this.sources[slot]) this.sources[slot].src.playbackRate.value = rate; }

  stop(slot) {
    const s = this.sources[slot];
    if (s) { try { s.src.stop(); } catch { /* already stopped */ } delete this.sources[slot]; }
  }

  stopAll() { Object.keys(this.sources).forEach((k) => this.stop(k)); }

  close() { this.stopAll(); this.ctx.close(); }
}
