import { WINNERS } from '../../mock/mockData';
import { Button } from '../../components/ui/button';
import { Trophy, Send } from 'lucide-react';

export default function WinnersAdmin() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-display text-2xl font-extrabold">Winners</h2>
        <Button className="bg-teal-600 hover:bg-teal-700"><Trophy className="w-4 h-4 mr-2" /> Announce new winner</Button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {WINNERS.map(w => (
          <div key={w.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="aspect-video bg-slate-100 overflow-hidden"><img src={w.image} alt={w.name} className="w-full h-full object-cover" /></div>
            <div className="p-4">
              <div className="text-xs text-slate-500">Ticket #{w.ticket}</div>
              <div className="font-semibold text-slate-900">{w.name}</div>
              <div className="text-sm text-slate-500">{w.prize}</div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline"><Send className="w-3.5 h-3.5 mr-1" /> Notify</Button>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700">Mark paid</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
