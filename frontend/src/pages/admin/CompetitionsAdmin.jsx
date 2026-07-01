import { COMPETITIONS } from '../../mock/mockData';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import { gbp, percent } from '../../lib/format';
import { Pencil, Trash2 } from 'lucide-react';

export default function CompetitionsAdmin() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-display text-2xl font-extrabold">Competitions</h2>
        <Button className="bg-teal-600 hover:bg-teal-700">+ Create competition</Button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {COMPETITIONS.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="flex gap-3 p-3">
              <img src={c.image} alt="" className="w-24 h-24 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-500 uppercase">{c.category}</div>
                <div className="font-semibold text-slate-900 line-clamp-2">{c.title}</div>
                <div className="text-xs text-slate-500 mt-1">{gbp(c.price)} · {c.ticketsSold.toLocaleString()}/{c.ticketsTotal.toLocaleString()}</div>
              </div>
            </div>
            <div className="px-3"><Progress value={percent(c.ticketsSold, c.ticketsTotal)} className="h-1.5" /></div>
            <div className="flex justify-end gap-2 p-3">
              <Button variant="outline" size="sm"><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>
              <Button variant="outline" size="sm" className="text-rose-600 hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
