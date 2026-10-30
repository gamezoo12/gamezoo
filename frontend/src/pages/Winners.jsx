import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Film, ListOrdered, Sparkles, Trophy } from 'lucide-react';
import { paidWinnersAPI } from '../lib/api';
import { ContestCard, coverSrc } from '../components/winners/ContestCard';
import { GalleryDetail, LeaderboardDetail, WinnersDetail } from '../components/winners/Details';
import '../components/winners/winners.css';

const TABS = [
  { key: 'winners', label: 'Winners', icon: Trophy, blurb: 'Officially published winners from completed Paid World contests.' },
  { key: 'leaderboards', label: 'Past Leaderboards', icon: ListOrdered, blurb: 'Final, read-only standings from completed skill competitions.' },
  { key: 'gallery', label: 'Draw Gallery', icon: Film, blurb: 'Live draw recordings, winner reveals and screenshots.' },
];
const DETAIL = { winners: WinnersDetail, leaderboards: LeaderboardDetail, gallery: GalleryDetail };

function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-10 pt-14 lg:px-8">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-violet-600/30 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-10 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="relative mx-auto max-w-7xl">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-amber-200"><Sparkles className="h-3 w-3" />Paid World</span>
        <h1 className="mt-4 font-display text-4xl font-extrabold text-white sm:text-5xl lg:text-6xl">Hall of <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent">Winners</span></h1>
        <p className="mt-3 max-w-xl text-base text-indigo-100/70">Real players, real prizes. Every result here is official and published only after it has been verified.</p>
      </div>
    </section>
  );
}

function TabBar({ tab, setTab }) {
  return (
    <div className="sticky top-0 z-20 border-y border-white/10 bg-[#0a0628]/85 backdrop-blur-xl">
      <div className="no-scrollbar mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2 lg:px-8" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors ${tab === key ? 'bg-gradient-to-r from-amber-300 to-amber-500 text-[#1a1033]' : 'text-indigo-100/70 hover:bg-white/5 hover:text-white'}`}
            data-testid={`pw-tab-${key}`}><Icon className="h-4 w-4" />{label}</button>
        ))}
      </div>
    </div>
  );
}

function DetailView({ tab, contest, onBack }) {
  const Detail = DETAIL[tab];
  return (
    <div className="pw-rise" data-testid="pw-detail">
      <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-sm font-bold text-indigo-100 hover:bg-white/10" data-testid="pw-detail-back"><ArrowLeft className="h-4 w-4" />All contests</button>
      <div className="mb-6 flex items-center gap-4">
        {coverSrc(contest) && <img src={coverSrc(contest)} alt="" className="h-16 w-24 rounded-xl object-cover sm:h-20 sm:w-32" />}
        <h2 className="font-display text-base font-bold text-white md:text-lg" data-testid="pw-detail-title">{contest.title}</h2>
      </div>
      <Detail cid={contest.contest_id} />
    </div>
  );
}

export default function Winners() {
  const [tab, setTabState] = useState('winners');
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const setTab = useCallback((t) => { setTabState(t); setOpen(null); }, []);
  useEffect(() => { setList(null); paidWinnersAPI.list(tab).then((r) => setList(r.contests)).catch(() => setList([])); }, [tab]);
  const meta = TABS.find((t) => t.key === tab);

  return (
    <div className="pw-page min-h-screen bg-[#0a0628] text-white" data-testid="paid-winners-page">
      <Hero />
      <TabBar tab={tab} setTab={setTab} />
      <main className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
        {open ? <DetailView tab={tab} contest={open} onBack={() => setOpen(null)} /> : (
          <>
            <p className="mb-6 text-sm text-indigo-200/70">{meta.blurb}</p>
            {!list && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-3xl bg-white/5" />)}</div>}
            {list?.length > 0 && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid={`pw-grid-${tab}`}>{list.map((c, i) => <ContestCard key={c.contest_id} c={c} tab={tab} index={i} onOpen={setOpen} />)}</div>}
            {list && !list.length && (
              <div className="rounded-3xl border border-dashed border-white/15 py-20 text-center" data-testid="pw-empty">
                <Trophy className="mx-auto h-10 w-10 text-amber-300" />
                <h2 className="mt-4 font-display text-base font-bold md:text-lg">Nothing published here yet</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm text-indigo-200/60">Results appear once a Paid World contest is complete and verified.</p>
                <Link to="/competitions" className="mt-6 inline-block rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-6 py-3 text-sm font-black text-[#1a1033]" data-testid="pw-browse-contests">Browse contests</Link>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
