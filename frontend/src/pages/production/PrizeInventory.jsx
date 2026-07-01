import { PRIZE_INVENTORY } from '../../mock/mockData';
import { gbp } from '../../lib/format';
import { Button } from '../../components/ui/button';
import { Package } from 'lucide-react';

export default function PrizeInventory() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-display text-2xl font-extrabold text-white">Prize Inventory</h2>
        <Button className="bg-orange-500 hover:bg-orange-600"><Package className="w-4 h-4 mr-2" /> Add prize</Button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PRIZE_INVENTORY.map(p => (
          <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-orange-400 uppercase">{p.category}</div>
                <div className="font-display font-bold text-white text-lg mt-1">{p.name}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Retail</div>
                <div className="font-bold text-teal-400">{gbp(p.retail)}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="bg-slate-800/60 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-400">In stock</div>
                <div className="font-bold text-xl text-white">{p.stock}</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-400">Allocated</div>
                <div className="font-bold text-xl text-amber-400">{p.allocated}</div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 bg-transparent border-slate-700 text-slate-200 hover:bg-slate-800">Restock</Button>
              <Button size="sm" className="flex-1 bg-teal-600 hover:bg-teal-700">Allocate</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
