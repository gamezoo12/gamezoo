import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';
import BackButton from '../components/BackButton';
import {
  Trophy, Crown, Medal, Twitter, Facebook, Link2, Share2, Sparkles, Users, PlayCircle,
} from 'lucide-react';
import { gbp } from '../lib/format';

const PODIUM_STYLE = {
  1: { colour: 'from-amber-400 via-yellow-400 to-orange-500', Icon: Crown,  label: '1st', badge: '🥇' },
  2: { colour: 'from-slate-300 via-slate-400 to-slate-500',   Icon: Medal,  label: '2nd', badge: '🥈' },
  3: { colour: 'from-amber-700 via-orange-700 to-rose-700',   Icon: Medal,  label: '3rd', badge: '🥉' },
};

function WinnerCard({ row, rank }) {
  const cfg = PODIUM_STYLE[rank] || {};
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${cfg.colour} text-white shadow-xl p-5 flex flex-col items-center text-center`}
      data-testid={`winner-podium-${rank}`}
    >
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/15 blur-2xl" />
      <div className="relative w-16 h-16 rounded-full bg-white/25 backdrop-blur flex items-center justify-center text-3xl font-black border-2 border-white/40">
        {cfg.badge}
      </div>
      <div className="relative text-xs uppercase tracking-widest mt-3 opacity-90">{cfg.label} place</div>
      <div className="relative font-display font-extrabold text-xl mt-1 truncate max-w-full">
        @{row.username || '—'}
      </div>
      <div className="relative text-xs opacity-85 font-mono mt-0.5">{row.public_id || '—'}</div>
      <div className="relative mt-4 grid grid-cols-2 gap-4 w-full">
        <div>
          <div className="text-[10px] uppercase tracking-wider opacity-80">Points</div>
          <div className="font-black text-2xl">{row.points ?? '—'}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider opacity-80">Accuracy</div>
          <div className="font-black text-2xl">{row.accuracy != null ? `${Math.round(row.accuracy)}%` : '—'}</div>
        </div>
      </div>
    </div>
  );
}

// Rank slot that only reveals its winner once `revealed` is true — used for the
// dramatic 3rd → 2nd → 1st live replay on the Winners page.
function RevealSlot({ rank, row, revealed }) {
  const cfg = PODIUM_STYLE[rank] || {};
  return (
    <div className="relative min-h-[260px]" data-testid={`reveal-slot-${rank}`}>
      <AnimatePresence mode="wait">
        {!revealed ? (
          <motion.div
            key="placeholder"
            initial={{ opacity: 1 }}
            animate={{
              opacity: [0.6, 1, 0.6],
              transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`absolute inset-0 rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 backdrop-blur flex flex-col items-center justify-center text-slate-400`}
          >
            <div className="text-3xl font-black mb-2 opacity-40">{cfg.badge}</div>
            <div className="text-xs uppercase tracking-widest">{cfg.label} place</div>
            <div className="text-[10px] mt-1">Revealing…</div>
          </motion.div>
        ) : row ? (
          <motion.div
            key="winner"
            initial={{ opacity: 0, y: 30, scale: 0.85, rotate: -3 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="absolute inset-0"
          >
            <WinnerCard row={row} rank={rank} />
          </motion.div>
        ) : (
          <motion.div
            key="vacant"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center text-slate-400 text-sm flex items-center justify-center"
          >
            {rank === 2 ? '2nd place vacant' : rank === 3 ? '3rd place vacant' : '1st place vacant'}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function WinnersReveal() {
  const { slug } = useParams();
  const { toast } = useToast();
  const [contest, setContest] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [tieBreak, setTieBreak] = useState([]);
  const [state, setState] = useState('loading');
  // Live-replay: how many podium places have been revealed so far (0..3).
  // Sequence plays 3rd → 2nd → 1st with a spring animation between each.
  const [revealedCount, setRevealedCount] = useState(0);
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    setState('loading');
    api.get(`/contests/${slug}`)
      .then(r => {
        setContest(r.data);
        return api.get(`/contests/${r.data.contest_id}/leaderboard?limit=50`);
      })
      .then(r => {
        setLeaderboard(r.data.entries || []);
        setTieBreak(r.data.tie_break_rules || []);
        setState('ok');
      })
      .catch(err => {
        setState(err?.response?.status === 404 ? 'missing' : 'error');
      });
  }, [slug]);

  // Play the reveal automatically once results load, and again when user clicks Replay
  useEffect(() => {
    if (state !== 'ok') return;
    setRevealedCount(0);
    const timers = [
      setTimeout(() => setRevealedCount(1), 900),   // 3rd
      setTimeout(() => setRevealedCount(2), 2000),  // 2nd
      setTimeout(() => setRevealedCount(3), 3200),  // 1st
    ];
    return () => timers.forEach(clearTimeout);
  }, [state, replayKey]);

  const playReplay = () => setReplayKey(k => k + 1);

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const winner = leaderboard[0];
  const shareText = winner
    ? `🏆 The results are in for "${contest?.title}" — congratulations to @${winner.username || 'the winner'} with ${winner.points} points! ${shareUrl}`
    : `Results for "${contest?.title}" — ${shareUrl}`;

  const twitterHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: 'Link copied' });
    } catch {
      toast({ title: 'Copy failed' });
    }
  };

  if (state === 'loading') {
    return <div className="max-w-6xl mx-auto p-10 text-slate-500">Loading results…</div>;
  }
  if (state === 'missing') {
    return <div className="max-w-6xl mx-auto p-10 text-slate-500">Contest not found.</div>;
  }
  if (state === 'error') {
    return <div className="max-w-6xl mx-auto p-10 text-rose-600">Failed to load results.</div>;
  }

  const podium = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8" data-testid="winners-reveal-page">
      <BackButton to={`/competition/${slug}`} label="Back to contest" className="mb-4" />

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-purple-700 to-indigo-800 text-white p-8 md:p-10 shadow-2xl">
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-16 w-96 h-96 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-bold uppercase tracking-widest mb-3">
            <Trophy className="w-3.5 h-3.5" /> Results announced
          </div>
          <h1 className="font-display font-extrabold text-3xl md:text-4xl leading-tight">
            {contest?.title}
          </h1>
          <p className="text-white/85 mt-2 text-sm max-w-2xl">
            {contest?.short_description || contest?.subtitle}
          </p>
          <div className="flex flex-wrap gap-6 mt-6">
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-75">Prize pool</div>
              <div className="font-display font-black text-3xl">{gbp(contest?.prize_amount || 0)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-75">Entries scored</div>
              <div className="font-display font-black text-3xl">{leaderboard.length}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-75">Winners</div>
              <div className="font-display font-black text-3xl">{contest?.num_prizes || 1}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Podium */}
      {podium.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-slate-200 bg-white/50 py-16 text-center" data-testid="winners-empty">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="font-display font-extrabold text-xl text-slate-800">No scores yet</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            This contest hasn&apos;t produced any verified skill scores yet. Results will appear
            here as soon as the first eligible entry is validated.
          </p>
          <Link to="/competitions" className="inline-block mt-4">
            <Button variant="outline">Browse open contests</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Reveal controls — animated live replay of the draw order */}
          <div className="mt-8 flex items-center justify-between flex-wrap gap-2" data-testid="reveal-controls">
            <div className="text-xs text-slate-500">
              <Sparkles className="w-3.5 h-3.5 inline mr-1 text-indigo-500" />
              Live replay of the draw — revealed in reverse order (3rd → 2nd → 1st)
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={playReplay}
              disabled={revealedCount < 3}
              data-testid="replay-btn"
            >
              <PlayCircle className="w-4 h-4 mr-1" /> {revealedCount < 3 ? 'Revealing…' : 'Replay'}
            </Button>
          </div>
          <div className="mt-4 grid md:grid-cols-3 gap-4" key={replayKey}>
            {/* Visual order left→right: 2nd, 1st, 3rd (classic podium look) */}
            {/* Reveal order: 3rd first, then 2nd, then 1st */}
            <RevealSlot rank={2} row={podium[1]} revealed={revealedCount >= 2} />
            <RevealSlot rank={1} row={podium[0]} revealed={revealedCount >= 3} />
            <RevealSlot rank={3} row={podium[2]} revealed={revealedCount >= 1} />
          </div>
        </>
      )}

      {/* Share buttons */}
      {podium.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2 items-center" data-testid="winners-share">
          <span className="text-sm text-slate-500 mr-2 inline-flex items-center gap-1">
            <Share2 className="w-4 h-4" /> Share:
          </span>
          <a href={twitterHref} target="_blank" rel="noreferrer" data-testid="share-twitter">
            <Button variant="outline" size="sm" className="border-sky-200 text-sky-600 hover:bg-sky-50">
              <Twitter className="w-4 h-4 mr-1" /> Twitter
            </Button>
          </a>
          <a href={facebookHref} target="_blank" rel="noreferrer" data-testid="share-facebook">
            <Button variant="outline" size="sm" className="border-blue-200 text-blue-700 hover:bg-blue-50">
              <Facebook className="w-4 h-4 mr-1" /> Facebook
            </Button>
          </a>
          <Button variant="outline" size="sm" onClick={copyLink} data-testid="share-copy">
            <Link2 className="w-4 h-4 mr-1" /> Copy link
          </Button>
        </div>
      )}

      {/* Full ranking */}
      {rest.length > 0 && (
        <div className="mt-10 bg-white rounded-2xl border border-slate-200 overflow-hidden" data-testid="full-leaderboard">
          <div className="flex items-center gap-2 p-4 border-b border-slate-100">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <h2 className="font-display font-extrabold text-lg text-slate-900">Full ranking</h2>
            <span className="text-xs text-slate-400 ml-2">({leaderboard.length} entrants)</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left p-3 w-16">Rank</th>
                <th className="text-left p-3">Player</th>
                <th className="text-left p-3">Public ID</th>
                <th className="text-right p-3">Points</th>
                <th className="text-right p-3">Accuracy</th>
                <th className="text-right p-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((r) => (
                <tr key={r.rank} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-bold text-slate-500">#{r.rank}</td>
                  <td className="p-3 font-medium text-slate-900">@{r.username || '—'}</td>
                  <td className="p-3 font-mono text-xs text-slate-500">{r.public_id || '—'}</td>
                  <td className="p-3 text-right font-mono">{r.points ?? '—'}</td>
                  <td className="p-3 text-right font-mono">{r.accuracy != null ? `${Math.round(r.accuracy)}%` : '—'}</td>
                  <td className="p-3 text-right font-mono text-xs text-slate-500">{r.duration_ms != null ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tie-break rules */}
      {tieBreak.length > 0 && (
        <div className="mt-6 rounded-xl bg-slate-50 border border-slate-100 p-4 text-xs text-slate-600" data-testid="winners-tiebreak">
          <div className="font-semibold text-slate-800 mb-1">Tie-break hierarchy used:</div>
          <ul className="space-y-0.5">
            {tieBreak.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          <p className="mt-2 text-slate-500">
            Every winning score is server-verified before the prize is released. Ranking is
            immutable once published.
          </p>
        </div>
      )}
    </div>
  );
}
