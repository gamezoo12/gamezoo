import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, Clock, ArrowLeft } from 'lucide-react';
import { winningsAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';

const LIMIT = 90; // seconds
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export default function SpecialChallenge() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [grid, setGrid] = useState([]);
  const [next, setNext] = useState(1);
  const [attemptId, setAttemptId] = useState(null);
  const [seq, setSeq] = useState([]);
  const [left, setLeft] = useState(LIMIT);
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState(null);
  const [alreadyWon, setAlreadyWon] = useState(false);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState('');
  const finishedRef = useRef(false);

  const startGame = async () => {
    setStarting(true);
    setError('');
    try {
      const r = await winningsAPI.startChallenge();
      setAttemptId(r.attempt_id);
      setAlreadyWon(r.already_rewarded);
      setGrid(shuffle(Array.from({ length: 100 }, (_, i) => i + 1)));
      finishedRef.current = false;
      setNext(1); setSeq([]); setLeft(LIMIT); setResult(null); setPlaying(true);
    } catch (e) {
      setError('Could not start the challenge. Please make sure you are logged in.');
    } finally { setStarting(false); }
  };

  useEffect(() => { startGame(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (!playing) return undefined;
    if (left <= 0) { finish(seq); return undefined; }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [playing, left]); // eslint-disable-line

  const tap = (n) => {
    if (!playing || n !== next) return;
    const ns = [...seq, n];
    setSeq(ns); setNext(n + 1);
    if (n === 100) finish(ns);
  };

  const finish = async (sequence) => {
    if (!attemptId || finishedRef.current) return;
    finishedRef.current = true;
    setPlaying(false);
    try {
      const r = await winningsAPI.completeChallenge(attemptId, sequence);
      setResult(r);
      if (r.reward_pence > 0) {
        toast({ title: 'You won £50!', description: 'Credited to your Winnings Wallet.' });
      }
    } catch (e) {
      setResult({ result: 'fail', reward_pence: 0 });
    }
  };

  const backToWallet = () => navigate('/my-account/winnings');

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col" data-testid="challenge-page">
      {/* top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-slate-900/95 sticky top-0 z-10">
        <button onClick={backToWallet} data-testid="challenge-back"
          className="flex items-center gap-1.5 text-sm font-bold text-white/80 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Wallet
        </button>
        <div className="flex items-center gap-2 font-black uppercase tracking-widest text-amber-400 text-xs">
          <Gift className="w-4 h-4" /> Something Special
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5 font-mono font-black text-xl sm:text-2xl text-amber-400 tabular-nums" data-testid="challenge-timer">
            <Clock className="w-5 h-5" /> <MsTimer running={playing} />
          </div>
          <div className="text-[10px] font-bold text-white/50" data-testid="challenge-timeleft">
            {LIMIT}s limit · {Math.max(0, left)}s left
          </div>
        </div>
      </div>

      <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-5">
        {starting && (
          <div className="text-center text-white/70 py-20" data-testid="challenge-starting">Starting…</div>
        )}

        {error && !starting && (
          <div className="text-center py-16">
            <p className="text-white/80" data-testid="challenge-error">{error}</p>
            <div className="flex gap-2 justify-center mt-4">
              <Button variant="outline" className="text-white border-white/40" onClick={backToWallet}>Back</Button>
              <Button className="bg-amber-500 hover:bg-amber-600" onClick={startGame}>Retry</Button>
            </div>
          </div>
        )}

        {playing && !starting && (
          <>
            <div className="text-white/70 text-sm mb-3">
              Tap <b className="text-amber-400">1 → 100</b> in order · Next: <b className="text-amber-400" data-testid="challenge-next">{next}</b>
            </div>
            <div className="grid grid-cols-10 gap-1.5">
              {grid.map((n) => (
                <button key={n} onClick={() => tap(n)} data-testid={`cell-${n}`}
                  className={`aspect-square rounded-md text-xs font-bold transition-colors ${n < next ? 'bg-emerald-500 text-white' : 'bg-white text-slate-800 hover:bg-amber-100'}`}>
                  {n}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Result */}
      {result && !playing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-testid="challenge-result">
          <div className="bg-white text-slate-900 rounded-2xl p-6 max-w-sm w-full text-center">
            <h3 className="text-2xl font-extrabold">{result.result === 'success' ? 'Completed! 🎉' : 'Time / sequence missed'}</h3>
            <p className="mt-2 text-slate-600" data-testid="result-message">
              {result.reward_pence > 0
                ? 'You earned £50.00 — credited to your Winnings Wallet.'
                : result.result === 'success'
                  ? 'Well done! You have already claimed the £50 reward (practice run — no further reward).'
                  : 'Not this time. Unlimited attempts — try again!'}
            </p>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={backToWallet} data-testid="result-back">Back to Wallet</Button>
              <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white" onClick={startGame} data-testid="result-playagain">Play again</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Live millisecond stopwatch (self-contained rAF so it doesn't re-render the grid).
function MsTimer({ running }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!running) { setElapsed(0); return undefined; }
    startRef.current = performance.now();
    const tick = () => {
      setElapsed(performance.now() - startRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  const total = Math.max(0, elapsed);
  const mm = Math.floor(total / 60000);
  const ss = Math.floor((total % 60000) / 1000);
  const ms = Math.floor(total % 1000);
  const pad = (n, l = 2) => String(n).padStart(l, '0');

  return (
    <span data-testid="challenge-ms-timer">
      {pad(mm)}:{pad(ss)}
      <span className="text-amber-300/80">.{pad(ms, 3)}</span>
    </span>
  );
}
