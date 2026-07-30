import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Minus, Plus, Ticket, Clock, Brain, Check, X, Image as ImageIcon, ShoppingBag } from 'lucide-react';
import { countdown, percent, gbp } from '../lib/format';
import { useToast } from '../hooks/use-toast';
import { contestsAPI, walletAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import BackButton from '../components/BackButton';
import ContestLeaderboardCard from '../components/ContestLeaderboardCard';

const FALLBACK_IMG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="%23111828"/><text x="50%" y="50%" text-anchor="middle" dy=".35em" fill="%236C2BFF" font-family="sans-serif" font-size="28" font-weight="bold">Prize League</text></svg>';

function saleStatus(sold, total) {
  const pct = percent(sold, total);
  if (pct >= 100) return { label: 'Closed', pct, tone: 'bg-slate-700 text-white' };
  if (pct >= 85)  return { label: 'Almost full', pct, tone: 'bg-rose-500 text-white' };
  if (pct >= 40)  return { label: 'Selling fast', pct, tone: 'bg-amber-400 text-slate-900' };
  return { label: 'Just launched', pct, tone: 'bg-emerald-500 text-white' };
}

export default function CompetitionDetail() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [c, setC] = useState(null);
  const [t, setT] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });
  const [tickets, setTickets] = useState(1);
  const [answer, setAnswer] = useState('');
  const [verified, setVerified] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [imgState, setImgState] = useState('loading'); // loading | ok | fail
  const [wallet, setWallet] = useState(null);

  useEffect(() => { contestsAPI.get(slug).then(setC).catch(() => nav('/competitions')); }, [slug, nav]);

  useEffect(() => {
    if (!user) { setWallet(null); return; }
    walletAPI.me().then(setWallet).catch(() => setWallet(null));
  }, [user]);

  useEffect(() => {
    if (!c) return;
    const upd = () => setT(countdown(c.end_date));
    upd();
    const i = setInterval(upd, 1000);
    return () => clearInterval(i);
  }, [c]);

  const status = useMemo(() => c ? saleStatus(c.tickets_sold, c.tickets_total) : null, [c]);

  if (!c) return <div className="max-w-7xl mx-auto p-10 text-slate-500">Loading contest…</div>;

  const options = c.skill_question_options || [];
  const entryMode = c.entry_mode || 'skill_game';
  const isSkillGame = entryMode === 'skill_game';
  const subtotal = c.price * tickets;
  const balanceAfter = wallet ? Math.max(0, wallet.balance - subtotal) : null;

  const submitAnswer = async (opt) => {
    setAnswer(opt);
    try {
      const r = await contestsAPI.verifySkill(c.slug, opt);
      if (r.correct) { setVerified(true); setWrong(false); toast({ title: 'Correct!', description: 'Skill verified. You may buy tickets.' }); }
      else { setVerified(false); setWrong(true); }
    } catch { setVerified(false); }
  };

  const addToCart = () => {
    if (isSkillGame && !verified) { toast({ title: 'Answer the skill question correctly first' }); return; }
    const raw = localStorage.getItem('gamezoo_cart');
    const cart = raw ? JSON.parse(raw) : [];
    const idx = cart.findIndex(x => x.contest_id === c.contest_id);
    const item = {
      contest_id: c.contest_id, slug: c.slug, title: c.title, image: c.image,
      price: c.price, qty: tickets, skill_answer: answer || 'n/a',
      entry_mode: entryMode, added_at: new Date().toISOString(),
    };
    if (idx >= 0) { cart[idx].qty += tickets; cart[idx].skill_answer = answer || 'n/a'; }
    else cart.push(item);
    localStorage.setItem('gamezoo_cart', JSON.stringify(cart));
    toast({ title: 'Added to basket', description: `${tickets} ticket${tickets > 1 ? 's' : ''} for “${c.title}”` });
    nav('/cart');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 md:py-10" data-testid="contest-detail">
      <BackButton to="/competitions" label="All contests" className="mb-4" />
      <div className="grid lg:grid-cols-2 gap-6 lg:gap-10">
        {/* IMAGE COLUMN — dark neutral bg, object-contain, loading + fallback */}
        <div>
          <div className="relative aspect-[4/3] md:aspect-video lg:aspect-square rounded-2xl md:rounded-3xl overflow-hidden bg-[#0B0D1F] shadow-xl">
            {imgState === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center animate-pulse">
                <ImageIcon className="w-12 h-12 text-white/20" />
              </div>
            )}
            <img
              src={imgState === 'fail' ? FALLBACK_IMG : c.image}
              alt={c.title}
              onLoad={() => setImgState('ok')}
              onError={() => setImgState('fail')}
              className={`w-full h-full object-contain transition-opacity duration-300 ${imgState === 'ok' ? 'opacity-100' : 'opacity-0'}`}
              data-testid="contest-image"
            />
          </div>
        </div>

        {/* DETAILS COLUMN */}
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge className="bg-[#6C2BFF]/10 text-[#6C2BFF] hover:bg-[#6C2BFF]/10">{c.tag}</Badge>
            {c.jackpot && <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 text-white">BIG PRIZE</Badge>}
            <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100" data-testid="entry-mode-badge">
              {isSkillGame ? 'Skill Contest' : 'Random Ticket Draw'}
            </Badge>
            <Badge className={status.tone + ' border-0'} data-testid="sale-status-badge">{status.label}</Badge>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold text-slate-900 break-words">{c.title}</h1>
          <p className="text-slate-500 mt-2 break-words">{c.subtitle}</p>

          {/* Countdown */}
          <div className="mt-6 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-2 text-sm text-slate-600 mb-2"><Clock className="w-4 h-4 text-[#6C2BFF]" /> Draw ends in</div>
            <div className="flex gap-2">
              {[{k:'Days',v:t.days},{k:'Hours',v:t.hours},{k:'Mins',v:t.mins},{k:'Secs',v:t.secs}].map((x) => (
                <div key={x.k} className="flex-1 bg-white rounded-xl p-3 text-center border border-slate-100">
                  <div className="font-display font-extrabold text-2xl text-slate-900">{String(x.v).padStart(2,'0')}</div>
                  <div className="text-[10px] uppercase text-slate-500">{x.k}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Public sale progress — NO exact counts */}
          <div className="mt-6" data-testid="sale-progress">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-600">Entries sold</span>
              <span className="font-semibold text-[#6C2BFF]">{status.pct}%</span>
            </div>
            <Progress value={status.pct} className="h-2" />
          </div>

          {/* Skill Question or Random Draw notice */}
          {isSkillGame ? (
            <div className="mt-6 p-4 md:p-5 rounded-2xl border-2 border-[#6C2BFF]/20 bg-[#6C2BFF]/5">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-5 h-5 text-[#6C2BFF]" />
                <div className="font-display font-bold text-slate-900">Skill Question <span className="text-xs uppercase text-[#6C2BFF] ml-1">Required</span></div>
              </div>
              <p className="text-slate-900 font-medium mb-3 break-words">{c.skill_question_q}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {options.map(opt => {
                  const isSel = answer === opt;
                  const state = verified && isSel ? 'correct' : (wrong && isSel ? 'wrong' : 'idle');
                  return (
                    <button key={opt} onClick={() => submitAnswer(opt)} disabled={verified}
                      data-testid={`skill-option-${opt}`}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors text-left break-words ${state === 'correct' ? 'bg-emerald-500 border-emerald-500 text-white' : state === 'wrong' ? 'bg-rose-500 border-rose-500 text-white' : isSel ? 'bg-white border-[#6C2BFF] text-[#6C2BFF]' : 'bg-white border-slate-200 hover:border-[#6C2BFF]/60'}`}>
                      <span className="inline-flex items-center gap-2">
                        {state === 'correct' && <Check className="w-4 h-4" />}
                        {state === 'wrong' && <X className="w-4 h-4" />}
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>
              {wrong && <p className="text-xs text-rose-600 mt-2">Incorrect — try a different answer.</p>}
              {verified && <p className="text-xs text-emerald-700 mt-2 font-medium">✓ Skill verified. You may now purchase tickets.</p>}
            </div>
          ) : (
            <div className="mt-6 p-4 md:p-5 rounded-2xl border-2 border-amber-200 bg-amber-50" data-testid="random-ticket-info">
              <div className="flex items-center gap-2 mb-2"><Ticket className="w-5 h-5 text-amber-700" /><div className="font-display font-bold text-slate-900">Random Ticket Draw</div></div>
              <p className="text-sm text-slate-700">After successful payment, you&apos;ll be allocated unique ticket numbers server-side. A winner is drawn at random after the contest closes.</p>
            </div>
          )}

          {/* Ticket selector — mobile-safe with live totals */}
          <div className="mt-6 p-4 md:p-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <div className="text-xs text-slate-500">Price per entry</div>
                <div className="font-display font-extrabold text-2xl text-slate-900">{gbp(c.price)}</div>
              </div>
              <div className="flex items-center gap-1 md:gap-2" data-testid="ticket-qty-controls">
                <Button variant="outline" size="icon" data-testid="qty-minus" onClick={() => setTickets(Math.max(1, tickets - 1))}><Minus className="w-4 h-4" /></Button>
                <input
                  type="number"
                  data-testid="qty-input"
                  min="1"
                  max="500"
                  value={tickets}
                  onChange={(e) => setTickets(Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 1)))}
                  className="w-16 h-9 text-center rounded-md border border-slate-200 font-bold text-lg"
                />
                <Button variant="outline" size="icon" data-testid="qty-plus" onClick={() => setTickets(Math.min(500, tickets + 1))}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>

            {/* Preset quantities */}
            <div className="flex flex-wrap gap-2 mb-4" data-testid="qty-presets">
              {[1, 5, 10, 25, 50].map(n => (
                <button
                  key={n}
                  onClick={() => setTickets(n)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${tickets === n ? 'bg-[#6C2BFF] text-white border-[#6C2BFF]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#6C2BFF]/40'}`}
                >{n}</button>
              ))}
            </div>

            {/* Live summary */}
            <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-1 mb-3" data-testid="summary-box">
              <div className="flex justify-between"><span className="text-slate-500">Tickets</span><span className="font-semibold">{tickets}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-extrabold text-slate-900">{gbp(subtotal)}</span></div>
              {wallet && (
                <>
                  <div className="flex justify-between"><span className="text-slate-500">Wallet balance</span><span className="font-semibold">{gbp(wallet.balance)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">After purchase</span>
                    <span className={`font-semibold ${wallet.balance < subtotal ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {wallet.balance < subtotal ? `Need ${gbp(subtotal - wallet.balance)} more` : gbp(balanceAfter)}
                    </span>
                  </div>
                </>
              )}
            </div>

            <Button onClick={addToCart} disabled={isSkillGame && !verified} data-testid="buy-tickets-btn"
              className="w-full h-12 pl-btn-gold text-slate-900 text-base font-extrabold disabled:opacity-50 disabled:cursor-not-allowed">
              <ShoppingBag className="w-4 h-4 mr-2" /> {isSkillGame && !verified ? 'Answer skill question first' : `Buy ${tickets} ticket${tickets > 1 ? 's' : ''} → Basket`}
            </Button>
            <p className="text-[11px] text-slate-500 text-center mt-2"><Link to="/free-entry" className="text-[#6C2BFF] hover:underline">Free postal entry route</Link> available — no purchase necessary.</p>
          </div>

          {/* Contest T&Cs accordion — auto-generated from admin fields */}
          <Accordion type="single" collapsible className="mt-6 rounded-2xl border border-slate-200 bg-white px-4" data-testid="contest-terms">
            <AccordionItem value="overview" className="border-slate-100">
              <AccordionTrigger className="font-semibold text-slate-900">Contest overview</AccordionTrigger>
              <AccordionContent className="text-sm text-slate-600">{c.subtitle || c.title}</AccordionContent>
            </AccordionItem>
            <AccordionItem value="prize" className="border-slate-100">
              <AccordionTrigger className="font-semibold text-slate-900">Prize &amp; value</AccordionTrigger>
              <AccordionContent className="text-sm text-slate-600 space-y-1">
                <div><strong>Prize:</strong> {c.title}</div>
                <div><strong>Value:</strong> {gbp(c.prize_amount)}</div>
                <div><strong>Distribution:</strong> Paid to the verified winner within 14 days per T&amp;Cs.</div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="dates" className="border-slate-100">
              <AccordionTrigger className="font-semibold text-slate-900">Opening &amp; closing</AccordionTrigger>
              <AccordionContent className="text-sm text-slate-600 space-y-1">
                <div><strong>Status:</strong> {c.status}</div>
                <div><strong>Closes:</strong> {new Date(c.end_date).toLocaleString('en-GB')}</div>
                <div><strong>Draw:</strong> Within 24 hours of closing.</div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="entry" className="border-slate-100">
              <AccordionTrigger className="font-semibold text-slate-900">Entry rules &amp; price</AccordionTrigger>
              <AccordionContent className="text-sm text-slate-600 space-y-1">
                <div><strong>Entry price:</strong> {gbp(c.price)} per ticket</div>
                <div><strong>Entry mode:</strong> {isSkillGame ? 'Skill game — best valid score wins' : 'Random ticket draw'}</div>
                <div><strong>Free postal entry:</strong> Available — see the <Link to="/free-entry" className="text-[#6C2BFF] underline">free entry route</Link>.</div>
              </AccordionContent>
            </AccordionItem>
            {isSkillGame && (
              <AccordionItem value="game" className="border-slate-100">
                <AccordionTrigger className="font-semibold text-slate-900">Skill game &amp; scoring</AccordionTrigger>
                <AccordionContent className="text-sm text-slate-600 space-y-1">
                  <div><strong>Game:</strong> {c.game_type ? c.game_type.replace(/_/g, ' ') : 'Assigned after purchase'}</div>
                  <div><strong>Attempts per ticket:</strong> {c.max_attempts || 3}</div>
                  <div><strong>Scoring:</strong> Highest valid score. Ties broken by earliest valid submission time.</div>
                </AccordionContent>
              </AccordionItem>
            )}
            <AccordionItem value="eligibility" className="border-slate-100">
              <AccordionTrigger className="font-semibold text-slate-900">Eligibility &amp; age</AccordionTrigger>
              <AccordionContent className="text-sm text-slate-600 space-y-1">
                <div><strong>Age:</strong> 18+ only. Photo ID may be required for prize payout.</div>
                <div><strong>Geography:</strong> UK residents only.</div>
                <div><strong>Restrictions:</strong> Staff, contractors, and their household members are excluded.</div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="fraud" className="border-slate-100">
              <AccordionTrigger className="font-semibold text-slate-900">Anti-fraud &amp; disqualification</AccordionTrigger>
              <AccordionContent className="text-sm text-slate-600">
                Multiple accounts, bot activity, payment fraud, or manipulated game scores may result in immediate disqualification and forfeited prize. All scores are server-validated. Please play responsibly.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="privacy" className="border-slate-100">
              <AccordionTrigger className="font-semibold text-slate-900">Data &amp; privacy</AccordionTrigger>
              <AccordionContent className="text-sm text-slate-600">
                Your data is handled per our <Link to="/privacy" className="text-[#6C2BFF] underline">Privacy Policy</Link>. Winners consent to public announcement of first name + partial ticket number unless they opt out.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      {/* Live leaderboard section removed — per launch spec, results appear only after the contest closes on the Winners page. */}
    </div>
  );
}
