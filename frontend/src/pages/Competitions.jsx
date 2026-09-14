import { useState, useEffect, useMemo } from 'react';
import CompetitionCard from '../components/CompetitionCard';
import { CATEGORIES } from '../mock/mockData';
import { contestsAPI } from '../lib/api';
import { Input } from '../components/ui/input';
import {
  Search,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';

function ComingSoonCard({ contest }) {
  return (
    <article
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      data-testid={`coming-soon-${contest.id}`}
    >
      <div className="relative aspect-[16/10] bg-gradient-to-br from-[#160B35] via-[#351071] to-[#6C2BFF] flex items-center justify-center overflow-hidden">
        {contest.image ? (
          <img
            src={contest.image}
            alt={contest.title}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="text-center text-white/75">
            <ImageIcon className="w-10 h-10 mx-auto mb-2" />
            <span className="text-xs font-bold uppercase tracking-widest">
              Image coming soon
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />

        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-[#FFD54A]/50 bg-black/65 px-3 py-1.5 text-[11px] font-black tracking-wider text-[#FFD54A]">
          <Sparkles className="w-3.5 h-3.5" />
          COMING SOON
        </div>
      </div>

      <div className="p-5">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#6C2BFF]">
          Prize Competition
        </p>

        <h2 className="mt-1 font-display text-xl font-extrabold text-slate-900">
          {contest.title}
        </h2>

        <p className="mt-2 min-h-[40px] text-sm leading-5 text-slate-500">
          {contest.subtitle ||
            'Competition details, prize information and entry information will be announced soon.'}
        </p>

        <div className="mt-5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-extrabold text-slate-600">
          COMING SOON
        </div>
      </div>
    </article>
  );
}

export default function Competitions() {
  const [contests, setContests] =
    useState([]);

  const [cat, setCat] =
    useState('all');

  const [q, setQ] =
    useState('');

  useEffect(() => {
    contestsAPI
      .list()
      .then(setContests)
      .catch(() => setContests([]));
  }, []);

  const mapped =
    useMemo(
      () =>
        contests.map(c => ({
          id: c.contest_id,
          slug: c.slug,
          title: c.title,
          subtitle: c.subtitle,
          category: c.category,
          tag: c.tag,
          price: c.price,
          prizeAmount: c.prize_amount,
          ticketsSold: c.tickets_sold,
          ticketsTotal: c.tickets_total,
          endDate: c.end_date,
          image: c.image,
          jackpot: c.jackpot,
          gameType: c.game_type,
          status: c.status,
          comingSoon:
            c.public_coming_soon === true ||
            (
              c.status === 'draft' &&
              c.tag === 'Coming Soon'
            ),
        })),
      [contests]
    );

  const items =
    useMemo(
      () =>
        mapped.filter(c =>
          (
            cat === 'all' ||
            c.category === cat
          ) &&
          c.title
            .toLowerCase()
            .includes(q.toLowerCase())
        ),
      [mapped, cat, q]
    );

  const liveCount =
    mapped.filter(c => !c.comingSoon).length;

  const comingSoonCount =
    mapped.filter(c => c.comingSoon).length;

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10">

      <div className="mb-8">
        <h1 className="font-display text-4xl font-extrabold text-slate-900">
          Prize Competitions
        </h1>

        <p className="text-slate-500 mt-2">
          {liveCount > 0
            ? `${liveCount} live competition${liveCount === 1 ? '' : 's'}`
            : 'New competitions are on the way.'}

          {comingSoonCount > 0 &&
            ` â€¢ ${comingSoonCount} coming soon`}
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-8">

        <div className="relative flex-1">
          <Search
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <Input
            value={q}
            onChange={e =>
              setQ(e.target.value)
            }
            placeholder="Search competitionsâ€¦"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(category => (
            <button
              type="button"
              key={category.slug}
              onClick={() =>
                setCat(category.slug)
              }
              className={[
                'rounded-full px-4 py-2 text-sm font-bold transition',
                cat === category.slug
                  ? 'bg-[#6C2BFF] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {category.label}
            </button>
          ))}
        </div>

      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">

        {items.map(contest =>
          contest.comingSoon ? (
            <ComingSoonCard
              key={contest.id}
              contest={contest}
            />
          ) : (
            <CompetitionCard
              key={contest.id}
              c={contest}
            />
          )
        )}

      </div>

      {items.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">
          <Sparkles className="w-10 h-10 mx-auto text-[#6C2BFF]" />

          <h2 className="mt-4 font-display text-2xl font-extrabold text-slate-900">
            Competitions coming soon
          </h2>

          <p className="mt-2 text-slate-500">
            New Prize League competitions are being prepared.
          </p>
        </div>
      )}

    </div>
  );
}