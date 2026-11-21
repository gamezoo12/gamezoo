import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, CheckCircle2, ChevronRight, Minus, Plus, ShoppingBag, Mail } from 'lucide-react';
import { contestsAPI } from '../../lib/api';
import { exactTokens, percent, tokenPrice } from '../../lib/format';
import { resolveMediaUrl } from '../../lib/media';
import { useToast } from '../../hooks/use-toast';
import TokenIcon from '../../components/TokenIcon';

const STORAGE_KEY = 'gamezoo_cart';

function MiniPaidContest({ contest, onSelect }) {
  const [quantity, setQuantity] = useState(1);
  const left = Math.max(0, Number(contest.tickets_total || 0) - Number(contest.tickets_sold || 0));
  const sold = percent(contest.tickets_sold, contest.tickets_total);
  return (
    <article className="fwv3-paid-card" data-testid={`free-world-paid-contest-${contest.contest_id}`}>
      <Link to={`/competition/${contest.slug}`} className="fwv3-paid-image" aria-label={`Open ${contest.title}`}>
        <img src={resolveMediaUrl(contest.image)} alt={contest.title} loading="lazy" />
      </Link>
      <div className="fwv3-paid-body">
        <h3 title={contest.title}>{contest.title}</h3>
        <div className="fwv3-paid-meta"><span>{left.toLocaleString()} left</span><span>{sold}% sold</span></div>
        <div className="fwv3-paid-progress"><span style={{ width: `${sold}%` }} /></div>
        <div className="fwv3-paid-price"><TokenIcon className="h-3.5 w-3.5" /><span>{tokenPrice(contest.price)} tokens</span><strong>{exactTokens(Number(contest.price || 0) * quantity)}</strong></div>
        <div className="fwv3-paid-actions">
          <div className="fwv3-paid-stepper">
            <button type="button" onClick={() => setQuantity(value => Math.max(1, value - 1))} aria-label={`Decrease ${contest.title} tickets`}><Minus size={12} /></button>
            <input type="number" min="1" max={Math.min(500, left || 500)} value={quantity} onChange={event => setQuantity(Math.max(1, Math.min(Math.min(500, left || 500), Number(event.target.value) || 1)))} aria-label={`${contest.title} ticket quantity`} />
            <button type="button" onClick={() => setQuantity(value => Math.min(Math.min(500, left || 500), value + 1))} aria-label={`Increase ${contest.title} tickets`}><Plus size={12} /></button>
          </div>
          <button type="button" disabled={left === 0} onClick={() => onSelect(contest, quantity)} data-testid={`free-world-paid-add-${contest.contest_id}`}>Add</button>
        </div>
      </div>
    </article>
  );
}

export default function FreeWorldPaidContests() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [contests, setContests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [answer, setAnswer] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    contestsAPI.list({ limit: 100 })
      .then(data => {
        const rows = Array.isArray(data) ? data : (data?.contests || []);
        setContests(rows.filter(contest => contest.status === 'live' && contest.public_coming_soon !== true).slice(0, 12));
      })
      .catch(() => setContests([]));
  }, []);

  const persist = (contest, quantity, skill = null) => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const cart = raw ? JSON.parse(raw) : [];
    const item = {
      contest_id: contest.contest_id,
      slug: contest.slug,
      title: contest.title,
      image: contest.image,
      price: contest.price,
      qty: quantity,
      skill_answer: skill?.answer || 'n/a',
      challenge_token: skill?.challenge_token || null,
      entry_mode: contest.entry_mode || (contest.game_type ? 'skill_game' : 'random_tickets'),
      added_at: new Date().toISOString(),
    };
    const existing = cart.find(row => row.contest_id === contest.contest_id);
    if (existing) Object.assign(existing, item); else cart.push(item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    setSelected({ contest, quantity, added: true });
    toast({ title: 'Added to checkout', description: `${quantity} ticket${quantity === 1 ? '' : 's'} for ${contest.title}` });
  };

  const selectContest = async (contest, quantity) => {
    const entryMode = contest.entry_mode || (contest.game_type ? 'skill_game' : 'random_tickets');
    const needsSkill = entryMode === 'skill_game' || contest.requires_skill_question === true;
    setAnswer(''); setVerified(false); setChallenge(null); setSelected({ contest, quantity, added: false });
    if (!needsSkill) { persist(contest, quantity); return; }
    setBusy(true);
    try { setChallenge(await contestsAPI.skillChallenge(contest.slug)); }
    catch { toast({ title: 'Could not load skill question', description: 'Please try again.' }); setSelected(null); }
    finally { setBusy(false); }
  };

  const submitAnswer = async option => {
    if (!selected?.contest || !challenge) return;
    setAnswer(String(option)); setBusy(true);
    try {
      const result = await contestsAPI.verifySkill(selected.contest.slug, option, challenge.challenge_token);
      if (result.correct) {
        setVerified(true);
        persist(selected.contest, selected.quantity, { answer: option, challenge_token: challenge.challenge_token });
      } else {
        setVerified(false);
        setChallenge(await contestsAPI.skillChallenge(selected.contest.slug));
        toast({ title: 'Incorrect answer', description: 'A new skill question is ready.' });
      }
    } catch { toast({ title: 'Could not verify answer' }); }
    finally { setBusy(false); }
  };

  if (!contests.length) return null;

  return (
    <section className="fwv3-paid-rail" data-testid="free-world-paid-contests">
      <div className="fwv3-paid-heading"><h2>Paid Contests To Win More</h2><span>Swipe <ChevronRight size={12} /></span></div>
      <div className="fwv3-paid-track">{contests.map(contest => <MiniPaidContest key={contest.contest_id} contest={contest} onSelect={selectContest} />)}</div>
      {selected && !selected.added && challenge && <div className="fwv3-paid-question" data-testid="free-world-paid-skill-question">
        <div><strong>Skill question</strong><span>{selected.contest.title}</span></div>
        <p>{challenge.question}</p>
        <div className="fwv3-paid-options">{(challenge.options || []).map(option => <button key={option} type="button" disabled={busy || verified} onClick={() => submitAnswer(option)} className={String(answer) === String(option) ? 'is-selected' : ''}>{verified && String(answer) === String(option) && <Check size={13} />}{option}</button>)}</div>
      </div>}
      {selected?.added && <div className="fwv3-paid-checkout" data-testid="free-world-paid-checkout">
        <div><CheckCircle2 size={16} /><span>{selected.quantity} ticket{selected.quantity === 1 ? '' : 's'} added · {exactTokens(Number(selected.contest.price || 0) * selected.quantity)}</span></div>
        <div className="fwv3-paid-checkout-actions">
          <button type="button" onClick={() => navigate('/cart')}><ShoppingBag size={14} /> Checkout</button>
          <Link to="/free-entry"><Mail size={14} /> Postal Entry</Link>
        </div>
      </div>}
    </section>
  );
}
