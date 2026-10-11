import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Clock, Coins, Gift, Hash, Palette, Target } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';

const shuffle = (values) => {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const money = (pence) => `£${(Number(pence || 0) / 100).toFixed(2)}`;
const messageOf = (e) => e?.response?.data?.detail || e?.message || 'Something went wrong. Please try again.';
const RESULT_QUOTES = {
  success: [
    'Brilliant focus. You made every second count! 🏆✨',
    'That was all skill, and it showed. Enjoy the win! 🎯🎉',
    'You showed up, locked in, and got it done! 🚀👏',
    'A fantastic finish. Your next great run starts here! 🌟🥇',
    'Look at you go! That challenge never stood a chance! 💥🏆',
  ],
  retry: [
    'Ooh, a tough round! Your focus is getting stronger every try. 💪✨',
    'Not this time, and that is okay. Take a breath and come back swinging! 🌈🎯',
    'Every attempt is practice for your next great run. You have got this! 🚀💛',
    'That was a close one! Reset, refocus, and give it another go. 🔄⭐',
    'The best runs have a few plot twists. Your comeback can start now! 🎬💪',
    'Keep that determination. One round never defines your skill! 🌟🙌',
  ],
};

export default function SpecialChallenge() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [grid, setGrid] = useState([]);
  const [next, setNext] = useState(1);
  const [sequence, setSequence] = useState([]);
  const [question, setQuestion] = useState(null);
  const [round, setRound] = useState(0);
  const [leftMs, setLeftMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [resultQuote, setResultQuote] = useState('');
  const [error, setError] = useState('');
  const deadlineRef = useRef(0);
  const completedRef = useRef(false);
  const attemptRef = useRef(null);
  const sequenceRef = useRef([]);
  const endingRef = useRef(null);
  const lastQuoteRef = useRef('');

  const finishResult = (nextResult) => {
    const quotePool = nextResult.result === 'success'
      ? RESULT_QUOTES.success
      : RESULT_QUOTES.retry;
    const choices = quotePool.filter((quote) => quote !== lastQuoteRef.current);
    const quote = choices[Math.floor(Math.random() * choices.length)] || quotePool[0];
    lastQuoteRef.current = quote;
    setResult(nextResult);
    setResultQuote(quote);
  };

  useEffect(() => {
    api.get('/winnings/challenge/games').then(({ data }) => setGames(data.games || []))
      .catch(e => setError(messageOf(e))).finally(() => setLoading(false));
  }, []);

  const complete = async (id, seq) => {
    if (!id || completedRef.current) return;
    completedRef.current = true;
    try {
      const { data } = await api.post('/winnings/challenge/complete', { attempt_id: id, sequence: seq });
      finishResult(data);
      if (data.reward_pence > 0) toast({ title: `You won ${money(data.reward_pence)}!`, description: 'Credited to your withdrawable wallet.' });
    } catch (e) { setError(messageOf(e)); finishResult({ result: 'fail', reward_pence: 0 }); }
  };

  useEffect(() => {
    if (!attempt) return undefined;
    const timer = setInterval(() => {
      const remaining = Math.max(0, deadlineRef.current - Date.now());
      setLeftMs(remaining);
      if (remaining === 0 && !completedRef.current) {
        if (attempt.type === 'number_sequence') complete(attempt.attempt_id, sequenceRef.current);
        else { completedRef.current = true; finishResult({ result: 'fail', reward_pence: 0, timeout: true }); }
      }
    }, 50);
    return () => clearInterval(timer);
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (!selected || busy) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const { data } = await api.post('/winnings/challenge/start', { game_id: selected.game_id });
      const a = { ...data, type: selected.type };
      attemptRef.current = a;
      completedRef.current = false;
      sequenceRef.current = [];
      setSequence([]); setNext(1); setRound(0);
      setGrid(shuffle(Array.from({ length: selected.size }, (_, i) => i + 1)));
      setQuestion(data.question || null);
      deadlineRef.current = Date.now() + data.duration_ms;
      setLeftMs(data.duration_ms);
      setAttempt(a);
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  };

  const tap = (n) => {
    if (completedRef.current || busy || !attempt || n !== next || Date.now() >= deadlineRef.current) return;
    const updated = [...sequenceRef.current, n];
    sequenceRef.current = updated;
    setSequence(updated);
    setNext(n + 1);
    if (n === selected.size) complete(attempt.attempt_id, updated);
  };

  const answer = async (choice) => {
    if (busy || completedRef.current || Date.now() >= deadlineRef.current) return;
    setBusy(true);
    try {
      const { data } = await api.post('/winnings/challenge/colour-answer', {
        attempt_id: attempt.attempt_id, round, answer: choice,
      });
      if (data.finished) {
        completedRef.current = true;
        finishResult(data);
        if (data.reward_pence > 0) toast({ title: `You won ${money(data.reward_pence)}!` });
      } else { setQuestion(data.question); setRound(data.round); }
    } catch (e) {
      completedRef.current = true;
      setError(messageOf(e));
      finishResult({ result: 'fail', reward_pence: 0 });
    } finally { setBusy(false); }
  };

  const reset = () => {
    setAttempt(null); attemptRef.current = null; setResult(null); setResultQuote(''); setQuestion(null);
    setError(''); completedRef.current = false; setLeftMs(0);
  };
  const back = () => {
    if (attempt && !result) {
      if (!window.confirm('Leave this paid attempt? It will not be refunded.')) return;
    }
    if (selected) {
      reset();
      setSelected(null);
    } else {
      navigate(-1);
    }
  };
  const clock = `${String(Math.floor(leftMs / 60000)).padStart(2, '0')}:${String(Math.floor((leftMs % 60000) / 1000)).padStart(2, '0')}.${String(Math.floor((leftMs % 1000) / 10)).padStart(2, '0')}`;
  const selectedCooldownUntil = selected?.cooldown_until
    ? new Date(selected.cooldown_until)
    : null;
  const selectedCoolingDown = Boolean(
    selectedCooldownUntil && selectedCooldownUntil.getTime() > Date.now(),
  );
  const instructions = selected?.type === 'number_sequence'
    ? `Tap every number from 1 to ${selected.size} in ascending order before the timer runs out. Each grid is randomly shuffled. Wrong taps do not advance.`
    : `Ignore the written colour name. Tap the colour of the INK. Complete ${selected?.target_matches} correct matches before time runs out. One wrong answer ends the attempt. Every question is random.`;

  return (
    <div className="min-h-screen bg-slate-950 text-white" data-testid="challenge-page">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-4 py-4">
        <button
          onClick={back}
          aria-label={selected ? 'Back to challenges' : 'Back to previous page'}
          data-page-back-control="true"
          className="flex items-center gap-2 text-sm font-semibold text-white/80"
        >
          <ArrowLeft size={18} /> Back
        </button>
        <div className="flex items-center gap-2 text-sm font-black text-amber-400"><Gift size={18} /> SPECIAL CHALLENGE</div>
        <div className="font-mono font-bold text-amber-300" data-testid="challenge-timer">{attempt && !result ? <><Clock size={14} className="inline" /> {clock}</> : ''}</div>
      </div>
      <main className="mx-auto w-full max-w-[1760px] px-4 py-7 sm:px-6 lg:px-10 2xl:px-14">
        {loading && <p className="text-center text-white/70">Loading challenges…</p>}
        {!selected && !loading && <>
          <section className="relative mb-10 overflow-hidden rounded-2xl border border-white/10 bg-[#101a20] px-6 py-7 sm:px-9 sm:py-9 lg:px-12">
            <div aria-hidden="true" className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(167,243,208,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(167,243,208,.12) 1px,transparent 1px)', backgroundSize: '36px 36px' }} />
            <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
                  <Gift className="h-4 w-4" /> Skill challenges · real rewards
                </div>
                <h1 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl 2xl:text-5xl">Choose your challenge</h1>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                    See the goal, timer, entry cost and prize before you play. Every attempt costs 1 token; after a win, that same game reopens in 24 hours. Other games stay available.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3">
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">Live games</span>
                  <strong className="mt-1 block text-xl text-white">{games.length}</strong>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3">
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">Top prize</span>
                  <strong className="mt-1 block text-xl text-emerald-300">{money(games.reduce((top, game) => Math.max(top, Number(game.prize_pence) || 0), 0))}</strong>
                </div>
              </div>
            </div>
          </section>
          {['number_sequence', 'colour_match'].map(type => {
            const typeGames = games.filter(g => g.type === type).sort((a, b) => a.size - b.size);
            if (typeGames.length === 0) return null;
            const isSequence = type === 'number_sequence';
            const accent = isSequence
              ? { icon: 'text-cyan-300 bg-cyan-300/10', border: 'hover:border-cyan-300/50', value: 'text-cyan-200', prize: 'text-emerald-300', cta: 'text-cyan-200' }
              : { icon: 'text-amber-300 bg-amber-300/10', border: 'hover:border-amber-300/50', value: 'text-amber-200', prize: 'text-emerald-300', cta: 'text-amber-200' };
            return (
              <section key={type} className="mb-12">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent.icon}`}>
                      {isSequence ? <Hash className="h-5 w-5" /> : <Palette className="h-5 w-5" />}
                    </span>
                    <div>
                      <h2 className="text-xl font-black text-white sm:text-2xl">{isSequence ? 'Number Sequence' : 'Colour Match'}</h2>
                      <p className="mt-1 text-sm text-slate-400">{isSequence ? 'Tap the shuffled numbers in ascending order.' : 'Match the ink colour, not the written word.'}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{typeGames.length} challenges</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 2xl:gap-5">
                  {typeGames.map(g => (
                    <button
                      key={g.game_id}
                      type="button"
                      onClick={() => { setSelected(g); setError(''); }}
                      className={`group flex min-h-[340px] w-full flex-col rounded-xl border border-white/10 bg-gradient-to-br from-[#18232a] to-[#10171c] p-5 text-left shadow-lg transition duration-200 hover:-translate-y-1 hover:bg-[#1c2930] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${accent.border}`}
                      data-testid={`game-${g.game_id}`}
                    >
                      <div className="flex w-full items-start justify-between gap-3">
                        <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${accent.icon}`}>
                          {isSequence ? <Hash className="h-6 w-6" /> : <Palette className="h-6 w-6" />}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${g.cooldown_until && new Date(g.cooldown_until).getTime() > Date.now() ? 'border-amber-300/30 bg-amber-300/10 text-amber-200' : 'border-white/10 bg-black/20 text-slate-300'}`}>
                          {g.cooldown_until && new Date(g.cooldown_until).getTime() > Date.now()
                            ? 'WON · 24H REST'
                            : isSequence ? 'NUMBER RUN' : 'COLOUR RUN'}
                        </span>
                      </div>
                      <h3 className="mt-5 text-xl font-black leading-tight text-white 2xl:text-2xl">{g.name}</h3>
                      <p className="mt-2 min-h-[48px] text-sm leading-relaxed text-slate-400">
                        {isSequence
                          ? `Tap all ${g.size} shuffled numbers in order, from 1 to ${g.size}. Wrong taps do not advance.`
                          : `Ignore the word and tap the ink colour. Get ${g.target_matches} matches right; one wrong answer ends the run.`}
                      </p>
                      <div className="mt-5 grid w-full grid-cols-3 divide-x divide-white/10 rounded-lg border border-white/10 bg-black/15 py-3">
                        <div className="px-2 text-center">
                          <Target className="mx-auto h-4 w-4 text-slate-400" />
                          <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Goal</span>
                          <strong className={`mt-1 block text-sm ${accent.value}`}>{isSequence ? `${g.size} taps` : `${g.target_matches} hits`}</strong>
                        </div>
                        <div className="px-2 text-center">
                          <Clock className="mx-auto h-4 w-4 text-slate-400" />
                          <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Time</span>
                          <strong className="mt-1 block text-sm text-white">{g.time_limit_seconds}s</strong>
                        </div>
                        <div className="px-2 text-center">
                          <span className="block h-4 text-sm leading-4 text-slate-400">↻</span>
                          <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Attempts</span>
                          <strong className="mt-1 block text-sm text-white">{g.max_attempts || '∞'}</strong>
                        </div>
                      </div>
                      <div className="mt-auto flex w-full items-end justify-between gap-3 pt-5">
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Prize</span>
                          <strong className={`mt-1 block text-2xl font-black ${accent.prize}`}>{money(g.prize_pence)}</strong>
                        </div>
                        <div className="text-right">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Entry</span>
                          <strong className="mt-1 inline-flex items-center gap-1 text-sm font-extrabold text-white"><Coins className="h-4 w-4 text-amber-300" /> {g.entry_tokens} {g.entry_tokens === 1 ? 'token' : 'tokens'}</strong>
                        </div>
                      </div>
                      <div className={`mt-4 flex w-full items-center justify-between border-t border-white/10 pt-4 text-sm font-extrabold ${accent.cta}`}>
                        <span>See rules &amp; play</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </>}
        {selected && !attempt && <div className="mx-auto max-w-lg rounded-2xl border border-amber-500/30 bg-slate-900 p-6 text-center">
          <h1 className="text-3xl font-black text-amber-400">{selected.name}</h1>
          <p className="mt-3 text-2xl font-black text-emerald-400">Win {money(selected.prize_pence)}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-white/5 p-3">Entry <strong>{selected.entry_tokens} tokens</strong></div>
            <div className="rounded-lg bg-white/5 p-3">Time <strong>{selected.time_limit_seconds}s</strong></div>
            <div className="rounded-lg bg-white/5 p-3">Attempts <strong>{selected.max_attempts || 'Unlimited'}</strong></div>
            <div className="rounded-lg bg-white/5 p-3">{selected.type === 'colour_match' ? 'Correct matches' : 'Numbers'} <strong>{selected.type === 'colour_match' ? selected.target_matches : selected.size}</strong></div>
          </div>
          <h2 className="mt-6 text-lg font-bold">Instructions</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{instructions}</p>
          <p className="mt-4 text-xs text-slate-400">Each attempt costs 1 token. You can win this game once every 24 hours; other games remain available.</p>
          {selectedCoolingDown && <p className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">You already won this game. You can play it again after {selectedCooldownUntil.toLocaleString()}. Other games are still available. ⏳</p>}
          <Button disabled={busy || selectedCoolingDown} onClick={start} className="mt-6 w-full bg-amber-500 font-black text-slate-950 hover:bg-amber-400" data-testid="challenge-paid-start">{busy ? 'Starting…' : selectedCoolingDown ? 'Available after cooldown' : `PLAY — 1 token 🪙`}</Button>
        </div>}
        {selected && attempt && !result && <div className="mx-auto max-w-2xl">
          <div className="mb-4 flex justify-between text-sm text-slate-300"><span>{selected.name}</span><span>{selected.type === 'number_sequence' ? `Next: ${next}` : `Match ${round + 1} / ${attempt.target_matches}`}</span></div>
          {selected.type === 'number_sequence' ?
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${selected.size <= 25 ? 5 : selected.size <= 49 ? 7 : 10}, minmax(0, 1fr))` }}>
              {grid.map(n => <button key={n} data-testid={`cell-${n}`} onClick={() => tap(n)} disabled={completedRef.current} className={`aspect-square rounded-md text-xs font-bold sm:text-base ${n < next ? 'bg-emerald-600 text-white' : 'bg-white text-slate-900 hover:bg-amber-100'}`}>{n}</button>)}
            </div> : <div className="rounded-2xl bg-slate-900 p-5 text-center">
              <p className="mb-3 text-sm text-slate-400">Tap the actual INK colour, not the word</p>
              <div className="mb-8 rounded-xl bg-slate-950 px-3 py-12 text-4xl font-black tracking-wider sm:text-6xl" style={{ color: question?.ink }}>{question?.word}</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{question?.options.map(option => <button key={option} disabled={busy} onClick={() => answer(option)} className="rounded-xl border border-white/20 bg-slate-800 px-2 py-5 font-black hover:bg-slate-700 disabled:opacity-50">{option}</button>)}</div>
            </div>}
        </div>}
        {result && <section
          className={`relative mx-auto max-w-2xl overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-7 text-center shadow-2xl sm:p-10 ${result.result === 'success' ? 'border-emerald-300/40' : 'border-amber-300/30'}`}
          data-testid="challenge-result"
          aria-live="polite"
        >
          <div aria-hidden="true" className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl ${result.result === 'success' ? 'bg-emerald-300/15' : 'bg-amber-300/15'}`}>
            {result.result === 'success' ? '🏆' : result.timeout ? '⏱️' : '💪'}
          </div>
          <p className={`mt-5 text-xs font-black uppercase tracking-[0.2em] ${result.result === 'success' ? 'text-emerald-300' : 'text-amber-300'}`}>
            {result.result === 'success' ? 'Challenge complete' : result.timeout ? 'Time is up' : 'One attempt down'}
          </p>
          <h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">
            {result.result === 'success' ? 'You did it! 🎉' : 'Keep your head up! 🌟'}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base font-semibold leading-relaxed text-white/80 sm:text-lg">
            {resultQuote}
          </p>
          <p className="mt-5 text-sm text-white/55">
            {result.cooldown_blocked
              ? 'This game was already won in the last 24 hours. You can still play the other challenges.'
              : result.reward_pence > 0
                ? `${money(result.reward_pence)} credited to your Winnings Wallet. You can win this game again in 24 hours. 💸`
                : result.result === 'success'
                  ? 'Challenge complete. You can play this game again in 24 hours; other challenges remain available.'
                  : 'Every attempt builds experience. Choose your next move.'}
          </p>
          <div className="mx-auto mt-8 grid w-full max-w-lg gap-3 sm:grid-cols-2">
            <Button
              variant="outline"
              className="h-12 border-white/20 bg-white/5 font-extrabold text-white hover:bg-white/10 hover:text-white"
              onClick={() => { reset(); setSelected(null); }}
            >
              Back to more challenges
            </Button>
            <Button
              className="h-12 bg-emerald-300 font-black text-emerald-950 hover:bg-emerald-200"
              onClick={start}
              disabled={busy}
            >
              {busy ? 'Starting…' : 'Try again 🔄'}
            </Button>
          </div>
        </section>}
        {error && <p className="mx-auto mt-5 max-w-lg rounded-lg bg-red-950/60 p-3 text-center text-sm text-red-200" data-testid="challenge-error">{error}</p>}
      </main>
    </div>
  );
}
