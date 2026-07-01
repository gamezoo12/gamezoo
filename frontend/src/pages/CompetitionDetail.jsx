import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { COMPETITIONS } from '../mock/mockData';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { Minus, Plus, Ticket, Clock, ShieldCheck, Zap, Award } from 'lucide-react';
import { countdown, percent, gbp } from '../lib/format';
import { useToast } from '../hooks/use-toast';

export default function CompetitionDetail() {
  const { slug } = useParams();
  const c = COMPETITIONS.find(x => x.slug === slug) || COMPETITIONS[0];
  const [t, setT] = useState(countdown(c.endDate));
  const [tickets, setTickets] = useState(5);
  const [answer, setAnswer] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    const i = setInterval(() => setT(countdown(c.endDate)), 1000);
    return () => clearInterval(i);
  }, [c.endDate]);

  const pct = percent(c.ticketsSold, c.ticketsTotal);

  const addToCart = () => {
    if (!answer) { toast({ title: 'Answer required', description: 'Please answer the skill question first.' }); return; }
    toast({ title: 'Added to basket', description: `${tickets} tickets for “${c.title}”` });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
      <div className="grid lg:grid-cols-2 gap-10">
        <div>
          <div className="aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-teal-50 to-emerald-50 shadow-xl">
            <img src={c.image} alt={c.title} className="w-full h-full object-cover" />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="aspect-square rounded-xl bg-slate-100 overflow-hidden"><img src={c.image} alt="" className="w-full h-full object-cover" /></div>
            <div className="aspect-square rounded-xl bg-slate-100 overflow-hidden"><img src={c.image} alt="" className="w-full h-full object-cover" /></div>
            <div className="aspect-square rounded-xl bg-slate-100 overflow-hidden"><img src={c.image} alt="" className="w-full h-full object-cover" /></div>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-100">{c.tag}</Badge>
            {c.jackpot && <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 text-white">JACKPOT</Badge>}
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold text-slate-900">{c.title}</h1>
          <p className="text-slate-500 mt-2">{c.subtitle}</p>

          <div className="mt-6 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-2 text-sm text-slate-600 mb-2"><Clock className="w-4 h-4 text-teal-600" /> Draw ends in</div>
            <div className="flex gap-2">
              {[{k:'Days',v:t.days},{k:'Hours',v:t.hours},{k:'Mins',v:t.mins},{k:'Secs',v:t.secs}].map((x) => (
                <div key={x.k} className="flex-1 bg-white rounded-xl p-3 text-center border border-slate-100">
                  <div className="font-display font-extrabold text-2xl text-slate-900">{String(x.v).padStart(2,'0')}</div>
                  <div className="text-[10px] uppercase text-slate-500">{x.k}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-600">{c.ticketsSold.toLocaleString()} / {c.ticketsTotal.toLocaleString()} tickets</span>
              <span className="font-semibold text-teal-600">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>

          <div className="mt-6 p-5 rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs text-slate-500">Price per entry</div>
                <div className="font-display font-extrabold text-2xl text-slate-900">{gbp(c.price)}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setTickets(Math.max(1, tickets - 1))}><Minus className="w-4 h-4" /></Button>
                <div className="min-w-[3rem] text-center font-bold text-lg">{tickets}</div>
                <Button variant="outline" size="icon" onClick={() => setTickets(tickets + 1)}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Skill Question: What is 5 + 3?</label>
              <select value={answer} onChange={(e) => setAnswer(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="">Select an answer</option>
                <option value="6">6</option>
                <option value="7">7</option>
                <option value="8">8</option>
                <option value="9">9</option>
              </select>
            </div>
            <Button onClick={addToCart} className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white text-base font-bold">
              <Ticket className="w-4 h-4 mr-2" /> Add to basket • {gbp(c.price * tickets)}
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-6 text-center">
            <div className="p-3 rounded-xl bg-slate-50"><Zap className="w-5 h-5 mx-auto text-teal-600 mb-1" /><div className="text-xs text-slate-600">Fast payouts</div></div>
            <div className="p-3 rounded-xl bg-slate-50"><ShieldCheck className="w-5 h-5 mx-auto text-teal-600 mb-1" /><div className="text-xs text-slate-600">Verified draws</div></div>
            <div className="p-3 rounded-xl bg-slate-50"><Award className="w-5 h-5 mx-auto text-teal-600 mb-1" /><div className="text-xs text-slate-600">Real winners</div></div>
          </div>

          <Link to="/competitions" className="inline-block text-sm text-teal-600 hover:underline mt-6">← Back to all competitions</Link>
        </div>
      </div>
    </div>
  );
}
