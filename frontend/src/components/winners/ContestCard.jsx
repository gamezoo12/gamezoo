import { Calendar, ChevronRight, Film, ListOrdered, Trophy } from 'lucide-react';
import { paidWinnersAPI } from '../../lib/api';
import { gbp } from '../../lib/format';

const ICON = { winners: Trophy, leaderboards: ListOrdered, gallery: Film };
const CTA = { winners: 'See winners', leaderboards: 'View final leaderboard', gallery: 'Open gallery' };

export function coverSrc(c) {
  return c.cover_id ? paidWinnersAPI.mediaUrl(c.contest_id, c.cover_id) : c.image;
}

export function ContestCard({ c, tab, onOpen, index }) {
  const Icon = ICON[tab];
  return (
    <button type="button" onClick={() => onOpen(c)} style={{ animationDelay: `${index * 70}ms` }}
      className="pw-rise group relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#120c3a] text-left shadow-[0_20px_60px_-30px_rgba(124,58,237,0.7)] transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-amber-300/60"
      data-testid={`pw-card-${tab}-${c.contest_id}`}>
      <div className="relative aspect-[16/10] overflow-hidden bg-[#1b1250]">
        {coverSrc(c) && <img src={coverSrc(c)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0628] via-[#0a0628]/30 to-transparent" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-200 backdrop-blur">
          <Icon className="h-3 w-3" />{c.kind === 'draw' ? 'Prize draw' : 'Skill leaderboard'}
        </span>
        {Number(c.prize_amount) > 0 && <span className="absolute bottom-3 left-3 font-display text-2xl font-extrabold text-amber-300 drop-shadow">{gbp(c.prize_amount)}</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-base font-bold leading-snug text-white line-clamp-2">{c.title}</h3>
        {c.end_date && <p className="mt-1 flex items-center gap-1 text-xs text-indigo-200/60"><Calendar className="h-3 w-3" />Ended {new Date(c.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
        <span className="mt-auto flex items-center gap-1 pt-4 text-xs font-black uppercase tracking-wider text-amber-300">{CTA[tab]}<ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span>
      </div>
    </button>
  );
}
