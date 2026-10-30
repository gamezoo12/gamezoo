// Copies the WebGL studio onto an opaque, even-sized 1920x1080 frame so encoders never show green bars or flicker.
export const REC_W = 1920;
export const REC_H = 1080;

export function makeRecordStream(source, audio, fps = 30) {
  const out = document.createElement('canvas');
  out.width = REC_W;
  out.height = REC_H;
  const ctx = out.getContext('2d', { alpha: false });
  let raf = 0;
  const draw = () => {
    ctx.fillStyle = '#050211';
    ctx.fillRect(0, 0, REC_W, REC_H);
    const sw = source.width;
    const sh = source.height;
    if (sw && sh) {
      const scale = Math.min(REC_W / sw, REC_H / sh);
      const w = sw * scale;
      const h = sh * scale;
      ctx.drawImage(source, (REC_W - w) / 2, (REC_H - h) / 2, w, h);
    }
    raf = requestAnimationFrame(draw);
  };
  draw();
  const stream = out.captureStream(fps);
  audio?.stream.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const stop = () => { cancelAnimationFrame(raf); stream.getVideoTracks().forEach((t) => t.stop()); };
  return { stream, stop, frame: out };
}
