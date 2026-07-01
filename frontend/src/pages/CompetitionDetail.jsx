import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { COMPETITIONS } from '../mock/mockData';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { Minus, Plus, Ticket, Clock, ShieldCheck, Zap, Award, Brain, Check, X } from 'lucide-react';
import { countdown, percent, gbp } from '../lib/format';
import { useToast } from '../hooks/use-toast';

export default function CompetitionDetail() {
  const { slug } = useParams();
  const c = COMPETITIONS.find(x => x.slug === slug) || COMPETITIONS[0];
  const [t, setT] = useState(countdown(c.endDate));
  const [tickets, setTickets] = useState(1);
  const [answer, setAnswer] = useState('');
  const [verified, setVerified] = useState(false);
  const [wrong, setWrong] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const i = setInterval(() => setT(countdown(c.endDate)), 1000);
    return () => clearInterval(i);
  }, [c.endDate]);

  useEffect(() => { setVerified(false); setWrong(false); setAnswer(''); }, [c.id]);

  const pct = percent(c.ticketsSold, c.ticketsTotal);
  const q = c.skillQuestion;

  const submitAnswer = (opt) => {
    setAnswer(opt);
    if (opt === q.answer) { setVerified(true); setWrong(false); toast({ title: 'Correct!', description: 'Skill verified. You can now buy tickets.' }); }
    else { setWrong(true); setVerified(false); }
  };

  const addToCart = () => {
    if (!verified) { toast({ title: 'Answer skill question first', description: 'You must correctly answer to be eligible.' }); return; }
    const raw = localStorage.getItem('gamezoo_cart');
    const cart = raw ? JSON.parse(raw) : [];
    const idx = cart.findIndex(x => x.id === c.id);
    if (idx >= 0) cart[idx].qty += tickets; else cart.push({ id: c.id, slug: c.slug, title: c.title, image: c.image, price: c.price, qty: tickets });
    localStorage.setItem('gamezoo_cart', JSON.stringify(cart));
    toast({ title: 'Added to basket', description: `${tickets} ticket${tickets > 1 ? 's' : ''} for “${c.title}”` });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
      <div className="grid lg:grid-cols-2 gap-10">
        <div>
          <div className="aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-teal-50 to-emerald-50 shadow-xl">
            <img src={c.image} alt={c.title} className="w-full h-full object-cover" />
          </div>
        </div>

        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-100">{c.tag}</Badge>
            {c.jackpot && <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 text-white">JACKPOT</Badge>}
            <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Skill Contest</Badge>
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

          <div className="mt-6 p-5 rounded-2xl border-2 border-teal-200 bg-teal-50/50">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-5 h-5 text-teal-600" />
              <div className="font-display font-bold text-slate-900">Skill Question <span className="text-xs uppercase text-teal-600 ml-1">Required</span></div>
            </div>
            <p className="text-slate-900 font-medium mb-3">{q.q}</p>
            <div className="grid grid-cols-2 gap-2">
              {q.options.map(opt => {
                const isSel = answer === opt;
                const state = verified && isSel ? 'correct' : (wrong && isSel ? 'wrong' : 'idle');
                return (
                  <button key={opt} onClick={() => submitAnswer(opt)} disabled={verified}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors text-left ${state === 'correct' ? 'bg-emerald-500 border-emerald-500 text-white' : state === 'wrong' ? 'bg-rose-500 border-rose-500 text-white' : isSel ? 'bg-white border-teal-500 text-teal-700' : 'bg-white border-slate-200 hover:border-teal-400'}`}>
                    <span className="inline-flex items-center gap-2">
                      {state === 'correct' && <Check className="w-4 h-4" />} {state === 'wrong' && <X className="w-4 h-4" />} {opt}
                    </span>
                  </button>
                );
              })}
            </div>
            {wrong && <p className="text-xs text-rose-600 mt-2">Try again – a correct answer is required to enter.</p>}
            {verified && <p className="text-xs text-emerald-700 mt-2 font-medium">✓ Skill verified. You may now purchase tickets.</p>}
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
            <Button onClick={addToCart} disabled={!verified} className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white text-base font-bold disabled:opacity-50 disabled:cursor-not-allowed">
              <Ticket className="w-4 h-4 mr-2" /> {verified ? 'Add to basket' : 'Answer skill question first'} • {gbp(c.price * tickets)}
            </Button>
            <p className="text-[11px] text-slate-500 text-center mt-2">Free postal entry route available – see FAQ.</p>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-6 text-center">
            <div className="p-3 rounded-xl bg-slate-50"><Zap className="w-5 h-5 mx-auto text-teal-600 mb-1" /><div className="text-xs text-slate-600">Fast payouts</div></div>
            <div className="p-3 rounded-xl bg-slate-50"><ShieldCheck className="w-5 h-5 mx-auto text-teal-600 mb-1" /><div className="text-xs text-slate-600">Verified draws</div></div>
            <div className="p-3 rounded-xl bg-slate-50"><Award className="w-5 h-5 mx-auto text-teal-600 mb-1" /><div className="text-xs text-slate-600">Skill-based</div></div>
          </div>

          <Link to="/competitions" className="inline-block text-sm text-teal-600 hover:underline mt-6">← Back to all contests</Link>
        </div>
      </div>
    </div>
  );
}
