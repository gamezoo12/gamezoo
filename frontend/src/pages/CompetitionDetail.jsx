import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Minus, Plus, Ticket, Clock, Brain, Check, X, Image as ImageIcon, ShoppingBag, Mail, ChevronRight, CheckCircle2 } from 'lucide-react';
import TokenIcon from '../components/TokenIcon';
import { countdown, percent, exactTokens } from '../lib/format';
import { tokenPrice } from '../lib/format';
import { useToast } from '../hooks/use-toast';
import { contestsAPI, instantWinsAPI, ordersAPI, walletAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import BackButton from '../components/BackButton';
import { COMPETITION_SECTIONS, competitionSectionOf } from '../lib/competitionSections';
import ShareMenu from '../components/ShareMenu';
import { resolveMediaUrl } from '../lib/media';

const FALLBACK_IMG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="%23111828"/><text x="50%" y="50%" text-anchor="middle" dy=".35em" fill="%236C2BFF" font-family="sans-serif" font-size="28" font-weight="bold">Prize League</text></svg>';

function saleStatus(sold, total) {
  const pct = percent(sold, total);
  if (pct >= 100) return { label: 'Closed', pct, tone: 'bg-slate-700 text-white' };
  if (pct >= 85)  return { label: 'Almost full', pct, tone: 'bg-rose-500 text-white' };
  if (pct >= 40)  return { label: 'Selling fast', pct, tone: 'bg-amber-400 text-slate-900' };
  return { label: 'Just launched', pct, tone: 'bg-emerald-500 text-white' };
}

function MiniContest({ contest, selectedQty = 0, onAdd }) {
  const [quantity, setQuantity] = useState(selectedQty || 1);
  const [added, setAdded] = useState(selectedQty > 0);
  useEffect(() => {
    setQuantity(selectedQty || 1);
    setAdded(selectedQty > 0);
  }, [selectedQty]);
  const left = Math.max(0, Number(contest.tickets_total || 0) - Number(contest.tickets_sold || 0));
  const userLimit = Math.max(0, Number(contest.max_tickets_per_user || 0));
  const maxQuantity = Math.max(0, Math.min(500, left, userLimit || 500));
  const sold = percent(contest.tickets_sold, contest.tickets_total);
  const updateQuantity = (value) => {
    setQuantity(Math.max(0, Math.min(maxQuantity, Number(value) || 0)));
    setAdded(false);
  };
  const add = () => {
    if (onAdd(contest, quantity) !== false) setAdded(quantity > 0);
  };

  return (
    <article className="w-[calc(50%-0.25rem)] min-w-[calc(50%-0.25rem)] snap-start overflow-hidden border border-slate-200 bg-white" data-testid={`mini-contest-${contest.contest_id}`} data-selected-quantity={added ? quantity : 0}>
      <Link to={`/competition/${contest.slug}`} className="relative block h-28 bg-[#161433] sm:h-32" aria-label={`Open ${contest.title}`}>
        <img src={resolveMediaUrl(contest.image)} alt={contest.title} className="h-full w-full object-contain" loading="lazy" />
      </Link>
      <div className="px-1.5 py-1.5">
        <h4 className="truncate whitespace-nowrap text-[11px] font-black leading-4 text-slate-900">{contest.title}</h4>
        <div className="mt-1 flex items-center justify-between gap-1 text-[9px] font-bold text-slate-500">
          <span>{left.toLocaleString()} left</span><span>{sold}% sold</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${sold}%` }} /></div>
        <div className="mt-1.5 flex items-center justify-between gap-1 text-[10px] font-bold text-slate-700">
          <span><TokenIcon className="mr-0.5 inline h-3 w-3" />{tokenPrice(contest.price)} token{Number(contest.price) === 1 ? '' : 's'} · £{Number(contest.price || 0).toFixed(2)}</span>
          <span className="font-black text-slate-900">{exactTokens(Number(contest.price || 0) * quantity)}</span>
        </div>
        <div className="mt-1 text-[9px] font-bold text-slate-500">You can add up to {maxQuantity.toLocaleString()} ticket{maxQuantity === 1 ? '' : 's'}.</div>
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-1">
          <div className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)_24px] items-center border border-slate-200">
            <button type="button" onClick={() => updateQuantity(quantity - 1)} className="grid h-7 place-items-center text-slate-700" aria-label={`Decrease ${contest.title} tickets`}><Minus className="h-3 w-3" /></button>
            <input type="number" min="0" max={maxQuantity} value={quantity} onChange={event => updateQuantity(event.target.value)} className="h-7 min-w-0 w-full border-x border-slate-200 text-center text-xs font-black outline-none" aria-label={`${contest.title} ticket quantity`} />
            <button type="button" disabled={quantity >= maxQuantity} onClick={() => updateQuantity(quantity + 1)} className="grid h-7 place-items-center text-slate-700 disabled:opacity-30" aria-label={`Increase ${contest.title} tickets`}><Plus className="h-3 w-3" /></button>
          </div>
          <button type="button" onClick={add} disabled={maxQuantity === 0} className="flex h-7 items-center justify-center bg-[#FFD54A] px-2 text-[9px] font-black whitespace-nowrap text-slate-900 disabled:opacity-40">
            {quantity === 0 ? 'Remove' : added ? <><CheckCircle2 className="mr-0.5 h-3 w-3" /> {quantity} added</> : 'Add'}
          </button>
        </div>
      </div>
    </article>
  );
}

function RecommendationRail({ items, selectedItems, onAdd }) {
  if (!items.length) return null;
  return (
    <section className="mt-3" data-testid="more-contests">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-sm font-black text-slate-900">More Contests</h3>
        <span className="flex items-center whitespace-nowrap text-[9px] font-bold uppercase text-slate-400">Swipe <ChevronRight className="h-3 w-3" /></span>
      </div>
      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1" data-testid="more-contest-list">
        {items.map(contest => <MiniContest key={contest.contest_id} contest={contest} selectedQty={Number(selectedItems.find(item => item.contest_id === contest.contest_id)?.qty || 0)} onAdd={onAdd} />)}
      </div>
    </section>
  );
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
  const [ticketAvailability, setTicketAvailability] = useState(null);
  const [instantStatus, setInstantStatus] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [basketItems, setBasketItems] = useState([]);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  // Dynamic skill-challenge state - question + signed token + options come
  // from GET /contests/{slug}/skill-challenge and are refreshed on wrong
  // answers or manual "New question" clicks.
  const [challenge, setChallenge] = useState(null);   // { question, options, challenge_token, op, difficulty }
  const [challengeLoading, setChallengeLoading] = useState(false);
  // Mandatory "Before you buy" confirmation - must be ticked before the Buy
  // button becomes active. Resets when the user changes contest.
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => { contestsAPI.get(slug).then(setC).catch(() => nav('/competitions')); }, [slug, nav]);

  useEffect(() => {
    contestsAPI.list({ limit: 100 }).then(result => setRecommendations(Array.isArray(result) ? result : (result.contests || []))).catch(() => setRecommendations([]));
  }, []);

  useEffect(() => {
    const loadBasket = () => {
      try { setBasketItems(JSON.parse(localStorage.getItem('gamezoo_cart') || '[]')); }
      catch { setBasketItems([]); }
    };
    loadBasket();
    window.addEventListener('storage', loadBasket);
    return () => window.removeEventListener('storage', loadBasket);
  }, []);

  useEffect(() => {
    if (!c?.contest_id || !c.instant_prize_enabled) { setInstantStatus(null); return undefined; }
    let active = true;
    const load = () => instantWinsAPI.status(c.contest_id).then(data => active && setInstantStatus(data)).catch(() => {});
    load();
    const timer = setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [c?.contest_id, c?.instant_prize_enabled]);

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
      // Non-fatal - page falls back to the legacy static question if available.
      setChallenge(null);
    } finally {
      setChallengeLoading(false);
    }
  };
  useEffect(() => { if (c && !c.public_coming_soon && (c.requires_skill_question || (c.entry_mode || 'skill_game') === 'skill_game')) loadChallenge(); /* eslint-disable-next-line */ }, [slug, c?.entry_mode, c?.requires_skill_question, c?.public_coming_soon]);

  useEffect(() => {
    if (!user) { setWallet(null); return; }
    walletAPI.me().then(setWallet).catch(() => setWallet(null));
  }, [user]);

  useEffect(() => {
    if (!user || !c?.contest_id) { setTicketAvailability(null); return; }
    ordersAPI.ticketAvailability(c.contest_id).then(setTicketAvailability).catch(() => setTicketAvailability(null));
  }, [user, c?.contest_id]);

  useEffect(() => {
    if (!c) return;
    const upd = () => setT(countdown(c.end_date));
    upd();
    const i = setInterval(upd, 1000);
    return () => clearInterval(i);
  }, [c]);

  const status = useMemo(() => c ? saleStatus(c.tickets_sold, c.tickets_total) : null, [c]);

  const isComingSoon =
    c?.public_coming_soon === true ||
    (
      c?.status === 'draft' &&
      String(c?.tag || '').trim().toLowerCase() === 'coming soon'
    );
  const isClosed = !isComingSoon && !!c && (['closed', 'drawn', 'archived'].includes(c.status) || (c.has_time_limit !== false && c.end_date && new Date(c.end_date) <= new Date()));

  if (!c) return <div className="max-w-7xl mx-auto p-10 text-slate-500">Loading contest...</div>;

  // Prefer the dynamic per-visitor challenge; fall back to the legacy static
  // question ONLY when the backend didn't hand us a challenge (e.g. contests
  // pre-dating the dynamic engine).
  const questionText = challenge?.question || c.skill_question_q || '';
  const options = challenge?.options || c.skill_question_options || [];
  const entryMode = c.entry_mode || 'skill_game';
  const isSkillGame = entryMode === 'skill_game';
  const needsSkill = isSkillGame || !!c.requires_skill_question;
  const subtotal = c.price * tickets;
  const balanceAfter = wallet ? Math.max(0, wallet.balance - subtotal) : null;
  const contestTicketsLeft = Math.max(0, Number(c.tickets_total || 0) - Number(c.tickets_sold || 0));
  const configuredUserLimit = Math.max(0, Number(c.max_tickets_per_user || 0));
  const maxTicketsForSelection = ticketAvailability
    ? Math.max(0, Number(ticketAvailability.can_add) || 0)
    : Math.max(0, Math.min(500, contestTicketsLeft, configuredUserLimit || 500));
  const description = c.full_description || c.short_description || c.subtitle || 'Please see the published competition terms before entering.';
  const openRecommendations = recommendations.filter(item => item.contest_id !== c.contest_id && item.status === 'live' && item.public_coming_soon !== true);
  const closingSoon = COMPETITION_SECTIONS.map(section => openRecommendations
    .filter(item => competitionSectionOf(item) === section.key && (!item.has_time_limit || item.has_time_limit !== false))
    .sort((a, b) => new Date(a.end_date) - new Date(b.end_date))[0]).filter(Boolean).slice(0, 4);
  const closingIds = new Set(closingSoon.map(item => item.contest_id));
  const latest = [...openRecommendations]
    .filter(item => !closingIds.has(item.contest_id))
    .sort((a, b) => new Date(b.created_at || b.end_date) - new Date(a.created_at || a.end_date))
    .slice(0, 4);
  const moreContests = [...closingSoon, ...latest];
  const currentBasketItem = basketItems.find(item => item.contest_id === c.contest_id);
  const checkoutItems = [
    {
      contest_id: c.contest_id,
      title: c.title,
      price: c.price,
      qty: tickets + Number(currentBasketItem?.qty || 0),
    },
    ...basketItems.filter(item => item.contest_id !== c.contest_id),
  ];
  const checkoutTicketTotal = checkoutItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const checkoutTotal = checkoutItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  const checkoutBalanceAfter = wallet ? Math.max(0, Number(wallet.balance || 0) - checkoutTotal) : null;

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

  const addRecommendation = (contest, quantity) => {
    const raw = localStorage.getItem('gamezoo_cart');
    const cart = raw ? JSON.parse(raw) : [];
    if (quantity === 0) {
      const next = cart.filter(entry => entry.contest_id !== contest.contest_id);
      localStorage.setItem('gamezoo_cart', JSON.stringify(next));
      setBasketItems(next);
      toast({ title: 'Removed from basket' });
      return true;
    }
    if (needsSkill && (!verified || !challenge?.challenge_token)) {
      toast({ title: 'Answer the skill question first' });
      return false;
    }
    const item = {
      contest_id: contest.contest_id, slug: contest.slug, title: contest.title, image: contest.image,
      price: contest.price, qty: quantity, skill_answer: 'n/a', challenge_token: null,
      skill_clearance_contest_id: verified ? c.contest_id : null,
      skill_clearance_token: verified ? challenge?.challenge_token || null : null,
      skill_clearance_answer: verified ? String(answer) : null,
      entry_mode: contest.entry_mode || 'random_tickets', added_at: new Date().toISOString(),
    };
    const existing = cart.find(entry => entry.contest_id === contest.contest_id);
    if (existing) Object.assign(existing, item); else cart.push(item);
    localStorage.setItem('gamezoo_cart', JSON.stringify(cart));
    setBasketItems(cart);
    toast({ title: 'Added to basket', description: `${quantity} ticket${quantity === 1 ? '' : 's'} for ${contest.title} added.` });
    return true;
  };

  const addToCart = () => {
    if (isComingSoon) {
      toast({
        title: 'Coming Soon',
        description: 'This competition is not open for entries yet.'
      });
      return;
    }

    if (needsSkill && !verified) { toast({ title: 'Answer the skill question correctly first' }); return; }
    const raw = localStorage.getItem('gamezoo_cart');
    const cart = raw ? JSON.parse(raw) : [];
    const idx = cart.findIndex(x => x.contest_id === c.contest_id);
    const token = challenge?.challenge_token || null;
    if (needsSkill && challenge?.expires_at && challenge.expires_at <= Math.floor(Date.now() / 1000)) {
      toast({ title: 'Skill question expired', description: 'Please answer a fresh question before checkout.' });
      loadChallenge();
      return;
    }
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
    toast({ title: 'Added to basket', description: `${tickets} ticket${tickets > 1 ? 's' : ''} for "${c.title}"` });
    nav('/cart');
  };

  return (
    <div className="max-w-7xl mx-auto min-w-0 px-2 sm:px-4 lg:px-8 py-2 md:py-4" data-testid="contest-detail">
      <BackButton to="/competitions" label="All contests" className="mb-2" />
      <div className="grid min-w-0 gap-3 md:grid-cols-2 lg:gap-5">
        {/* IMAGE COLUMN - dark neutral bg, object-contain, loading + fallback */}
        <div className="min-w-0">
          <div className="relative aspect-[2/1] md:sticky md:top-2 md:aspect-[16/10] lg:max-h-[560px] overflow-hidden border border-slate-200 bg-[#0B0D1F]">
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
            <div className="absolute right-2 top-2 z-10"><ShareMenu path={`/competition/${encodeURIComponent(c.slug)}`} title={c.title} imageUrl={resolveMediaUrl(c.image)} label={`Share ${c.title}`} /></div>
          </div>
        </div>

        {/* DETAILS COLUMN */}
        <div className="min-w-0">
          <h1 className="truncate whitespace-nowrap font-display text-xl sm:text-2xl md:text-xl lg:text-3xl font-black text-slate-900">{c.title}</h1>
          <p className="mt-0.5 truncate whitespace-nowrap text-xs sm:text-sm text-slate-500">{c.subtitle}</p>

          {/* Countdown */}
          {c.has_time_limit !== false ? <div className="mt-2 border border-slate-100 bg-slate-50 p-2">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-600"><Clock className="h-3.5 w-3.5 text-[#6C2BFF]" /> Draw ends in</div>
            <div className="flex gap-2">
              {[{k:'Days',v:t.days},{k:'Hours',v:t.hours},{k:'Mins',v:t.mins},{k:'Secs',v:t.secs}].map((x) => (
                <div key={x.k} className="min-w-0 flex-1 border border-slate-100 bg-white p-1.5 text-center">
                  <div className="font-display text-lg sm:text-xl font-black leading-none text-slate-900">{String(x.v).padStart(2,'0')}</div>
                  <div className="mt-1 truncate text-[8px] sm:text-[9px] uppercase text-slate-500">{x.k}</div>
                </div>
              ))}
            </div>
          </div> : <div className="mt-3 border border-emerald-200 bg-emerald-50 p-2 text-center text-xs font-bold text-emerald-800">No closing timer · closes when all instant wins are revealed</div>}

          <div className="mt-3" data-testid="sale-progress">
            <div className="flex justify-between gap-3 text-xs font-bold text-slate-600 mb-1">
              <span>{Math.max(0, Number(c.tickets_total || 0) - Number(c.tickets_sold || 0)).toLocaleString()} tickets left</span>
              <span className="text-[#6C2BFF]">{status.pct}% sold</span>
            </div>
            <Progress value={status.pct} className="h-10 w-full" />
          </div>

          {isClosed ? (
            <div className="mt-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 md:p-8 text-center" data-testid="awaiting-draw-lock">
              <div className="inline-flex items-center rounded-full bg-amber-500 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-white">{c.status === 'drawn' ? 'Completed' : 'Entries closed'}</div>
              <h2 className="mt-4 font-display text-2xl font-extrabold text-slate-900">{c.status === 'drawn' ? 'Winners have been drawn' : 'Draw coming soon'}</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-600">{c.status === 'drawn' ? 'See who won in the Hall of Winners.' : 'This contest has ended and no new entries are accepted. The live draw will take place shortly.'}</p>
              <Link to="/winners" className="mt-4 inline-flex rounded-full bg-[#6C2BFF] px-5 py-2 text-sm font-bold text-white" data-testid="awaiting-draw-winners-link">Hall of Winners</Link>
            </div>
          ) : isComingSoon ? (
            <div
              className="mt-6 rounded-2xl border-2 border-[#6C2BFF]/20 bg-[#6C2BFF]/5 p-6 md:p-8 text-center"
              data-testid="coming-soon-detail-lock"
            >
              <div className="inline-flex items-center rounded-full bg-[#6C2BFF] px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-white">
                Coming Soon
              </div>

              <h2 className="mt-4 font-display text-2xl font-extrabold text-slate-900">
                This competition is coming soon
              </h2>

              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-600">
                Entries are not open yet. Please check back when this competition is officially launched.
              </p>
            </div>
          ) : (
            <>
          <RecommendationRail items={moreContests} selectedItems={basketItems} onAdd={addRecommendation} />

          {/* Skill Question or Random Draw notice */}
          {needsSkill ? (
            <div className="mt-2 border-2 border-[#6C2BFF]/20 bg-[#6C2BFF]/5 p-2.5" data-testid="skill-question-block">
              <div className="mb-2 flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                <Brain className="h-4 w-4 shrink-0 text-[#6C2BFF]" />
                <div className="truncate text-xs sm:text-sm font-black text-slate-900">Skill Question <span className="text-[9px] uppercase text-[#6C2BFF]">Required</span></div>
                {challenge?.op && (
                  <span className="hidden sm:inline-flex truncate border border-[#6C2BFF]/20 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#6C2BFF]" data-testid="skill-op-badge">
                    {challenge.op}
                    {challenge.difficulty ? ` - ${challenge.difficulty}` : ''}
                  </span>
                )}
                <button
                  type="button"
                  onClick={loadChallenge}
                  disabled={challengeLoading || verified}
                  className="ml-auto shrink-0 text-[10px] font-bold text-[#6C2BFF] hover:underline disabled:opacity-40"
                  data-testid="new-question-btn"
                >
                  {challengeLoading ? 'Loading...' : 'New question'}
                </button>
              </div>
              <p className="mb-2 truncate whitespace-nowrap font-mono text-sm sm:text-base font-bold text-slate-900" title={questionText} data-testid="skill-question-text">
                {questionText || 'Loading question...'}
              </p>
              <div className="grid grid-cols-4 gap-1">
                {options.map(opt => {
                  const isSel = String(answer) === String(opt);
                  const state = verified && isSel ? 'correct' : (wrong && isSel ? 'wrong' : 'idle');
                  return (
                    <button key={opt} onClick={() => submitAnswer(opt)} disabled={verified}
                      data-testid={`skill-option-${opt}`}
                      className={`min-w-0 h-9 truncate px-1 text-xs sm:text-sm font-bold border-2 transition-colors ${state === 'correct' ? 'bg-emerald-500 border-emerald-500 text-white' : state === 'wrong' ? 'bg-rose-500 border-rose-500 text-white' : isSel ? 'bg-white border-[#6C2BFF] text-[#6C2BFF]' : 'bg-white border-slate-200 hover:border-[#6C2BFF]/60'}`}>
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
              {verified && <p className="text-xs text-emerald-700 mt-2 font-medium"><span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" aria-hidden="true" /> Skill verified. You may now purchase tickets.</span></p>}
            </div>
          ) : (
            <div className="mt-6 p-4 md:p-5 rounded-2xl border-2 border-amber-200 bg-amber-50" data-testid="random-ticket-info">
              <div className="flex items-center gap-2 mb-2"><Ticket className="w-5 h-5 text-amber-700" /><div className="font-display font-bold text-slate-900">Random Ticket Draw</div></div>
              <p className="text-sm text-slate-700">After successful payment, you&apos;ll be allocated unique ticket numbers server-side. A winner is drawn at random after the contest closes.</p>
            </div>
          )}

          {/* Ticket selector - mobile-safe with live totals */}
          <div className="mt-3 p-3 border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <div className="text-xs text-slate-500">Cost per entry</div>
                <div className="font-display font-extrabold text-2xl text-slate-900 flex items-baseline gap-1">
                  <TokenIcon className="h-5 w-5" />
                  <span>{tokenPrice(c.price)}</span>
                  <span className="text-[9px] font-bold text-slate-500">1 token = £1.00</span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 md:gap-2" data-testid="ticket-qty-controls">
                  <Button variant="outline" size="icon" data-testid="qty-minus" onClick={() => setTickets(Math.max(0, tickets - 1))}><Minus className="w-4 h-4" /></Button>
                  <input
                    type="number"
                    data-testid="qty-input"
                    min="0"
                    max={maxTicketsForSelection}
                    value={tickets}
                    onChange={(e) => setTickets(Math.max(0, Math.min(maxTicketsForSelection, parseInt(e.target.value, 10) || 0)))}
                    className="w-16 h-9 text-center rounded-md border border-slate-200 font-bold text-lg"
                  />
                  <Button variant="outline" size="icon" data-testid="qty-plus" disabled={tickets >= maxTicketsForSelection} onClick={() => setTickets(Math.min(maxTicketsForSelection, tickets + 1))}><Plus className="w-4 h-4" /></Button>
                </div>
                <p className="mt-1 text-right text-[10px] font-bold text-slate-500" data-testid="ticket-limit-hint">
                  {maxTicketsForSelection === 0
                    ? 'Sold out or your limit is reached'
                    : `You can add ${maxTicketsForSelection} more${ticketAvailability?.owned ? ` · ${ticketAvailability.owned} already owned` : ''}`}
                </p>
              </div>
            </div>

            {/* Preset quantities */}
            <div className="flex flex-wrap gap-2 mb-4" data-testid="qty-presets">
              {[1, 5, 10, 25, 50].filter(n => n <= maxTicketsForSelection).map(n => (
                <button
                  key={n}
                  onClick={() => setTickets(n)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${tickets === n ? 'bg-[#6C2BFF] text-white border-[#6C2BFF]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#6C2BFF]/40'}`}
                >{n}</button>
              ))}
            </div>

            {/* Combined checkout breakdown */}
            <div className="mb-3 border border-slate-200 bg-slate-50 p-2.5 text-xs" data-testid="summary-box">
              <div className="divide-y divide-slate-200">
                {checkoutItems.map(item => (
                  <div key={item.contest_id} className="flex items-center justify-between gap-2 py-1.5">
                    <div className="min-w-0"><div className="truncate font-bold text-slate-900">{item.title}</div><div className="text-[10px] text-slate-500">{item.qty} ticket{item.qty === 1 ? '' : 's'} × {exactTokens(item.price)}</div></div>
                    <span className="shrink-0 font-black text-slate-900">{exactTokens(Number(item.price || 0) * Number(item.qty || 0))}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 border-t border-slate-900 pt-1.5">
                <div className="flex justify-between"><span className="text-slate-500">Total tickets</span><span className="font-black">{checkoutTicketTotal}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Total cost</span><span className="font-black">{exactTokens(checkoutTotal)}</span></div>
                {wallet && <div className="flex justify-between"><span className="text-slate-500">Tokens left</span><span className={`font-black ${wallet.balance < checkoutTotal ? 'text-rose-600' : 'text-emerald-700'}`}>{wallet.balance < checkoutTotal ? `Need ${exactTokens(checkoutTotal - wallet.balance)} more` : exactTokens(checkoutBalanceAfter)}</span></div>}
              </div>
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
                <strong>Before you buy -</strong> I confirm I have read the selected contest information, I&apos;m aged 18+ and resident in the UK, and I am purchasing <strong>{checkoutTicketTotal}</strong> ticket{checkoutTicketTotal === 1 ? '' : 's'} across {checkoutItems.length} contest{checkoutItems.length === 1 ? '' : 's'} for <strong>{exactTokens(checkoutTotal)}</strong>. I accept the {' '}
                <Link to="/legal/terms" className="text-[#6C2BFF] underline">Terms &amp; Conditions</Link>.
              </span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={addToCart}
                disabled={(needsSkill && !verified) || !confirmed || tickets < 1 || maxTicketsForSelection === 0}
                data-testid="buy-tickets-btn"
                className="h-11 pl-btn-gold text-slate-900 text-sm font-black disabled:opacity-50 disabled:cursor-not-allowed">
                <ShoppingBag className="w-4 h-4 mr-1" /> Checkout {checkoutTicketTotal}
              </Button>
              <Link to="/free-entry" data-testid="postal-entry-link" className="block">
                <Button variant="outline" className="h-11 w-full border-slate-900 text-sm font-black text-slate-900">
                  <Mail className="w-4 h-4 mr-1" /> Postal Entry
                </Button>
              </Link>
            </div>
            <p className="text-[10px] text-slate-500 text-center mt-2">Postal entry is free. No purchase necessary.</p>
          </div>
            </>
          )}
          <div className="mt-3 border border-slate-200 bg-white p-3" data-testid="contest-terms">
            <h2 className="mb-2 font-display text-lg font-black text-slate-900">Contest description</h2>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700" style={descriptionExpanded ? undefined : { display: '-webkit-box', WebkitLineClamp: 15, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} data-testid="contest-description">
              {description}
            </div>
            {(description.split('\n').length > 15 || description.length > 700) && <button type="button" onClick={() => setDescriptionExpanded(value => !value)} className="mt-2 text-sm font-black text-[#6C2BFF]" data-testid="description-more">{descriptionExpanded ? 'Show less' : 'More'}</button>}
            <Link to="/legal/terms" className="mt-3 block text-xs font-bold text-[#6C2BFF] hover:underline">Terms &amp; Conditions</Link>
          </div>

          {instantStatus?.enabled && <section className="mt-3 border border-amber-300 bg-amber-50 p-3" data-testid="instant-winners-summary">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-slate-900">Instant Win Winners</h2>
              <div className="text-xs font-black text-emerald-700">Won {instantStatus.won}/{instantStatus.total} · Left {instantStatus.remaining}</div>
            </div>
            <div className="mt-1 text-xs text-slate-600">{exactTokens(instantStatus.won_value)} won · {exactTokens(instantStatus.remaining_value)} left</div>
            <div className="mt-2 max-h-40 overflow-y-auto divide-y divide-amber-200">
              {instantStatus.winners.length ? instantStatus.winners.map(winner => <div key={`${winner.ticket_number}-${winner.revealed_at}`} className="flex items-center justify-between gap-2 py-1.5 text-xs"><span className="min-w-0"><span className="block truncate font-bold text-slate-900">{winner.user_name} · #{winner.ticket_number}</span><span className="block truncate text-[10px] text-slate-500">{winner.prize?.description || 'Instant Win'}</span></span><span className="shrink-0 font-black text-emerald-700">{exactTokens((winner.prize?.amount || 0) + (winner.prize?.bonus_amount || 0))}</span></div>) : <p className="py-2 text-xs text-slate-500">No instant wins revealed yet.</p>}
            </div>
          </section>}
        </div>
      </div>

      {/* Live leaderboard section removed - per launch spec, results appear only after the contest closes on the Winners page. */}
    </div>
  );
}
