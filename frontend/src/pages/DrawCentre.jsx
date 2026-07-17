import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Trophy, Clock, Sparkles, XCircle, CheckCircle2 } from 'lucide-react';
import { contestsAPI, ordersAPI, publicAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { countdown, gbp } from '../lib/format';
import BackButton from '../components/BackButton';

const FALLBACK_IMG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="%23111828"/><text x="50%" y="50%" text-anchor="middle" dy=".35em" fill="%236C2BFF" font-family="sans-serif" font-size="28" font-weight="bold">Prize League</text></svg>';

function Countdown({ endDate }) {
  const [t, setT] = useState(() => countdown(endDate));
  useEffect(() => {
    const i = setInterval(() => setT(countdown(endDate)), 1000);
    return () => clearInterval(i);
  }, [endDate]);
  const closed = t.days === 0 && t.hours === 0 && t.mins === 0 && t.secs === 0;
  if (closed) return <span className="text-rose-600 font-semibold text-xs">Closed — awaiting draw</span>;
  return (
    <span className="text-xs text-slate-600 font-semibold" data-testid="pending-countdown">
      {t.days}d {String(t.hours).padStart(2,'0')}h {String(t.mins).padStart(2,'0')}m
    </span>
  );
}

export default function DrawCentre() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [contests, setContests] = useState([]);
  const [winners, setWinners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const promises = [
        contestsAPI.list().then((r) => cancelled || setContests(r)).catch(() => setContests([])),
        publicAPI.winners().then((r) => cancelled || setWinners(r)).catch(() => setWinners([])),
      ];
      if (user) {
        promises.push(ordersAPI.myTickets().then((r) => cancelled || setTickets(r)).catch(() => setTickets([])));
      }
      await Promise.all(promises);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const { pending, myResults } = useMemo(() => {
    const contestMap = Object.fromEntries(contests.map((c) => [c.contest_id, c]));
    const myByContest = tickets.reduce((acc, t) => {
      acc[t.contest_id] = (acc[t.contest_id] || 0) + 1;
      return acc;
    }, {});
    const drawnContestIds = new Set(winners.filter(w => myByContest[w.contest_id]).map(w => w.contest_id));

    const pending = Object.entries(myByContest)
      .filter(([cid]) => contestMap[cid] && !drawnContestIds.has(cid))
      .map(([cid, count]) => ({ contest: contestMap[cid], ticketCount: count }));

    const myResults = winners.map(w => ({
      ...w,
      contest: contestMap[w.contest_id],
      isMine: !!myByContest[w.contest_id],
    }));

    return { pending, myResults };
  }, [contests, winners, tickets]);

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8 md:py-10" data-testid="draw-centre">
      <BackButton to="/" label="Home" className="mb-4" />
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#8B5CFF] to-[#6C2BFF] flex items-center justify-center">
          <Trophy className="w-6 h-6 text-[#FFD54A]" />
        </div>
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold text-slate-900">Draw Centre</h1>
          <p className="text-sm text-slate-500">Track your pending draws and see the latest published results.</p>
        </div>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="pending" data-testid="tab-pending">Pending Draws {pending.length ? <span className="ml-2 text-xs bg-[#6C2BFF] text-white rounded-full px-2 py-0.5">{pending.length}</span> : null}</TabsTrigger>
          <TabsTrigger value="results" data-testid="tab-results">Draw Results</TabsTrigger>
        </TabsList>

        {/* PENDING */}
        <TabsContent value="pending" className="mt-6">
          {!user ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
              <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">Sign in to see draws where you own tickets.</p>
              <Link to="/login" className="inline-block mt-4 px-4 py-2 rounded-full pl-btn-gold text-slate-900 font-bold">Sign in</Link>
            </div>
          ) : loading ? (
            <div className="text-slate-500 py-8">Loading your pending draws…</div>
          ) : pending.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center" data-testid="pending-empty">
              <Sparkles className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">No pending draws yet.</p>
              <Link to="/competitions" className="inline-block mt-4 px-4 py-2 rounded-full pl-btn-purple text-white font-bold">Browse contests</Link>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {pending.map(({ contest, ticketCount }) => (
                <Link to={`/competition/${contest.slug}`} key={contest.contest_id} className="bg-white rounded-2xl border border-slate-100 hover:border-[#6C2BFF]/40 hover:shadow-lg transition p-4 flex gap-4" data-testid={`pending-item-${contest.contest_id}`}>
                  <img
                    src={contest.image}
                    alt={contest.title}
                    onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }}
                    className="w-24 h-24 object-cover rounded-xl bg-slate-100 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 break-words">{contest.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Prize {gbp(contest.prize_amount)}</div>
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <Badge className="bg-[#6C2BFF]/10 text-[#6C2BFF] hover:bg-[#6C2BFF]/10">{ticketCount} ticket{ticketCount !== 1 ? 's' : ''}</Badge>
                      <Countdown endDate={contest.end_date} />
                    </div>
                    <div className="text-[11px] text-slate-500 mt-2">Draw: {new Date(contest.end_date).toLocaleString('en-GB')}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* RESULTS */}
        <TabsContent value="results" className="mt-6">
          {loading ? (
            <div className="text-slate-500 py-8">Loading published draws…</div>
          ) : myResults.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center" data-testid="results-empty">
              <Trophy className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">No draw results published yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]" data-testid="results-table">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left p-3">Contest</th>
                    <th className="text-left p-3">Winner</th>
                    <th className="text-left p-3">Ticket</th>
                    <th className="text-left p-3">Prize</th>
                    <th className="text-left p-3">Drawn at</th>
                    <th className="text-left p-3">Your result</th>
                  </tr>
                </thead>
                <tbody>
                  {myResults.map((r) => (
                    <tr key={r.winner_id} className="border-t border-slate-100">
                      <td className="p-3 font-semibold text-slate-900">{r.contest ? r.contest.title : r.prize_title}</td>
                      <td className="p-3 text-slate-700">{r.user_name}</td>
                      <td className="p-3 text-slate-500 font-mono text-xs">#{r.ticket_number}</td>
                      <td className="p-3 text-[#6C2BFF] font-bold">{gbp(r.prize_amount)}</td>
                      <td className="p-3 text-slate-500 text-xs">{new Date(r.drawn_at).toLocaleString('en-GB')}</td>
                      <td className="p-3">
                        {r.isMine ? (
                          user && r.user_id === user.user_id ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold"><CheckCircle2 className="w-3 h-3" /> You WON!</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600"><XCircle className="w-3 h-3" /> Not selected</span>
                          )
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
