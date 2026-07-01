import { useState, useEffect, useMemo } from 'react';
import CompetitionCard from '../components/CompetitionCard';
import { CATEGORIES } from '../mock/mockData';
import { contestsAPI } from '../lib/api';
import { Input } from '../components/ui/input';
import { Search } from 'lucide-react';

export default function Competitions() {
  const [contests, setContests] = useState([]);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => { contestsAPI.list().then(setContests).catch(() => {}); }, []);

  const mapped = useMemo(() => contests.map(c => ({
    id: c.contest_id, slug: c.slug, title: c.title, subtitle: c.subtitle,
    category: c.category, tag: c.tag, price: c.price,
    ticketsSold: c.tickets_sold, ticketsTotal: c.tickets_total,
    endDate: c.end_date, image: c.image, jackpot: c.jackpot,
  })), [contests]);

  const items = useMemo(() => mapped.filter(c => (cat === 'all' || c.category === cat) && c.title.toLowerCase().includes(q.toLowerCase())), [mapped, cat, q]);

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-extrabold text-slate-900">All Contests</h1>
        <p className="text-slate-500 mt-1">{mapped.length} live skill contests – answer a puzzle, buy a ticket, win real cash.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contests…" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button key={c.slug} onClick={() => setCat(c.slug)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${cat === c.slug ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-teal-400'}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {items.map(c => <CompetitionCard key={c.id} c={c} />)}
      </div>
      {items.length === 0 && <p className="text-center text-slate-500 py-16">No contests found.</p>}
    </div>
  );
}
