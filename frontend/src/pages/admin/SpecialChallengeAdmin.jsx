import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { ChevronLeft, ChevronRight, Plus, Rocket, Save, RefreshCw, Search } from 'lucide-react';

const newGame = (type, games) => {
  const size = type === 'colour_match' ? 4 : 20;
  const id = `${type === 'colour_match' ? 'colour-match' : 'number-sequence'}-${Date.now()}`;
  return { game_id: id, type, size, name: type === 'colour_match' ? 'New Colour Match' : 'New Number Sequence',
    time_limit_seconds: 10, entry_tokens: 1, prize_pence: 50000, prize_gbp: '500.00', max_attempts: 0, target_matches: 10, enabled: false };
};
const fields = [
  ['name', 'Game name', 'text'], ['size', 'Numbers / colours', 'number'],
  ['time_limit_seconds', 'Time limit (seconds)', 'number'],
  ['prize_gbp', 'Prize (£)', 'number'], ['max_attempts', 'Max attempts (0 = unlimited)', 'number'],
  ['target_matches', 'Colour Match target', 'number'],
];
const errorText = e => e?.response?.data?.detail || e?.message || 'Request failed';
const money = pence => `£${(Number(pence || 0) / 100).toFixed(2)}`;
const normalizeGame = game => ({ ...game, prize_gbp: (Number(game.prize_pence || 0) / 100).toFixed(2) });
const gamePayload = game => {
  const { prize_gbp, ...payload } = game;
  return { ...payload, size: Number(game.size), time_limit_seconds: Number(game.time_limit_seconds),
    entry_tokens: Number(game.entry_tokens), prize_pence: Math.round(Number(prize_gbp ?? Number(game.prize_pence || 0) / 100) * 100),
    max_attempts: Number(game.max_attempts), target_matches: Number(game.target_matches) };
};

