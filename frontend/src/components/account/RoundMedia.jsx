import { useEffect, useState } from 'react';
import { Download, Image as ImageIcon, Loader2, PlayCircle } from 'lucide-react';
import { contestWinnerMediaBlob } from '../../lib/api';

function useBlobUrl(rid, enabled) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!rid || !enabled) return undefined;
    let alive = true;
    let made = null;
    contestWinnerMediaBlob(rid).then((b) => { if (alive) { made = URL.createObjectURL(b); setUrl(made); } }).catch(() => alive && setError(true));
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [rid, enabled]);
  return { url, error };
}

// Official winner-reveal clip + screenshot for one draw round (signed-in players only).
export function RoundMedia({ media, roundName, contestId }) {
  const [play, setPlay] = useState(false);
  const shot = useBlobUrl(media.screenshot, true);
  const clip = useBlobUrl(media.clip, play);
  const n = media.round_index + 1;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950" data-testid={`round-media-${contestId}-${media.round_index}`}>
      <div className="relative aspect-video">
        {play && clip.url ? <video src={clip.url} controls autoPlay playsInline className="h-full w-full bg-black object-contain" data-testid={`round-clip-video-${contestId}-${media.round_index}`} />
          : shot.url ? <img src={shot.url} alt={`Round ${n} winner reveal`} className="h-full w-full object-cover" data-testid={`round-screenshot-${contestId}-${media.round_index}`} />
            : <div className="flex h-full items-center justify-center text-white/40"><ImageIcon className="h-8 w-8" /></div>}
        {media.clip && !play && <button type="button" onClick={() => setPlay(true)} className="absolute inset-0 flex items-center justify-center bg-black/30 text-white transition-colors hover:bg-black/45" data-testid={`round-clip-play-${contestId}-${media.round_index}`} aria-label={`Play round ${n} winner reveal`}>
          <PlayCircle className="h-14 w-14 drop-shadow-lg" /></button>}
        {play && !clip.url && !clip.error && <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white"><Loader2 className="h-8 w-8 animate-spin" /></div>}
      </div>
      <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 text-xs">
        <span className="font-bold text-slate-800">Round {n}{roundName ? ` · ${roundName}` : ''} reveal</span>
        <span className="flex gap-2">
          {shot.url && <a href={shot.url} download={`prize-league-round-${n}.png`} className="inline-flex items-center gap-1 font-semibold text-violet-700 hover:underline" data-testid={`round-screenshot-download-${contestId}-${media.round_index}`}><Download className="h-3 w-3" />Screenshot</a>}
          {clip.url && <a href={clip.url} download={`prize-league-round-${n}`} className="inline-flex items-center gap-1 font-semibold text-violet-700 hover:underline" data-testid={`round-clip-download-${contestId}-${media.round_index}`}><Download className="h-3 w-3" />Clip</a>}
        </span>
      </div>
      {(shot.error || clip.error) && <p className="bg-white px-3 pb-2 text-[11px] text-rose-600">Media unavailable right now.</p>}
    </div>
  );
}
