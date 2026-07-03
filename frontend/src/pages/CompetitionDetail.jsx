import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { Minus, Plus, Ticket, Clock, ShieldCheck, Zap, Award, Brain, Check, X } from 'lucide-react';
import { countdown, percent, gbp } from '../lib/format';
import { useToast } from '../hooks/use-toast';
import { contestsAPI } from '../lib/api';
import BackButton from '../components/BackButton';

export default function CompetitionDetail() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const [c, setC] = useState(null);
  const [t, setT] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });
  const [tickets, setTickets] = useState(1);
  const [answer, setAnswer] = useState('');
  const [verified, setVerified] = useState(false);
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    contestsAPI.get(slug).then(setC).catch(() => nav('/competitions'));
  }, [slug, nav]);

  useEffect(() => {
    if (!c) return;
    const upd = () => setT(countdown(c.end_date));
    upd();
    const i = setInterval(upd, 1000);
    return () => clearInterval(i);
  }, [c]);

  if (!c) {
    return <div className="max-w-7xl mx-auto p-10 text-slate-500">Loading contest…</div>;
  }

  const pct = percent(c.tickets_sold, c.tickets_total);
  const options = c.skill_question_options || [];

  const submitAnswer = async (opt) => {
    setAnswer(opt);
    try {
      const r = await contestsAPI.verifySkill(c.slug, opt);
      if (r.correct) { setVerified(true); setWrong(false); toast({ title: 'Correct!', description: 'Skill verified. You may buy tickets.' }); }
      else { setVerified(false); setWrong(true); }
    } catch { setVerified(false); }
  };

  const addToCart = () => {
    if (!verified) { toast({ title: 'Answer the skill question correctly first' }); return; }
    const raw = localStorage.getItem('gamezoo_cart');
    const cart = raw ? JSON.parse(raw) : [];
    const idx = cart.findIndex(x => x.contest_id === c.contest_id);
    const item = { contest_id: c.contest_id, slug: c.slug, title: c.title, image: c.image, price: c.price, qty: tickets, skill_answer: answer };
    if (idx >= 0) { cart[idx].qty += tickets; cart[idx].skill_answer = answer; }
    else cart.push(item);
    localStorage.setItem('gamezoo_cart', JSON.stringify(cart));
    toast({ title: 'Added to basket', description: `${tickets} ticket${tickets > 1 ? 's' : ''} for “${c.title}”` });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
      <BackButton to="/competitions" label="All contests" className="mb-4" />
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
              <span className="text-slate-600">{c.tickets_sold.toLocaleString()} / {c.tickets_total.toLocaleString()} tickets</span>
              <span className="font-semibold text-teal-600">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>

          <div className="mt-6 p-5 rounded-2xl border-2 border-teal-200 bg-teal-50/50">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-5 h-5 text-teal-600" />
              <div className="font-display font-bold text-slate-900">Skill Question <span className="text-xs uppercase text-teal-600 ml-1">Required</span></div>
            </div>
            <p className="text-slate-900 font-medium mb-3">{c.skill_question_q}</p>
            <div className="grid grid-cols-2 gap-2">
              {options.map(opt => {
                const isSel = answer === opt;
                const state = verified && isSel ? 'correct' : (wrong && isSel ? 'wrong' : 'idle');
                return (
                  <button key={opt} onClick={() => submitAnswer(opt)} disabled={verified}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors text-left ${state === 'correct' ? 'bg-emerald-500 border-emerald-500 text-white' : state === 'wrong' ? 'bg-rose-500 border-rose-500 text-white' : isSel ? 'bg-white border-teal-500 text-teal-700' : 'bg-white border-slate-200 hover:border-teal-400'}`}>
                    <span className="inline-flex items-center gap-2">
                      {state === 'correct' && <Check className="w-4 h-4" />}
                      {state === 'wrong' && <X className="w-4 h-4" />}
                      {opt}
                    </span>
                  </button>
                );
              })}
            </div>
            {wrong && <p className="text-xs text-rose-600 mt-2">Incorrect &ndash; try a different answer.</p>}
            {verified && <p className="text-xs text-emerald-700 mt-2 font-medium">&#10003; Skill verified. You may now purchase tickets.</p>}
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
              <Ticket className="w-4 h-4 mr-2" /> {verified ? 'Add to basket' : 'Answer skill question first'} &bull; {gbp(c.price * tickets)}
            </Button>
            <p className="text-[11px] text-slate-500 text-center mt-2"><a href="/free-entry" className="text-teal-600 hover:underline">Free postal entry route</a> available – no purchase necessary.</p>
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
