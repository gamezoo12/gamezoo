import { useCallback, useEffect, useState } from 'react';
import { acquisitionAdminAPI } from '../../lib/api';
import { Download } from 'lucide-react';

const RANGES = [
  ['Today', 'today'], ['Yesterday', 'yesterday'], ['Last 7 days', '7d'],
  ['Last 30 days', '30d'], ['This month', 'month'], ['Custom', 'custom'],
];
const SOURCES = [
  ['', 'All sources'], ['google_organic', 'Google organic'], ['google_ads', 'Google Ads'], ['instagram', 'Instagram'],
  ['facebook', 'Facebook'], ['x_twitter', 'X / Twitter'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'],
  ['whatsapp', 'WhatsApp'], ['referral', 'Referral websites'], ['direct', 'Direct'], ['email', 'Email'], ['other', 'Other / unknown'],
];
const DEVICES = [['', 'All devices'], ['desktop', 'Desktop'], ['mobile', 'Mobile'], ['tablet', 'Tablet']];
const PAGES = [
  ['', 'All pages'], ['world_selection', 'World Selection'], ['free_world', 'Free World'], ['paid_world', 'Paid World'],
  ['competitions', 'Competitions'], ['competition_detail', 'Competition detail'], ['special_challenges', 'Special / Impossible Challenges'],
  ['leaderboards', 'Leaderboards'], ['registration', 'Registration'], ['login', 'Login'], ['wallet', 'Wallet'],
  ['my_account', 'My Account'], ['cart', 'Cart'], ['results', 'Winners & draws'], ['info_pages', 'Info pages'], ['other', 'Other'],
];

const fmt = (v, suffix = '') => (v === null || v === undefined ? '\u2014' : `${v}${suffix}`);

function Card({ label, value, hint, testid }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid={testid}>
      <div className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">{label}</div>
      <div className="mt-1 font-black text-2xl text-slate-800">{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function Table({ cols, rows, empty = 'No data in this period.' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase text-slate-500">
          <tr>{cols.map(([label]) => <th key={label} className="px-2 py-1.5 whitespace-nowrap">{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              {cols.map(([label, get]) => <td key={label} className="px-2 py-1.5 tabular-nums">{get(row)}</td>)}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={cols.length} className="px-2 py-4 text-slate-400">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function AcquisitionAnalytics() {
  const [range, setRange] = useState('7d');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [source, setSource] = useState('');
  const [campaign, setCampaign] = useState('');
  const [device, setDevice] = useState('');
  const [page, setPage] = useState('');
  const [data, setData] = useState({});
  const [error, setError] = useState('');
  const [events, setEvents] = useState({ rows: [], total: 0 });
  const [skip, setSkip] = useState(0);

  const params = useCallback(() => {
    const p = { range };
    if (range === 'custom') { p.start = start; p.end = end; }
    if (source) p.source = source;
    if (campaign.trim()) p.campaign = campaign.trim();
    if (device) p.device = device;
    if (page) p.page = page;
    return p;
  }, [range, start, end, source, campaign, device, page]);

  useEffect(() => {
    if (range === 'custom' && (!start || !end)) return;
    let cancelled = false;
    const p = params();
    setError('');
    Promise.all(['overview', 'sources', 'pages', 'funnel', 'journeys'].map((r) => acquisitionAdminAPI.analytics(r, p)))
      .then(([overview, sources, pages, funnel, journeys]) => {
        if (!cancelled) setData({ overview, sources, pages, funnel, journeys });
      })
      .catch((e) => !cancelled && setError(e?.response?.data?.detail || 'Could not load analytics'));
    setSkip(0);
    return () => { cancelled = true; };
  }, [params, range, start, end]);

  useEffect(() => {
    if (range === 'custom' && (!start || !end)) return;
    acquisitionAdminAPI.analytics('events', { ...params(), skip, limit: 25 }).then(setEvents).catch(() => {});
  }, [params, skip, range, start, end]);

  const download = async (report) => {
    try {
      const blob = await acquisitionAdminAPI.exportCsv(report, params());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${report}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.response?.status === 403 ? 'Only admins can export CSV' : 'Export failed');
    }
  };

  const m = data.overview?.metrics;
  const sel = 'px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white';
  return (
    <section className="space-y-5" data-testid="acquisition-analytics">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {RANGES.map(([label, value]) => (
            <button key={value} type="button" onClick={() => setRange(value)} data-testid={`analytics-range-${value}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${range === value ? 'bg-[#6C2BFF] text-white' : 'text-slate-600 hover:bg-slate-50 border border-slate-200'}`}>
              {label}
            </button>
          ))}
          {range === 'custom' && (
            <>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={sel} data-testid="analytics-start" />
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={sel} data-testid="analytics-end" />
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={source} onChange={(e) => setSource(e.target.value)} className={sel} data-testid="analytics-source">
            {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Campaign" className={sel} data-testid="analytics-campaign" />
          <select value={device} onChange={(e) => setDevice(e.target.value)} className={sel}>
            {DEVICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={page} onChange={(e) => setPage(e.target.value)} className={sel}>
            {PAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span className="ml-auto flex flex-wrap gap-1">
            {['pages', 'sources', 'funnel', 'journeys'].map((r) => (
              <button key={r} type="button" onClick={() => download(r)} data-testid={`analytics-export-${r}`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                <Download className="w-3.5 h-3.5" /> {r} CSV
              </button>
            ))}
          </span>
        </div>
        <div className="text-[11px] text-slate-400">
          Reporting timezone: <b>{data.overview?.range?.timezone || 'Europe/London'}</b>
          {data.overview?.range?.label && <> · {data.overview.range.label}</>}
          {data.overview?.tracking_started_at && <> · session tracking since {new Date(data.overview.tracking_started_at).toLocaleDateString('en-GB')}</>}
        </div>
        {error && <div className="text-sm text-rose-600" role="alert">{error}</div>}
      </div>

      {m && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3" data-testid="analytics-kpis">
            <Card testid="kpi-page-views" label="Page views" value={m.total_page_views} />
            <Card testid="kpi-unique-page-views" label="Unique page views" value={m.unique_page_views} />
            <Card testid="kpi-sessions" label="Sessions" value={m.total_sessions} />
            <Card testid="kpi-visitors" label="Unique visitors" value={m.unique_visitors} />
            <Card testid="kpi-new" label="New visitors" value={m.new_visitors} />
            <Card testid="kpi-returning" label="Returning visitors" value={m.returning_visitors} />
            <Card testid="kpi-impressions" label="Impressions" value="Not connected" hint="No platform integration" />
            <Card testid="kpi-registrations" label="Registrations" value={m.total_registrations} hint={`${m.attributed_registrations} attributed`} />
            <Card testid="kpi-verified" label="Phone verifications" value={m.completed_phone_verifications} />
            <Card testid="kpi-v2r" label="Visitor \u2192 registration" value={fmt(m.visitor_to_registration_rate, '%')} />
            <Card testid="kpi-r2g" label="Registration \u2192 first game" value={fmt(m.registration_to_first_game_rate, '%')} hint={`${m.registered_cohort_started_game}/${m.registered_cohort_size}`} />
            <Card testid="kpi-bounce" label="Bounce rate" value={fmt(m.bounce_rate, '%')} hint="1 page, <10s" />
            <Card testid="kpi-engagement" label="Avg engagement" value={fmt(m.average_engagement_seconds, 's')} />
            <Card testid="kpi-pps" label="Pages / session" value={fmt(m.pages_per_session)} />
          </div>
          <div className="text-xs text-slate-500">
            Visitors by state: anonymous {data.overview.visitor_states.anonymous} · registered {data.overview.visitor_states.registered} · verified {data.overview.visitor_states.verified}
          </div>
        </>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid="analytics-funnel">
        <h3 className="font-bold mb-2">Funnel</h3>
        <Table
          cols={[
            ['Step', (r) => r.label], ['Unit', (r) => r.unit], ['Count', (r) => r.count],
            ['Conversion', (r) => fmt(r.conversion_pct, '%')], ['Drop-off', (r) => fmt(r.drop_off_pct, '%')],
            ['vs', (r) => r.compared_to || '\u2014'],
          ]}
          rows={data.funnel?.steps || []}
        />
        {(data.funnel?.notes || []).map((n) => <div key={n} className="text-[11px] text-slate-400 mt-1">{n}</div>)}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid="analytics-sources">
        <h3 className="font-bold mb-2">Traffic sources</h3>
        <Table
          cols={[
            ['Source', (r) => r.source_label], ['Medium', (r) => r.medium], ['Campaign', (r) => r.campaign],
            ['Landing page', (r) => r.landing_page], ['Sessions', (r) => r.sessions], ['Visitors', (r) => r.unique_visitors],
            ['Registrations', (r) => r.registrations], ['Conv.', (r) => fmt(r.conversion_rate, '%')], ['Game starts', (r) => r.game_starts],
          ]}
          rows={data.sources?.rows || []}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid="analytics-pages">
        <h3 className="font-bold mb-2">Pages</h3>
        <Table
          cols={[
            ['Page', (r) => `${r.label} (${r.page})`], ['Views', (r) => r.views], ['Visitors', (r) => r.unique_visitors],
            ['Sessions', (r) => r.sessions], ['Entrances', (r) => r.entrances], ['Exits', (r) => r.exits],
            ['Avg time', (r) => fmt(r.avg_engagement_seconds, 's')], ['Reg. (landing)', (r) => r.registrations_from_landing],
            ['Previous', (r) => r.previous_page || '\u2014'], ['Next', (r) => r.next_page || '\u2014'],
            ['Top source', (r) => r.top_source || '\u2014'],
            ['Devices', (r) => Object.entries(r.devices || {}).map(([k, v]) => `${k} ${v}`).join(', ')],
          ]}
          rows={data.pages?.rows || []}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid="analytics-journeys">
        <h3 className="font-bold mb-2">Top visitor journeys</h3>
        <Table cols={[['Journey', (r) => r.journey], ['Sessions', (r) => r.sessions]]} rows={data.journeys?.rows || []} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid="analytics-events">
        <h3 className="font-bold mb-2">Page view log ({events.total})</h3>
        <Table
          cols={[
            ['Time', (r) => new Date(r.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })],
            ['Page', (r) => r.page_path], ['From', (r) => r.prev_path || '\u2014'], ['Source', (r) => r.source_key],
            ['Device', (r) => r.device_type], ['State', (r) => r.user_state], ['Engaged', (r) => `${Math.round((r.engaged_ms || 0) / 1000)}s`],
          ]}
          rows={events.rows}
        />
        <div className="flex gap-2 mt-2">
          <button type="button" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - 25))}
            className="px-3 py-1 rounded border border-slate-200 text-sm disabled:opacity-40">Previous</button>
          <button type="button" disabled={skip + 25 >= events.total} onClick={() => setSkip(skip + 25)}
            className="px-3 py-1 rounded border border-slate-200 text-sm disabled:opacity-40">Next</button>
        </div>
      </div>
    </section>
  );
}
