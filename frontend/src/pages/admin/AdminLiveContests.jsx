import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const API = '/admin/live-contests';
async function load(url) {
  const response = await api.get(url);
  return response.data;
}
const money = value => value == null ? 'Unknown' : `£${Number(value).toFixed(2)}`;
const date = value => value ? new Date(value).toLocaleString() : 'Unknown';

export default function AdminLiveContests() {
  const [contests, setContests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try {
      const result = await load(API);
      setContests(result.contests || []);
      if (selected) {
        const next = await load(`${API}/${encodeURIComponent(selected)}/participants`);
        setDetails(next);
      }
      setError('');
    } catch (e) { setError(e?.response?.data?.detail || e.message || 'Unable to load live contests'); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); const timer = setInterval(refresh, 30000); return () => clearInterval(timer); }, [selected]);
  const openContest = async id => {
    setSelected(id);
    setDetails(null);
    setExpanded(null);
    try { setDetails(await load(`${API}/${encodeURIComponent(id)}/participants`)); setError(''); }
    catch (e) { setError(e?.response?.data?.detail || e.message || 'Unable to load live contests'); }
  };
  const people = (details?.participants || []).filter(p =>
    `${p.name || ''} ${p.username || ''} ${p.email || ''} ${p.user_id || ''} ${p.public_id || ''}`.toLowerCase().includes(query.toLowerCase())
  );
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-slate-900">Live Contests</h1><p className="text-sm text-slate-500">Read-only ticket and purchase monitoring · refreshes every 30 seconds</p></div>
      <button onClick={refresh} disabled={loading} className="rounded-lg bg-violet-700 px-4 py-2 text-white disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh now'}</button>
    </div>
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {contests.map(c => <button key={c.contest_id} onClick={() => openContest(c.contest_id)}
        className={`rounded-xl border bg-white p-4 text-left shadow-sm ${selected === c.contest_id ? 'border-violet-600' : 'border-slate-200'}`}>
        <h2 className="font-semibold text-slate-900">{c.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{c.issued_tickets} issued tickets · {c.participant_count} users</p>
        <p className="text-sm text-slate-600">Price {money(c.price)} · Limit/user {c.max_tickets_per_user ?? 'Not set'}</p>
        <p className="text-sm text-slate-600">Remaining (counter): {Math.max(0, Number(c.tickets_total || 0) - Number(c.tickets_sold || 0))}</p>
      </button>)}
      {!contests.length && !loading && <p className="text-slate-500">No live contests found.</p>}
    </div>
    {selected && <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-bold">{details?.contest?.title || 'Loading participants…'}</h2>
      <p className="mb-3 text-sm text-slate-500">Click a participant to see every recorded ticket, order and price.</p>
      <input aria-label="Search participants" placeholder="Search name, username, email or user ID" value={query}
        onChange={e => setQuery(e.target.value)} className="mb-4 w-full rounded-lg border p-2 md:max-w-lg" />
      <div className="space-y-3">
        {people.map(p => <div key={p.user_id} className="rounded-lg border">
          <button className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left" onClick={() => setExpanded(expanded === p.user_id ? null : p.user_id)}>
            <span className="font-semibold">{p.name || p.username || p.user_id} <span className="font-normal text-slate-500">({p.email || p.user_id})</span></span>
            <span className="text-sm">{p.ticket_count} tickets · {p.paid_count} paid · {p.free_count} free · {p.unknown_count} unknown · {money(p.total_paid)}</span>
          </button>
          {expanded === p.user_id && <div className="overflow-x-auto border-t p-3">
            <p className="mb-2 text-sm">Full name: {p.name || 'Unknown'} · Username: {p.username || 'Unknown'} · User ID: {p.user_id} · Public ID: {p.public_id || '—'}</p>
            <table className="w-full min-w-[750px] text-left text-sm"><thead><tr className="border-b text-slate-500">
              {['Ticket number','Ticket ID','Entry type','Source','Price','Order ID','Payment','Status','Purchased'].map(h => <th key={h} className="p-2">{h}</th>)}
            </tr></thead><tbody>{p.tickets.map((t,i) => <tr key={t.ticket_id || i} className="border-b">
              <td className="p-2">{t.ticket_number ?? '—'}</td><td className="p-2">{t.ticket_id || '—'}</td>
              <td className="p-2 capitalize">{t.entry_type}</td><td className="p-2">{t.entry_source || 'Unknown'}</td>
              <td className="p-2">{money(t.price)}</td><td className="p-2">{t.order_id || '—'}</td>
              <td className="p-2">{t.payment_method || 'Unknown'}</td><td className="p-2">{t.order_status || 'Unknown'}</td>
              <td className="p-2">{date(t.purchased_at)}</td>
            </tr>)}</tbody></table>
          </div>}
        </div>)}
        {details && !people.length && <p className="text-slate-500">No matching participants.</p>}
      </div>
    </section>}
  </div>;
}
