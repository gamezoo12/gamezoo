import { useEffect, useState } from 'react';
import { Crown, Medal, Play, Ticket } from 'lucide-react';
import { paidWinnersAPI } from '../../lib/api';
import { gbp } from '../../lib/format';
import { Lightbox } from './Lightbox';

const Loading = () => <div className="py-16 text-center text-sm text-indigo-200/60" data-testid="pw-detail-loading">Loading…</div>;
const Empty = ({ text }) => <p className="py-16 text-center text-sm text-indigo-200/60" data-testid="pw-detail-empty">{text}</p>;

function useData(fn, cid) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); fn(cid).then(setD).catch(() => setD({ error: true })); }, [fn, cid]);
  return d;
}

export function WinnersDetail({ cid }) {
  const d = useData(paidWinnersAPI.contestWinners, cid);
  if (!d) return <Loading />;
  if (d.error || !d.winners.length) return <Empty text="Winners for this contest haven't been published yet." />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2" data-testid="pw-winners-list">
      {d.winners.map((w, i) => (
        <li key={`${w.ticket_number}-${i}`} className="pw-rise flex items-center gap-4 rounded-2xl border border-amber-300/20 bg-gradient-to-br from-[#231660] to-[#140d3d] p-4" style={{ animationDelay: `${i * 60}ms` }} data-testid={`pw-winner-${i}`}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-[#1a1033]">{i === 0 ? <Crown className="h-6 w-6" /> : <Medal className="h-6 w-6" />}</div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg font-bold text-white">{w.name}</div>
            <div className="flex flex-wrap items-center gap-x-3 text-xs text-indigo-200/70">
              {w.ticket_number && <span className="inline-flex items-center gap-1"><Ticket className="h-3 w-3" />#{w.ticket_number}</span>}
              {w.round_name && <span>{w.round_name}</span>}
            </div>
          </div>
          <div className="text-right font-display font-extrabold text-amber-300">{Number(w.prize_amount) > 0 && gbp(w.prize_amount)}{Number(w.prize_bonus_tokens) > 0 && <div className="text-[11px] font-bold text-amber-200/80">+{w.prize_bonus_tokens} bonus</div>}</div>
        </li>
      ))}
    </ul>
  );
}

const fmtTime = (ms) => (ms ? `${(ms / 1000).toFixed(2)}s` : '—');

export function LeaderboardDetail({ cid }) {
  const d = useData(paidWinnersAPI.leaderboard, cid);
  if (!d) return <Loading />;
  if (d.error || !d.leaderboard.length) return <Empty text="No final leaderboard is available for this contest." />;
  return (
    <div data-testid="pw-leaderboard">
      <p className="mb-3 text-xs text-indigo-200/60">Final official standings · read-only</p>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-white/5 text-[10px] font-black uppercase tracking-wider text-indigo-200/60"><tr>{['Rank', 'Player', 'Score', 'Accuracy', 'Time'].map((h) => <th key={h} className="px-3 py-2.5">{h}</th>)}</tr></thead>
          <tbody>
            {d.leaderboard.map((r) => (
              <tr key={r.rank} className={`border-t border-white/5 ${r.rank <= 3 ? 'bg-amber-300/[0.06]' : ''}`} data-testid={`pw-lb-row-${r.rank}`}>
                <td className="px-3 py-2.5 font-display font-extrabold text-amber-300">{r.rank}</td>
                <td className="px-3 py-2.5 font-semibold text-white">{r.name}</td>
                <td className="px-3 py-2.5 text-white">{r.points}</td>
                <td className="px-3 py-2.5 text-indigo-100">{r.accuracy_pct}%</td>
                <td className="px-3 py-2.5 text-indigo-100">{fmtTime(r.duration_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ item, onOpen, testid }) {
  return (
    <button type="button" onClick={() => onOpen(item)} className="group relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-[#1b1250]" data-testid={testid}>
      {item.type === 'video' ? <video src={item.src} muted preload="metadata" playsInline className="h-full w-full object-cover" /> : <img src={item.src} alt={item.caption || ''} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
      {item.type === 'video' && <span className="absolute inset-0 flex items-center justify-center bg-black/30"><span className="rounded-full bg-amber-400 p-3 text-[#1a1033] shadow-lg transition-transform group-hover:scale-110"><Play className="h-5 w-5 fill-current" /></span></span>}
      {item.caption && <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left text-xs text-white">{item.caption}</span>}
    </button>
  );
}

export function GalleryDetail({ cid }) {
  const d = useData(paidWinnersAPI.gallery, cid);
  const [open, setOpen] = useState(null);
  if (!d) return <Loading />;
  const items = d.error ? [] : [
    ...d.media.map((m) => ({ key: m.media_id, type: m.type, caption: m.caption, src: paidWinnersAPI.mediaUrl(cid, m.media_id) })),
    ...d.round_media.flatMap((r) => [['clip', 'video', 'winner reveal'], ['screenshot', 'image', 'winner screen']].filter(([k]) => r[k])
      .map(([k, type, label]) => ({ key: r[k], type, caption: `Round ${r.round_index + 1} · ${label}`, src: paidWinnersAPI.roundMediaUrl(cid, r[k]) }))),
  ];
  if (!items.length) return <Empty text="No draw media has been published for this contest yet." />;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="pw-gallery">
        {items.map((it) => <Tile key={it.key} item={it} onOpen={setOpen} testid={`pw-media-${it.key}`} />)}
      </div>
      <Lightbox item={open} onClose={() => setOpen(null)} />
    </>
  );
}
