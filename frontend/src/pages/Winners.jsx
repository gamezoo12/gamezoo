import { WINNERS } from '../mock/mockData';
import { Trophy, Calendar, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';

export default function Winners() {
  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
      <h1 className="font-display text-4xl font-extrabold text-slate-900">Our Winners</h1>
      <p className="text-slate-500 mt-1">Fresh launch – be one of our very first winners.</p>

      {WINNERS.length === 0 ? (
        <div className="mt-10 rounded-3xl border-2 border-dashed border-slate-200 py-20 text-center bg-gradient-to-b from-teal-50/50 to-white">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white mx-auto flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8" />
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-900">No winners announced yet</h2>
          <p className="text-slate-500 mt-2 max-w-md mx-auto">GameZoo has just launched. Winners are announced live after each contest’s draw. Enter now for your chance to be the first!</p>
          <Link to="/competitions"><Button className="mt-6 bg-teal-600 hover:bg-teal-700">Browse contests</Button></Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-8">
          {WINNERS.map((w) => (
            <div key={w.id} className="rounded-2xl overflow-hidden bg-white border border-slate-100 shadow-sm hover:shadow-lg transition-shadow">
              <div className="aspect-square overflow-hidden bg-slate-50">
                <img src={w.image} alt={w.name} className="w-full h-full object-cover" loading="lazy" />
              </div>
              <div className="p-4">
                <div className="flex items-center gap-1 text-orange-600 text-xs font-semibold mb-1"><Trophy className="w-3 h-3" /> {w.amount}</div>
                <div className="font-display font-bold text-slate-900 line-clamp-1">{w.prize}</div>
                <div className="text-sm text-slate-500 mt-1">Won by {w.name}</div>
                <div className="flex items-center gap-1 text-xs text-slate-400 mt-2"><Calendar className="w-3 h-3" /> {new Date(w.date).toLocaleDateString('en-GB')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
