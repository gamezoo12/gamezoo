import { useCallback, useRef, useState } from 'react';
import { makeRecordStream } from './recordFrame';

function pickMime() {
  const options = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return options.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// Records the WebGL studio canvas (all on-screen graphics) plus the mixed studio audio.
export function useRecorder() {
  const rec = useRef(null);
  const [state, setState] = useState('idle');
  const [last, setLast] = useState(null);

  const start = useCallback((canvas, audio) => {
    const frame = makeRecordStream(canvas, audio);
    const { stream } = frame;
    const mimeType = pickMime();
    const chunks = [];
    const r = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      frame.stop();
      const type = (r.mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunks, { type });
      const name = `prize-league-draw-${new Date().toISOString().replace(/[:.]/g, '-')}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      downloadBlob(blob, name);
      setLast({ blob, name });
      setState('idle');
    };
    r.start(1000);
    rec.current = r;
    setState('recording');
  }, []);
  const pause = useCallback(() => { rec.current?.pause(); setState('paused'); }, []);
  const resume = useCallback(() => { rec.current?.resume(); setState('recording'); }, []);
  const stop = useCallback(() => { if (rec.current && rec.current.state !== 'inactive') rec.current.stop(); }, []);
  return { state, last, start, pause, resume, stop, supported: Boolean(window.MediaRecorder) };
}
