import { useCallback, useRef, useState } from 'react';
import { drawStudioAPI } from '../../../lib/api';
import { makeRecordStream } from './recordFrame';

const CLIP_TAIL_MS = 6000;
const SHOT_DELAY_MS = 2600;

function pickMime() {
  const options = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return options.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

const snapshot = (canvas) => new Promise((resolve) => { try { canvas.toBlob((b) => resolve(b), 'image/png'); } catch { resolve(null); } });

// Official rounds only: records Draw → Winner Reveal (+6s) and a 1080p winner screenshot, then uploads both.
export function useRoundCapture() {
  const rec = useRef(null);
  const [status, setStatus] = useState(null);

  const start = useCallback((canvas, audio) => {
    if (!window.MediaRecorder || rec.current) return;
    try {
      const frame = makeRecordStream(canvas, audio);
      const mimeType = pickMime();
      const chunks = [];
      const r = new MediaRecorder(frame.stream, mimeType ? { mimeType, videoBitsPerSecond: 5_000_000 } : undefined);
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.start(1000);
      rec.current = { r, chunks, frame };
      setStatus('recording');
    } catch { setStatus('error'); }
  }, []);

  const cancel = useCallback(() => {
    const cur = rec.current;
    rec.current = null;
    if (cur && cur.r.state !== 'inactive') cur.r.stop();
    cur?.frame.stop();
    setStatus(null);
  }, []);

  const finish = useCallback((meta) => {
    const cur = rec.current;
    if (!cur) return;
    rec.current = null;
    const shot = new Promise((resolve) => setTimeout(() => snapshot(cur.frame.frame).then(resolve), SHOT_DELAY_MS));
    setTimeout(async () => {
      const stopped = new Promise((resolve) => { cur.r.onstop = resolve; });
      if (cur.r.state !== 'inactive') cur.r.stop();
      await stopped;
      const image = await shot;
      cur.frame.stop();
      setStatus('saving');
      try {
        const type = (cur.r.mimeType || 'video/webm').split(';')[0];
        const clip = new Blob(cur.chunks, { type });
        const base = { ...meta, mode: 'official' };
        if (clip.size) await drawStudioAPI.saveRecording(clip, { ...base, kind: 'clip' });
        if (image) await drawStudioAPI.saveRecording(image, { ...base, kind: 'screenshot' });
        setStatus('saved');
      } catch { setStatus('error'); }
    }, CLIP_TAIL_MS);
  }, []);

  return { status, start, finish, cancel };
}
