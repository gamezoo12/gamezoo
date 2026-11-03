import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';

// Plays muted only while the whole banner is on screen; players tap the speaker for sound.
export const BannerVideo = ({ src, active, onEnded, testid }) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [muted, setMuted] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.intersectionRatio >= 0.98), { threshold: [0, 0.98, 1] });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active) { el.pause(); el.currentTime = 0; setUserPaused(false); return; }
    if (!visible || userPaused) { el.pause(); return; }
    el.muted = muted;
    el.play().catch(() => {});
  }, [active, visible, userPaused]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = (e) => {
    e.stopPropagation();
    const next = !muted;
    if (ref.current) ref.current.muted = next;
    setMuted(next);
  };
  const togglePause = (e) => { e.stopPropagation(); setUserPaused((p) => !p); };
  const btn = 'w-10 h-10 rounded-full bg-black/55 hover:bg-black/75 text-white backdrop-blur flex items-center justify-center transition-colors';

  return (
    <>
      <video ref={ref} src={src} muted playsInline preload="metadata" onEnded={onEnded}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        className="absolute inset-0 block w-full h-full object-cover object-center" data-testid={testid} />
      {active && (
        <div className="absolute right-3 top-3 z-10 flex gap-2">
          <button type="button" onClick={togglePause} aria-label={playing ? 'Pause video' : 'Play video'} className={btn} data-testid={`${testid}-pause`}>
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute video' : 'Mute video'}
            className={muted ? 'h-10 rounded-full bg-white text-slate-900 px-4 flex items-center gap-2 text-sm font-extrabold shadow-lg hover:bg-amber-300 transition-colors' : btn}
            data-testid={`${testid}-mute`}>
            {muted ? <><VolumeX className="w-5 h-5" />Tap for sound</> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      )}
    </>
  );
};
