import { Package } from 'lucide-react';

export default function PrizeInventory() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-extrabold text-white">
          Prize Inventory
        </h2>
        <p className="text-slate-400 mt-1">
          Real prize inventory will appear here once added through the admin system.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
        <Package className="w-12 h-12 text-slate-600 mx-auto" />
        <h3 className="font-display text-xl font-bold text-white mt-4">
          No prizes added yet
        </h3>
        <p className="text-slate-400 mt-2">
          Add and manage real prize inventory before assigning prizes to competitions.
        </p>
      </div>
    </div>
  );
}
