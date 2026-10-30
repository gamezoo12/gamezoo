import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Download, Maximize2, Pause, Play, RotateCcw, Square, X } from 'lucide-react';
import { buildTimeline, makeParticles, paint, phaseOf } from './drawEngine';

const CONFETTI = ['#FFD54A', '#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fff'];

function pickMime() {
  const options = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return options.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

const btn = 'inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 text-xs font-bold text-white backdrop-blur transition-colors hover:bg-white/20 disabled:opacity-40';

/* Renders a supplied draw result. `show` = { mode, title, poolCount, poolNumbers, rounds:[{..., winners}] } */
export function DrawStage({ show, audio, onClose, onFinished }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const stateRef = useRef({ t: 0, last: 0, paused: false, fired: new Set(), confetti: [], spin: 0, cycle: 1, nextCycle: 0 });
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const [recording, setRecording] = useState(false);
  const [video, setVideo] = useState(null);
  const recorderRef = useRef(null);
  const finishRef = useRef(onFinished);
  finishRef.current = onFinished;
  const timeline = useMemo(() => buildTimeline(show.rounds), [show]);
  const particles = useMemo(() => makeParticles(show.poolCount), [show.poolCount]);
  const decoys = useMemo(() => {
    const winners = new Set(show.rounds.flatMap((r) => r.winners.map((w) => w.ticket_number)));
    const pool = show.poolNumbers.filter((n) => !winners.has(n));
    return pool.length ? pool : show.poolNumbers;
  }, [show]);

  const cue = useCallback((key, fn) => {
    const s = stateRef.current;
    if (!s.fired.has(key)) { s.fired.add(key); fn(); }
  }, []);

  const audioFor = useCallback((seg, phase) => {
    const id = `${seg.r}-${seg.w}-${seg.kind}`;
    if (seg.kind === 'intro') cue(`music-${seg.r}`, () => audio?.play('music', { loop: true, volume: 0.45 }));
    if (phase.name === 'countdown') cue(`cd-${id}-${Math.floor(phase.local * 3)}`, () => audio?.play('countdown'));
    if (phase.name === 'swirl') {
      cue(`hb-${id}`, () => audio?.play('heartbeat', { loop: true, volume: 0.9 }));
      audio?.setRate('heartbeat', 1 + phase.local * 0.7);
    }
    if (phase.name === 'slowdown') cue(`dr-${id}`, () => { audio?.play('drumroll', { loop: true, volume: 0.7 }); });
    if (phase.name === 'reveal') cue(`rv-${id}`, () => {
      audio?.stop('heartbeat'); audio?.stop('drumroll'); audio?.play('reveal'); audio?.play('celebration', { volume: 0.8 });
      const W = canvasRef.current.width;
      for (let i = 0; i < 260; i += 1) {
        stateRef.current.confetti.push({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: canvasRef.current.height * 0.4,
          vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 18 - 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
          w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, color: CONFETTI[i % CONFETTI.length] });
      }
    });
    if (seg.kind === 'outro') cue('outro', () => { audio?.stop('music'); audio?.play('celebration', { volume: 0.6 }); });
  }, [audio, cue]);

  useEffect(() => {
    let raf;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const rect = wrapRef.current.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    };
    resize();
    window.addEventListener('resize', resize);
    const frame = (now) => {
      const s = stateRef.current;
      const dt = s.last ? Math.min(60, now - s.last) : 16;
      s.last = now;
      if (!s.paused) s.t = Math.min(timeline.total, s.t + dt);
      const seg = timeline.segments.find((x) => s.t >= x.start && s.t < x.end) || timeline.segments[timeline.segments.length - 1];
      const phase = phaseOf(seg, s.t);
      const speed = { intro: 0.6, countdown: 0.8, swirl: 2.2 + phase.local * 3.5, slowdown: 5.5 * (1 - phase.local) ** 2 + 0.15, reveal: 0.25, outro: 0.4 }[phase.name] || 0.5;
      if (!s.paused) {
        s.spin += (speed * dt) / 1000;
        const reveals = Math.max(1, show.rounds[seg.r]?.reveals || 1);
        const interval = phase.name === 'swirl' ? 55 : phase.name === 'slowdown' ? ((seg.end - seg.start) * 0.25) / reveals : 99999;
        if (s.t >= s.nextCycle || (phase.name === 'slowdown' && s.nextCycle - s.t > interval)) {
          s.cycle = decoys[Math.floor(Math.random() * decoys.length)];
          s.nextCycle = s.t + interval;
        }
        s.confetti = s.confetti.filter((c) => c.y < canvas.height + 40);
        s.confetti.forEach((c) => { c.x += c.vx; c.y += c.vy; c.vy += 0.45; c.vx *= 0.99; c.rot += c.vr; });
        audioFor(seg, phase);
      }
      paint(ctx, canvas.width, canvas.height, { t: s.t, seg, phase, show, particles, confetti: s.confetti, spin: s.spin, cycleNumber: s.cycle });
      if (s.t >= timeline.total && !s.finished) { s.finished = true; setDone(true); finishRef.current?.(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); audio?.stopAll(); };
  }, [timeline, particles, decoys, show, audio, audioFor]);

  const togglePause = () => {
    const s = stateRef.current;
    s.paused = !s.paused;
    setPaused(s.paused);
    if (s.paused) { audio?.stopAll(); s.fired = new Set([...s.fired].filter((k) => !k.startsWith('hb') && !k.startsWith('dr') && !k.startsWith('music'))); }
  };
  const restart = () => {
    audio?.stopAll();
    stateRef.current = { t: 0, last: 0, paused: false, fired: new Set(), confetti: [], spin: 0, cycle: 1, nextCycle: 0 };
    setPaused(false); setDone(false);
  };
  const reset = () => { restart(); stateRef.current.paused = true; setPaused(true); };

  const startRecording = () => {
    const stream = canvasRef.current.captureStream(30);
    audio?.stream.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    const mimeType = pickMime();
    const chunks = [];
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const type = rec.mimeType || 'video/webm';
      const blob = new Blob(chunks, { type });
      setVideo({ url: URL.createObjectURL(blob), ext: type.includes('mp4') ? 'mp4' : 'webm', size: blob.size });
    };
    rec.start(1000);
    recorderRef.current = rec;
    setRecording(true);
  };
  const stopRecording = () => { recorderRef.current?.stop(); setRecording(false); };
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : wrapRef.current?.requestFullscreen?.());

  return (
    <div className="fixed inset-0 z-[2147483000] flex flex-col bg-[#04061a]" data-testid="draw-stage">
      <div ref={wrapRef} className="relative flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" data-testid="draw-stage-canvas" />
        {recording && <span className="absolute left-4 top-16 flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1 text-xs font-black text-white" data-testid="draw-recording-indicator"><Circle className="h-3 w-3 animate-pulse fill-white" /> REC</span>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-[#0b0f33] px-3 py-2">
        <button type="button" className={btn} onClick={togglePause} data-testid="draw-stage-pause">{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{paused ? 'Play' : 'Pause'}</button>
        <button type="button" className={btn} onClick={restart} data-testid="draw-stage-replay"><RotateCcw className="h-4 w-4" />Replay</button>
        {show.mode === 'preview' && <button type="button" className={btn} onClick={reset} data-testid="draw-stage-reset"><Square className="h-4 w-4" />Reset</button>}
        <button type="button" className={btn} onClick={fullscreen} data-testid="draw-stage-fullscreen"><Maximize2 className="h-4 w-4" />Full screen</button>
        {!recording
          ? <button type="button" className={`${btn} !bg-rose-600/80`} onClick={startRecording} disabled={!window.MediaRecorder} data-testid="draw-record-start"><Circle className="h-4 w-4" />Start Recording</button>
          : <button type="button" className={`${btn} !bg-rose-600`} onClick={stopRecording} data-testid="draw-record-stop"><Square className="h-4 w-4" />Stop Recording</button>}
        {video && <a className={`${btn} !bg-amber-500/80`} href={video.url} download={`prize-league-draw-${Date.now()}.${video.ext}`} data-testid="draw-record-download"><Download className="h-4 w-4" />Download {video.ext.toUpperCase()} ({(video.size / 1048576).toFixed(1)} MB)</a>}
        <span className="text-xs font-bold text-white/60" data-testid="draw-stage-status">{done ? 'Finished' : paused ? 'Paused' : 'Playing'}</span>
        <button type="button" className={btn} onClick={() => { if (recording) stopRecording(); onClose(); }} data-testid="draw-stage-close"><X className="h-4 w-4" />Close</button>
      </div>
      {video && <video src={video.url} controls className="absolute bottom-16 right-4 w-72 rounded-lg border border-amber-400/60 shadow-2xl" data-testid="draw-record-preview" />}
    </div>
  );
}
