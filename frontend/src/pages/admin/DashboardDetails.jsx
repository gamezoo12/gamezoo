import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { adminAPI } from '../../lib/api';
import { gbp } from '../../lib/format';

const COLUMNS = {
  users: [['name', 'Name'], ['email', 'Email'], ['role', 'Role'], ['created_at', 'Joined']],
  signups: [['name', 'Name'], ['email', 'Email'], ['role', 'Role'], ['created_at', 'Joined']],
  orders: [['order_id', 'Order'], ['user_name', 'User'], ['total', 'Total'], ['status', 'Status'], ['created_at', 'Created']],
  revenue: [['order_id', 'Order'], ['user_name', 'User'], ['total', 'Revenue'], ['status', 'Status'], ['created_at', 'Created']],
  tickets: [['ticket_number', 'Ticket'], ['user.name', 'User'], ['contest_id', 'Contest'], ['created_at', 'Created']],
  visitors: [['visitor_id', 'Visitor'], ['user.email', 'Account'], ['visit_count', 'Visits'], ['source', 'Source'], ['channel', 'Channel'], ['landing_path', 'Last landing'], ['last_seen', 'Last seen']],
  page_views: [['visitor_id', 'Visitor'], ['user_id', 'User ID'], ['page_path', 'Page'], ['created_at', 'Viewed']],
  paid_scores: [['user.name', 'User'], ['contest_id', 'Contest'], ['ticket_id', 'Ticket'], ['points', 'Score'], ['duration_ms', 'Time (ms)'], ['created_at', 'Submitted']],
  free_scores: [['user.name', 'User'], ['global_contest_number', 'Championship'], ['score', 'Score'], ['duration_ms', 'Time (ms)'], ['submitted_at', 'Submitted']],
  free_level_attempts: [['user.name', 'User'], ['user.email', 'Email'], ['champion_stage', 'Championship'], ['level', 'Level'], ['status', 'Status'], ['created_at', 'Attempted']],
  free_token_spend: [['user_id', 'User ID'], ['event_type', 'Event'], ['level', 'Level'], ['token_cost', 'Tokens'], ['created_at', 'Date']],
  free_winnings: [['user.name', 'User'], ['winning_amount', 'Amount'], ['created_at', 'Awarded']],
  paid_winnings: [['user.name', 'User'], ['contest_id', 'Contest'], ['prize_amount', 'Prize'], ['drawn_at', 'Drawn']],
};

const valueAt = (row, path) => path.split('.').reduce((value, key) => value?.[key], row);
const display = (value, field) => {
  if (value == null || value === '') return '—';
  if (field === 'total' || field === 'revenue' || field === 'winning_amount' || field === 'prize_amount') return gbp(value);
  if (field.endsWith('_at') || field === 'created_at') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }
  return String(value);
};

export default function DashboardDetails({ metric, period, onClose }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 100;
  const columns = COLUMNS[metric] || [];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    adminAPI.dashboardDetails({ metric, period, skip, limit })
      .then((data) => {
        if (!active) return;
        setItems(data.items || []);
        setTotal(data.total || 0);
      })
      .catch((requestError) => {
        if (active) setError(requestError?.response?.data?.detail || 'Could not load these details.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [metric, period, skip]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="dashboard-details-title" data-testid="dashboard-details-modal">
      <section className="flex max-h-[92vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-700">{period} detail</p>
            <h2 id="dashboard-details-title" className="mt-1 text-xl font-black capitalize text-slate-950">{metric.replace(/_/g, ' ')}</h2>
            <p className="mt-1 text-xs text-slate-500">{total.toLocaleString()} matching records</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950"><X className="h-5 w-5" /></button>
        </header>
        {error ? <p role="alert" className="p-5 text-sm text-rose-700">{error}</p> : loading ? <p role="status" className="p-8 text-center text-sm text-slate-500">Loading records…</p> : items.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No records in this time range.</p> : (
          <div className="overflow-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                {columns.map(([, label]) => <th key={label} className="px-4 py-3 font-bold">{label}</th>)}
                <th className="px-4 py-3 text-right font-bold">Record</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row, index) => <tr key={row.order_id || row.ticket_id || row.score_id || row.view_id || row.visit_id || row.user_id || `${skip}-${index}`} className="hover:bg-slate-50">
                  {columns.map(([field, label]) => <td key={field} className="max-w-[320px] truncate px-4 py-3 text-slate-700">{display(valueAt(row, field), field)}</td>)}
                  <td className="px-4 py-3 text-right">{row.user_id ? <Link to={`/admin/users/${row.user_id}`} className="font-bold text-indigo-700 hover:underline">User 360</Link> : row.order_id ? <span className="font-mono text-xs text-slate-500">{row.order_id}</span> : '—'}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
        <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <span className="text-xs text-slate-500">Showing {total === 0 ? 0 : skip + 1}–{Math.min(skip + items.length, total)} of {total}</span>
          <div className="flex gap-2">
            <button type="button" disabled={skip === 0 || loading} onClick={() => setSkip((value) => Math.max(0, value - limit))} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs font-bold disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Previous</button>
            <button type="button" disabled={skip + items.length >= total || loading} onClick={() => setSkip((value) => value + limit)} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs font-bold disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        </footer>
      </section>
    </div>
  );
}