export default function SpecialChallengeAdmin() {
  const [games, setGames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState('');
  const [launching, setLaunching] = useState(false);
  const [notice, setNotice] = useState('');
  const [report, setReport] = useState({ items: [], games: [], total_rows: 0 });
  const [reportSearch, setReportSearch] = useState('');
  const [reportGame, setReportGame] = useState('');
  const [reportSkip, setReportSkip] = useState(0);
  const [reportBusy, setReportBusy] = useState(true);
  const [reportError, setReportError] = useState('');
  const load = async () => {
    setBusy(true); setNotice('');
    try { const { data } = await api.get('/admin/winnings/challenge/games'); setGames((data.games || []).map(normalizeGame)); }
    catch (e) { setNotice(errorText(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setReportBusy(true);
      setReportError('');
      try {
        const { data } = await api.get('/admin/winnings/challenge/report', {
          params: {
            search: reportSearch.trim() || undefined,
            game_id: reportGame || undefined,
            skip: reportSkip,
            limit: 100,
          },
        });
        if (!cancelled) setReport(data);
      } catch (e) {
        if (!cancelled) setReportError(errorText(e));
      } finally {
        if (!cancelled) setReportBusy(false);
      }
    }, reportSearch ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reportSearch, reportGame, reportSkip]);
  const edit = (id, field, value) => setGames(items => items.map(g => g.game_id === id ? { ...g, [field]: value } : g));
  const save = async (g) => {
    setSaving(g.game_id); setNotice('');
    try {
      const payload = gamePayload(g);
      const { data } = await api.put(`/admin/winnings/challenge/games/${encodeURIComponent(g.game_id)}`, payload);
      setGames(items => items.map(item => item.game_id === g.game_id ? normalizeGame(data.game || payload) : item));
      setNotice(`${g.name} saved: ${money(payload.prize_pence)} prize, ${payload.time_limit_seconds}s timer.`);
    } catch (e) { setNotice(errorText(e)); }
    finally { setSaving(''); }
  };
  const togglePublished = async (game) => {
    const enabled = !game.enabled;
    setSaving(game.game_id); setNotice('');
    try {
      const { data } = await api.patch(`/admin/winnings/challenge/games/${encodeURIComponent(game.game_id)}/enabled`, { enabled });
      setGames(items => items.map(item => item.game_id === game.game_id ? normalizeGame(data.game || { ...game, enabled }) : item));
      setNotice(`${game.name} is ${enabled ? 'LIVE' : 'STOPPED'}. ${enabled ? 'New attempts are open.' : 'New attempts are blocked; active attempts can finish.'}`);
    } catch (e) { setNotice(errorText(e)); }
    finally { setSaving(''); }
  };
  const launchAll = async () => {
    if (!window.confirm('Publish every configured challenge with hard time limits? Each attempt costs 1 token; winning a game starts a 24-hour cooldown for that game.')) return;
    setLaunching(true); setNotice('');
    try {
      const { data } = await api.post('/admin/winnings/challenge/games/launch-all');
      const { data: refreshed } = await api.get('/admin/winnings/challenge/games');
      setGames((refreshed.games || []).map(normalizeGame));
      setNotice(`${data.launched_count} games published. Their configured time limits were preserved.`);
    } catch (e) { setNotice(errorText(e)); }
    finally { setLaunching(false); }
  };
  return <div className="mx-auto max-w-6xl p-5 text-slate-900">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black">Special Challenge Games</h1><p className="text-sm text-slate-500">Configure entry, prize, difficulty, and availability independently.</p></div><div className="flex flex-wrap gap-2"><button onClick={launchAll} disabled={launching || busy} className="flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white disabled:opacity-50"><Rocket size={16} /> {launching ? 'Publishing…' : 'Publish all games'}</button><button onClick={load} className="flex items-center gap-2 rounded-lg border px-3 py-2"><RefreshCw size={16} /> Refresh</button></div></div>
    <p className="mb-5 text-sm font-semibold text-slate-600">Each attempt costs 1 token. A player can win each game once per rolling 24 hours.</p>
    <div className="mb-5 flex flex-wrap gap-2">{['number_sequence', 'colour_match'].map(type => <button key={type} onClick={() => setGames(items => [...items, newGame(type, items)])} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white"><Plus size={16} /> Add {type === 'colour_match' ? 'Colour Match' : 'Number Sequence'}</button>)}</div>
    {notice && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm">{notice}</p>}
    {busy && <p>Loading…</p>}
    {['number_sequence', 'colour_match'].map(type => <section key={type} className="mb-8"><h2 className="mb-3 text-xl font-bold">{type === 'colour_match' ? 'Colour Match' : 'Number Sequence'}</h2>
      <div className="grid gap-4 lg:grid-cols-2">{games.filter(g => g.type === type).sort((a,b) => a.size-b.size).map(g => <div key={g.game_id} className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3"><div className="text-xs text-slate-500">{g.game_id}</div><div className="flex items-center gap-2"><span className={`text-xs font-bold ${g.enabled ? 'text-emerald-700' : 'text-slate-500'}`}>{g.enabled ? 'LIVE' : 'STOPPED'}</span><button type="button" onClick={() => togglePublished(g)} disabled={saving === g.game_id} data-testid={`challenge-game-toggle-${g.game_id}`} className={`rounded-lg px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50 ${g.enabled ? 'bg-rose-700 hover:bg-rose-600' : 'bg-emerald-700 hover:bg-emerald-600'}`}>{saving === g.game_id ? 'Saving…' : g.enabled ? 'Stop game' : 'Launch game'}</button></div></div>
        <div className="grid grid-cols-2 gap-3">{fields.filter(([name]) => type === 'colour_match' || name !== 'target_matches').map(([name, label, inputType]) => <label key={name} className="text-xs font-semibold text-slate-600">{label}<input type={inputType} min={inputType === 'number' ? 0 : undefined} step={name === 'prize_gbp' ? '0.01' : undefined} value={g[name] ?? ''} onChange={e => edit(g.game_id, name, e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>)}</div>
        <p className="mt-3 text-xs text-slate-500">Prize is entered in pounds and saved precisely in pence. Click Save game to apply timer and prize changes. Existing game size/type cannot be changed. 0 attempts = unlimited.</p>
        <button disabled={saving === g.game_id} onClick={() => save(g)} className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Save size={16} /> {saving === g.game_id ? 'Saving…' : 'Save game'}</button>
      </div>)}</div>
    </section>)}
    <section className="mt-10 overflow-hidden rounded-xl border bg-white" data-testid="challenge-admin-report">
      <div className="border-b p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Player spending &amp; winnings</h2>
            <p className="mt-1 text-sm text-slate-500">Per-player totals by game. Winnings count credited rewards only.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={reportSearch} onChange={event => { setReportSkip(0); setReportSearch(event.target.value); }}
                placeholder="Search name, email or ID" aria-label="Search challenge report players"
                className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm sm:w-64" />
            </label>
            <select value={reportGame} onChange={event => { setReportSkip(0); setReportGame(event.target.value); }}
              className="rounded-lg border bg-white px-3 py-2 text-sm" aria-label="Filter report by game">
              <option value="">All games</option>
              {games.map(game => <option key={game.game_id} value={game.game_id}>{game.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <ReportStat label="Attempts" value={report.games.reduce((sum, game) => sum + game.attempt_count, 0)} />
          <ReportStat label="Tokens spent" value={report.games.reduce((sum, game) => sum + game.tokens_spent, 0)} />
          <ReportStat label="Credited winnings" value={money(report.games.reduce((sum, game) => sum + game.credited_winnings_pence, 0))} />
        </div>
      </div>
      {reportBusy ? <p className="p-5 text-sm text-slate-500" role="status">Loading player report…</p>
        : reportError ? <p className="p-5 text-sm text-rose-700" role="alert">{reportError}</p>
          : report.items.length === 0 ? <p className="p-5 text-sm text-slate-500">No challenge attempts match this filter.</p>
            : <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">Player</th><th className="px-4 py-3 font-bold">Game</th>
                    <th className="px-4 py-3 text-right font-bold">Attempts</th><th className="px-4 py-3 text-right font-bold">Tokens spent</th>
                    <th className="px-4 py-3 text-right font-bold">Wins</th><th className="px-4 py-3 text-right font-bold">Winnings</th>
                    <th className="px-4 py-3 font-bold">Game available</th><th className="px-4 py-3 font-bold">Last attempt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.items.map(row => {
                    const cooldownUntil = row.cooldown_until ? new Date(row.cooldown_until) : null;
                    const coolingDown = cooldownUntil && cooldownUntil.getTime() > Date.now();
                    return <tr key={`${row.user_id}-${row.game_id}`} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-3"><div className="font-bold text-slate-900">{row.name || row.username || 'Unnamed player'}</div><div className="mt-0.5 text-xs text-slate-500">{row.email || row.public_id || row.user_id}</div></td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{row.game_name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.attempt_count}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{row.tokens_spent}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.wins}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700 tabular-nums">{money(row.credited_winnings_pence)}</td>
                      <td className="px-4 py-3 text-xs">{coolingDown ? `After ${cooldownUntil.toLocaleString()}` : 'Available'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{row.last_attempt ? new Date(row.last_attempt).toLocaleString() : '—'}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-slate-500">
                <span>Showing {reportSkip + 1}–{reportSkip + report.items.length} of {report.total_rows} player/game records.</span>
                <div className="flex gap-2">
                  <button type="button" disabled={reportSkip === 0} onClick={() => setReportSkip(value => Math.max(0, value - 100))} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 font-bold text-slate-700 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Previous</button>
                  <button type="button" disabled={reportSkip + report.items.length >= report.total_rows} onClick={() => setReportSkip(value => value + 100)} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 font-bold text-slate-700 disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            </div>}
    </section>
  </div>;
}

function ReportStat({ label, value }) {
  return <div className="rounded-lg border bg-slate-50 px-4 py-3">
    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
    <strong className="mt-1 block text-xl text-slate-900">{value}</strong>
  </div>;
}
