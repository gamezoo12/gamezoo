import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import CompetitionCard from '../components/CompetitionCard';
import { CATEGORIES } from '../mock/mockData';
import { contestsAPI } from '../lib/api';
import { Input } from '../components/ui/input';
import {
  Search,
  Sparkles,
} from 'lucide-react';

export default function Competitions() {
  const [contests, setContests] = useState([]);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');

  const [searchParams, setSearchParams] = useSearchParams();

  const requestedView = searchParams.get('view');

  const initialView =
    requestedView === 'live' || requestedView === 'future'
      ? requestedView
      : 'all';

  const [view, setView] = useState(initialView);

  useEffect(() => {
    contestsAPI
      .list()
      .then(r => setContests(Array.isArray(r) ? r : (r?.contests || [])))
      .catch(() => setContests([]));
  }, []);

  // Keep the page in sync when a user arrives through:
  // /competitions?view=live
  // /competitions?view=future
  useEffect(() => {
    const next = searchParams.get('view');

    if (next === 'live' || next === 'future') {
      setView(next);
    } else {
      setView('all');
    }
  }, [searchParams]);

  const changeView = nextView => {
    setView(nextView);

    const nextParams = new URLSearchParams(searchParams);

    if (nextView === 'all') {
      nextParams.delete('view');
    } else {
      nextParams.set('view', nextView);
    }

    setSearchParams(nextParams);
  };

  const mapped = useMemo(
    () =>
      contests.map(c => ({
        id: c.contest_id,
        contest_id: c.contest_id,
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
        featured: c.featured,
        gameType: c.game_type,
        status: c.status,

        public_coming_soon: c.public_coming_soon === true,
        comingSoon: c.public_coming_soon === true,
      })),
    [contests]
  );

  const items = useMemo(
    () =>
      mapped.filter(c => {
        const matchesView =
          view === 'all' ||
          (view === 'live' && c.public_coming_soon !== true) ||
          (view === 'future' && c.public_coming_soon === true);

        const matchesCategory =
          cat === 'all' ||
          c.category === cat;

        const matchesSearch =
          String(c.title || '')
            .toLowerCase()
            .includes(q.toLowerCase());

        return (
          matchesView &&
          matchesCategory &&
          matchesSearch
        );
      }),
    [mapped, view, cat, q]
  );

  const liveCount =
    mapped.filter(
      c => c.public_coming_soon !== true
    ).length;

  const futureCount =
    mapped.filter(
      c => c.public_coming_soon === true
    ).length;

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

          {futureCount > 0 &&
            ` - ${futureCount} future contest${futureCount === 1 ? '' : 's'}`}
        </p>
      </div>

      {/* LIVE / FUTURE FILTERS */}
      <div className="flex flex-wrap gap-2 mb-5">

        <button
          type="button"
          onClick={() => changeView('all')}
          className={[
            'rounded-full px-5 py-2.5 text-sm font-extrabold transition',
            view === 'all'
              ? 'bg-[#6C2BFF] text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
          ].join(' ')}
          data-testid="contest-view-all"
        >
          All Contests
        </button>

        <button
          type="button"
          onClick={() => changeView('live')}
          className={[
            'rounded-full px-5 py-2.5 text-sm font-extrabold transition',
            view === 'live'
              ? 'bg-[#6C2BFF] text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
          ].join(' ')}
          data-testid="contest-view-live"
        >
          Live Contests ({liveCount})
        </button>

        <button
          type="button"
          onClick={() => changeView('future')}
          className={[
            'rounded-full px-5 py-2.5 text-sm font-extrabold transition',
            view === 'future'
              ? 'bg-[#6C2BFF] text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
          ].join(' ')}
          data-testid="contest-view-future"
        >
          Future Contests ({futureCount})
        </button>

      </div>

      {/* EXISTING SEARCH + CATEGORY OPTIONS */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">

        <div className="relative flex-1">
          <Search
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search competitions..."
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(category => (
            <button
              type="button"
              key={category.slug}
              onClick={() => setCat(category.slug)}
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

        {items.map(contest => (
          <CompetitionCard
            key={contest.id}
            c={contest}
          />
        ))}

      </div>

      {items.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">

          <Sparkles className="w-10 h-10 mx-auto text-[#6C2BFF]" />

          <h2 className="mt-4 font-display text-2xl font-extrabold text-slate-900">
            {view === 'live'
              ? 'No live competitions'
              : view === 'future'
                ? 'No future competitions announced'
                : 'Competitions coming soon'}
          </h2>

          <p className="mt-2 text-slate-500">
            New Prize League competitions are being prepared.
          </p>

        </div>
      )}

    </div>
  );
}
