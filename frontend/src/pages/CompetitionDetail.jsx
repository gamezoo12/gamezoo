import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { Minus, Plus, Ticket, Clock, Brain, Check, X, Image as ImageIcon, ShoppingBag } from 'lucide-react';
import { countdown, percent, gbp, tokens as fmtTokens, tokenCount } from '../lib/format';
import { useToast } from '../hooks/use-toast';
import { contestsAPI, walletAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import BackButton from '../components/BackButton';

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
  // Dynamic skill-challenge state — question + signed token + options come
  // from GET /contests/{slug}/skill-challenge and are refreshed on wrong
  // answers or manual "New question" clicks.
  const [challenge, setChallenge] = useState(null);   // { question, options, challenge_token, op, difficulty }
  const [challengeLoading, setChallengeLoading] = useState(false);
  // Mandatory "Before you buy" confirmation — must be ticked before the Buy
  // button becomes active. Resets when the user changes contest.
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => { contestsAPI.get(slug).then(setC).catch(() => nav('/competitions')); }, [slug, nav]);

  // Fetch a fresh skill challenge whenever the contest slug changes and this
  // is a skill-game contest. We deliberately DO NOT depend on `c` here because
  // fetching a challenge is cheap and the endpoint is idempotent.
  const loadChallenge = async () => {
    setChallengeLoading(true);
    try {
      const r = await contestsAPI.skillChallenge(slug);
      setChallenge(r);
      setAnswer('');
      setWrong(false);
      setVerified(false);
    } catch (err) {
      // Non-fatal — page falls back to the legacy static question if available.
      setChallenge(null);
    } finally {
      setChallengeLoading(false);
    }
  };
  useEffect(() => { if (c && (c.entry_mode || 'skill_game') === 'skill_game') loadChallenge(); /* eslint-disable-next-line */ }, [slug, c?.entry_mode]);

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

  // Prefer the dynamic per-visitor challenge; fall back to the legacy static
  // question ONLY when the backend didn't hand us a challenge (e.g. contests
  // pre-dating the dynamic engine).
  const questionText = challenge?.question || c.skill_question_q || '';
  const options = challenge?.options || c.skill_question_options || [];
  const entryMode = c.entry_mode || 'skill_game';
  const isSkillGame = entryMode === 'skill_game';
  const subtotal = c.price * tickets;
  const balanceAfter = wallet ? Math.max(0, wallet.balance - subtotal) : null;

  const submitAnswer = async (opt) => {
    setAnswer(opt);
    try {
      const r = await contestsAPI.verifySkill(c.slug, opt, challenge?.challenge_token);
      if (r.correct) {
        setVerified(true); setWrong(false);
        toast({ title: 'Correct!', description: 'Skill verified. You may buy tickets.' });
      } else {
        setVerified(false); setWrong(true);
      }
    } catch { setVerified(false); }
  };

  const addToCart = () => {
    if (isSkillGame && !verified) { toast({ title: 'Answer the skill question correctly first' }); return; }
    const raw = localStorage.getItem('gamezoo_cart');
    const cart = raw ? JSON.parse(raw) : [];
    const idx = cart.findIndex(x => x.contest_id === c.contest_id);
    const token = challenge?.challenge_token || null;
    const item = {
      contest_id: c.contest_id, slug: c.slug, title: c.title, image: c.image,
      price: c.price, qty: tickets, skill_answer: answer || 'n/a',
      challenge_token: token,
      entry_mode: entryMode, added_at: new Date().toISOString(),
    };
    if (idx >= 0) {
      cart[idx].qty += tickets;
      cart[idx].skill_answer = answer || 'n/a';
      cart[idx].challenge_token = token;
    } else {
      cart.push(item);
    }
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
            <div className="mt-6 p-4 md:p-5 rounded-2xl border-2 border-[#6C2BFF]/20 bg-[#6C2BFF]/5" data-testid="skill-question-block">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Brain className="w-5 h-5 text-[#6C2BFF]" />
                <div className="font-display font-bold text-slate-900">Skill Question <span className="text-xs uppercase text-[#6C2BFF] ml-1">Required</span></div>
                {challenge?.op && (
                  <span className="text-[10px] uppercase tracking-wider bg-white border border-[#6C2BFF]/20 text-[#6C2BFF] px-1.5 py-0.5 rounded-full font-bold" data-testid="skill-op-badge">
                    {challenge.op}
                    {challenge.difficulty ? ` · ${challenge.difficulty}` : ''}
                  </span>
                )}
                <button
                  type="button"
                  onClick={loadChallenge}
                  disabled={challengeLoading || verified}
                  className="ml-auto text-xs text-[#6C2BFF] hover:underline disabled:opacity-40"
                  data-testid="new-question-btn"
                >
                  {challengeLoading ? 'Loading…' : 'New question'}
                </button>
              </div>
              <p className="text-slate-900 font-semibold text-lg mb-3 break-words font-mono" data-testid="skill-question-text">
                {questionText || 'Loading question…'}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {options.map(opt => {
                  const isSel = String(answer) === String(opt);
                  const state = verified && isSel ? 'correct' : (wrong && isSel ? 'wrong' : 'idle');
                  return (
                    <button key={opt} onClick={() => submitAnswer(opt)} disabled={verified}
                      data-testid={`skill-option-${opt}`}
                      className={`px-3 py-2 rounded-lg text-sm font-bold border-2 transition-colors ${state === 'correct' ? 'bg-emerald-500 border-emerald-500 text-white' : state === 'wrong' ? 'bg-rose-500 border-rose-500 text-white' : isSel ? 'bg-white border-[#6C2BFF] text-[#6C2BFF]' : 'bg-white border-slate-200 hover:border-[#6C2BFF]/60'}`}>
                      <span className="inline-flex items-center gap-2 justify-center">
                        {state === 'correct' && <Check className="w-4 h-4" />}
                        {state === 'wrong' && <X className="w-4 h-4" />}
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>
              {wrong && (
                <p className="text-xs text-rose-600 mt-2">
                  Incorrect. Click <button type="button" onClick={loadChallenge} className="underline font-semibold hover:text-rose-700">New question</button> to try another one.
                </p>
              )}
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
                <div className="text-xs text-slate-500">Cost per entry</div>
                <div className="font-display font-extrabold text-2xl text-slate-900 flex items-baseline gap-1">
                  <span>{tokenCount(c.price)}</span>
                  <span className="text-sm text-slate-500 font-bold">🪙</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">= {gbp(c.price)}</div>
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
              <div className="flex justify-between"><span className="text-slate-500">Total cost</span><span className="font-extrabold text-slate-900">{fmtTokens(subtotal)}</span></div>
              {wallet && (
                <>
                  <div className="flex justify-between"><span className="text-slate-500">Your tokens</span><span className="font-semibold">{fmtTokens(wallet.tokens ?? wallet.balance)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">After purchase</span>
                    <span className={`font-semibold ${wallet.balance < subtotal ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {wallet.balance < subtotal ? `Need ${fmtTokens(subtotal - wallet.balance)} more` : fmtTokens(balanceAfter)}
                    </span>
                  </div>
                </>
              )}
            </div>

            <label className="flex items-start gap-2 mb-3 text-xs text-slate-600 cursor-pointer" data-testid="before-you-buy">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                data-testid="before-you-buy-check"
                className="mt-0.5 w-4 h-4 accent-[#6C2BFF]"
              />
              <span>
                <strong>Before you buy —</strong> I confirm I have read the contest information above, I&apos;m aged 18+ and resident in the UK, I understand that I am purchasing {tickets} entry ticket{tickets > 1 ? 's' : ''} to <em>{c.title}</em> for <strong>{gbp(subtotal)}</strong>, and I accept the {' '}
                <Link to="/legal/terms" className="text-[#6C2BFF] underline">Terms &amp; Conditions</Link>.
              </span>
            </label>

            <Button
              onClick={addToCart}
              disabled={(isSkillGame && !verified) || !confirmed}
              data-testid="buy-tickets-btn"
              className="w-full h-12 pl-btn-gold text-slate-900 text-base font-extrabold disabled:opacity-50 disabled:cursor-not-allowed">
              <ShoppingBag className="w-4 h-4 mr-2" /> {isSkillGame && !verified
                ? 'Answer skill question first'
                : (!confirmed ? 'Tick the confirmation to buy' : `Buy ${tickets} ticket${tickets > 1 ? 's' : ''} → Basket`)}
            </Button>
            <Link to={`/results/${c.slug}`} className="block mt-2" data-testid="see-results-link">
              <Button variant="outline" className="w-full h-10 text-sm">
                🏆 See results &amp; leaderboard
              </Button>
            </Link>
            <p className="text-[11px] text-slate-500 text-center mt-2"><Link to="/free-entry" className="text-[#6C2BFF] hover:underline">Free postal entry route</Link> available — no purchase necessary.</p>
          </div>

          {/* Contest T&Cs — single long-scroll list per admin-editable fields */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6" data-testid="contest-terms">
            <h2 className="font-display font-extrabold text-xl text-slate-900 mb-4">Contest information &amp; rules</h2>
            <ol className="space-y-4 text-sm text-slate-700 leading-relaxed list-decimal list-outside pl-5" data-testid="contest-info-list">
              {[
                ['Contest overview', c.full_description || c.short_description || c.subtitle || c.title],
                ['How to enter', c.how_to_enter || `Buy at least one entry ticket at ${gbp(c.price)} and complete the required skill task. A free postal entry route is also available where enabled by the operator.`],
                ['Skill game instructions', c.skill_instructions || (isSkillGame ? `Complete the ${c.game_type ? c.game_type.replace(/_/g, ' ') : 'assigned skill task'} within the allowed attempts. Your best valid score counts.` : 'Answer the skill question correctly to become eligible.')],
                ['Eligibility', c.eligibility || 'Open to UK residents aged 18 or over. Staff, contractors and their household members are excluded from prize eligibility.'],
                ['Ticket price', `${gbp(c.price)} per entry ticket.`],
                ['Total ticket allocation', `${c.tickets_total} tickets available in this competition.`],
                ['Maximum entries per user', c.max_tickets_per_user ? `${c.max_tickets_per_user} tickets per person.` : 'Reasonable limits may be enforced by the operator to prevent misuse.'],
                ['Free postal entry availability', c.free_postal_entry_available ? 'Available for this competition.' : 'Not available for this competition.'],
                ['Free postal entry instructions', c.free_postal_entry_instructions || 'See the Free Postal Entry Policy for the current instructions and postal address.'],
                ['Contest opening date', c.open_date ? new Date(c.open_date).toLocaleString('en-GB') : 'This contest is currently open.'],
                ['Contest closing date', c.end_date ? new Date(c.end_date).toLocaleString('en-GB') : '—'],
                ['Draw / result date', c.draw_date ? new Date(c.draw_date).toLocaleString('en-GB') : 'Within 24 hours of closing.'],
                ['Prize details', c.prize_details || `Grand prize: ${gbp(c.prize_amount)}.`],
                ['Number of prizes', String(c.num_prizes || 1)],
                ['Prize values', c.prize_values || `Total prize pool value: ${gbp(c.prize_amount)}.`],
                ['Winner determination', c.winner_method || (c.engine_type === 'leaderboard' ? 'Highest verified skill-game score at contest close.' : 'Determined per the engine described on this page.')],
                ['Scoring method', c.scoring_method || 'Points based on accuracy, correctness and completion time as configured by the operator.'],
                ['Tie-break method', c.tiebreak_method || '1) Higher points 2) Higher accuracy 3) Faster valid completion 4) Earlier submission timestamp.'],
                ['Result verification', c.verification_method || 'Every winning score is independently server-verified before the prize is released.'],
                ['Prize credit timeframe', c.prize_credit_timeframe || 'Prizes are credited within 5-10 UK business days following identity verification.'],
                ['Refund conditions', c.refund_conditions || 'Refund requests must be submitted before the contest closing time. See our Refund Policy.'],
                ['Important information', c.important_info || 'Please review the linked Terms & Conditions and Privacy Policy before entering.'],
                ['Contest-specific rules', c.contest_rules || 'Standard Competition Terms apply. Any contest-specific rule stated by the operator overrides this template.'],
                ['Terms acknowledgement', c.terms_acknowledgement || 'By entering you confirm you are 18+, resident in the UK, and accept the Prize League Terms & Conditions and Privacy Policy.'],
                ['Country restrictions', c.country_restrictions || 'United Kingdom only.'],
                ['Age restrictions', c.age_restriction || '18+ only.'],
                ['Anti-fraud', 'Multiple accounts, bot activity, payment fraud or manipulated scores may result in immediate disqualification and forfeited prize.'],
                ['Data & privacy', <>Your data is handled per our <Link key="pp" to="/legal/privacy" className="text-[#6C2BFF] underline">Privacy Policy</Link>.</>],
                ['Complaints', <>See our <Link key="cx" to="/legal/complaints" className="text-[#6C2BFF] underline">Complaints Policy</Link> — you can raise a concern via support@prizeleague.co.uk.</>],
                ['Full Terms & Conditions', <><Link key="tc" to="/legal/terms" className="text-[#6C2BFF] underline">Read the full Terms &amp; Conditions</Link> before entering.</>],
              ].map(([title, body], i) => (
                <li key={i} data-testid={`contest-info-item-${i}`}>
                  <div className="font-bold text-slate-900">{title}</div>
                  <div className="mt-0.5 whitespace-pre-wrap">{body}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* Live leaderboard section removed — per launch spec, results appear only after the contest closes on the Winners page. */}
    </div>
  );
}
