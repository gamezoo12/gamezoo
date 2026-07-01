import { useState } from 'react';
import { COMPETITIONS } from '../mock/mockData';
import { gbp } from '../lib/format';
import { Button } from '../components/ui/button';
import { Trash2 } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { Link } from 'react-router-dom';

export default function Cart() {
  const [items, setItems] = useState([
    { ...COMPETITIONS[0], qty: 5 },
    { ...COMPETITIONS[6], qty: 10 },
  ]);
  const { toast } = useToast();

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const remove = (id) => setItems(items.filter(i => i.id !== id));

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-10">
      <h1 className="font-display text-4xl font-extrabold text-slate-900">Your Basket</h1>

      {items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 mt-8">
          <p className="text-slate-500">Your basket is empty.</p>
          <Link to="/competitions"><Button className="mt-4 bg-teal-600 hover:bg-teal-700">Browse competitions</Button></Link>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2 space-y-3">
            {items.map(i => (
              <div key={i.id} className="flex gap-4 bg-white rounded-2xl border border-slate-100 p-4">
                <img src={i.image} alt={i.title} className="w-24 h-24 object-cover rounded-lg" />
                <div className="flex-1">
                  <div className="font-semibold text-slate-900">{i.title}</div>
                  <div className="text-sm text-slate-500">{i.qty} tickets × {gbp(i.price)}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{gbp(i.qty * i.price)}</div>
                  <button onClick={() => remove(i.id)} className="text-slate-400 hover:text-rose-500 mt-2"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
          <div>
            <div className="bg-slate-900 text-white rounded-2xl p-6">
              <div className="flex justify-between mb-2 text-sm text-slate-300"><span>Subtotal</span><span>{gbp(total)}</span></div>
              <div className="flex justify-between mb-4 text-sm text-slate-300"><span>Fees</span><span>£0.00</span></div>
              <div className="h-px bg-slate-700 mb-4" />
              <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{gbp(total)}</span></div>
              <Button onClick={() => toast({ title: 'Checkout complete!', description: 'Good luck with the draw!' })} className="w-full mt-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 h-11">Checkout Securely</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
