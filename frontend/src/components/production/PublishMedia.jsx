import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Film, ImagePlus, Trash2, Upload } from 'lucide-react';
import { drawStudioAPI, paidWinnersAPI } from '../../lib/api';
import { useBlobUrl } from './useBlobUrl';

const iconBtn = 'rounded-full bg-white/10 p-1.5 hover:bg-white/20 disabled:opacity-30';

function Thumb({ cid, item }) {
  const url = useBlobUrl(() => paidWinnersAPI.adminMediaBlob(cid, item.media_id), item.media_id);
  if (!url) return <div className="h-16 w-24 animate-pulse rounded-lg bg-white/10" />;
  return item.type === 'video' ? <video src={url} className="h-16 w-24 rounded-lg object-cover" muted /> : <img src={url} alt="" className="h-16 w-24 rounded-lg object-cover" />;
}

function RoundThumb({ rid, kind }) {
  const url = useBlobUrl(() => drawStudioAPI.recordingBlob(rid), rid);
  if (!url) return <div className="h-16 w-24 animate-pulse rounded-lg bg-white/10" />;
  return kind === 'clip' ? <video src={url} className="h-16 w-24 rounded-lg object-cover" muted /> : <img src={url} alt="" className="h-16 w-24 rounded-lg object-cover" />;
}

export function UploadButton({ label, accept, onFile, testid, icon: Icon = Upload }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20" data-testid={testid}>
      <Icon className="h-3.5 w-3.5" />{label}
      <input type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </label>
  );
}

export function CoverPicker({ c, run }) {
  const cover = c.publication.cover;
  return (
    <div className="flex items-center gap-3" data-testid={`publish-cover-${c.contest_id}`}>
      {cover ? <Thumb cid={c.contest_id} item={cover} /> : <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-white/20 text-[10px] text-white/40">No cover</div>}
      <UploadButton label={cover ? 'Replace cover' : 'Upload cover'} accept="image/*" icon={ImagePlus} testid={`publish-cover-upload-${c.contest_id}`} onFile={(f) => run((p) => paidWinnersAPI.upload(c.contest_id, 'cover', f, '', p), 'Cover image saved.')} />
    </div>
  );
}

export function GalleryMedia({ c, run }) {
  const [caption, setCaption] = useState('');
  const media = c.publication.media;
  const hidden = new Set(c.publication.hidden_round_media);
  const move = (i, d) => { const ids = media.map((m) => m.media_id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; run(() => paidWinnersAPI.reorder(c.contest_id, ids), 'Gallery order saved.'); };
  return (
    <div className="space-y-3" data-testid={`publish-gallery-${c.contest_id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={140} placeholder="Caption (optional)" className="h-8 flex-1 rounded-lg border border-white/15 bg-[#0b0724] px-3 text-xs" data-testid={`publish-caption-${c.contest_id}`} />
        <UploadButton label="Add image / video" accept="image/*,video/*" icon={Film} testid={`publish-media-upload-${c.contest_id}`} onFile={(f) => run((p) => paidWinnersAPI.upload(c.contest_id, 'gallery', f, caption, p), 'Media added to the gallery.').then(() => setCaption(''))} />
      </div>
      {media.map((m, i) => (
        <div key={m.media_id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-2" data-testid={`publish-media-${m.media_id}`}>
          <Thumb cid={c.contest_id} item={m} />
          <div className="min-w-0 flex-1 text-xs"><div className="font-bold capitalize">{i + 1}. {m.type}</div><div className="truncate text-white/50">{m.caption || 'No caption'}</div></div>
          <button type="button" className={iconBtn} disabled={!i} onClick={() => move(i, -1)} aria-label="Move up" data-testid={`publish-media-up-${m.media_id}`}><ArrowUp className="h-3.5 w-3.5" /></button>
          <button type="button" className={iconBtn} disabled={i === media.length - 1} onClick={() => move(i, 1)} aria-label="Move down" data-testid={`publish-media-down-${m.media_id}`}><ArrowDown className="h-3.5 w-3.5" /></button>
          <button type="button" className={iconBtn} onClick={() => window.confirm('Remove this media from the gallery?') && run(() => paidWinnersAPI.removeMedia(c.contest_id, m.media_id), 'Media removed.')} aria-label="Remove" data-testid={`publish-media-delete-${m.media_id}`}><Trash2 className="h-3.5 w-3.5 text-rose-300" /></button>
        </div>
      ))}
      {c.round_media.flatMap((r) => ['clip', 'screenshot'].filter((k) => r[k]).map((k) => (
        <div key={r[k]} className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-2" data-testid={`publish-round-media-${r[k]}`}>
          <RoundThumb rid={r[k]} kind={k} />
          <div className="flex-1 text-xs"><div className="font-bold">Round {r.round_index + 1} · auto {k === 'clip' ? 'reveal clip' : 'screenshot'}</div><div className={hidden.has(r[k]) ? 'text-rose-300' : 'text-emerald-300'}>{hidden.has(r[k]) ? 'Hidden from gallery' : 'Shown in gallery'}</div></div>
          <button type="button" className={iconBtn} onClick={() => run(() => paidWinnersAPI.setRoundMediaVisible(c.contest_id, r[k], hidden.has(r[k])), 'Gallery updated.')} aria-label="Toggle visibility" data-testid={`publish-round-toggle-${r[k]}`}>{hidden.has(r[k]) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
        </div>
      )))}
      {!media.length && !c.round_media.length && <p className="text-xs text-white/40">No draw media yet. Official Draw Studio clips appear here automatically once the round is published.</p>}
    </div>
  );
}
