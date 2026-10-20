import { useEffect, useState } from 'react';
import { acquisitionAdminAPI } from '../../lib/api';
import AcquisitionAnalytics from './AcquisitionAnalytics';
import {
  Globe, Users, MousePointerClick, Smartphone, Monitor,
  Search, Share2, Link2, TrendingUp, RefreshCw, Target, UserCheck,
} from 'lucide-react';

const TIME_OPTIONS = [
  ['1 hour', '1h'], ['6 hours', '6h'], ['24 hours', '24h'], ['7 days', '7d'],
  ['1 month', '1m'], ['6 months', '6m'], ['1 year', '1y'], ['Lifetime', 'lifetime'],
];

const CHANNEL_LABELS = {
  direct: 'Direct',
  organic_search: 'Organic search',
  social: 'Social',
  referral: 'Referral',
  campaign: 'Campaign (UTM)',
};

function StatCard({ label, value, icon: Icon, tone = 'indigo' }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
        <Icon className={`w-4 h-4 text-${tone}-600`} /> {label}
      </div>
      <div className="mt-1 font-display font-black text-2xl text-slate-800">
        {value}
      </div>
    </div>
  );
}

function BarList({ title, icon: Icon, items, total, labelMap }) {
  const max = Math.max(1, ...(items || []).map(i => i.count));
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-indigo-600" />
        <h2 className="font-display font-bold text-base">{title}</h2>
      </div>
      {!items?.length ? (
        <div className="text-sm text-slate-400">No data yet.</div>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => {
            const label = labelMap?.[item.key] || item.key;
            const pct = total ? Math.round((item.count / total) * 100) : 0;
            return (
              <div key={item.key} data-testid={`acq-bar-${item.key}`}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-slate-700 truncate pr-2">{label}</span>
                  <span className="text-slate-500 tabular-nums shrink-0">
                    {item.count}{total ? ` · ${pct}%` : ''}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#8B5CFF] to-[#6C2BFF]"
                    style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AcquisitionAdmin() {
  const [period, setPeriod] = useState('1m');
  const [data, setData] = useState(null);
  const [visits, setVisits] = useState([]);
  const [pageViews, setPageViews] = useState([]);
  const [state, setState] = useState('loading');

  const load = () => {
    setState('loading');
    Promise.all([
      acquisitionAdminAPI.summary(period),
      acquisitionAdminAPI.visits({ period, limit: 30 }),
      acquisitionAdminAPI.pageViews({ period, limit: 30 }),
    ])
      .then(([summary, v, pv]) => {
        setData(summary);
        setVisits(v.visits || []);
        setPageViews(pv.page_views || []);
        setState('ok');
      })
      .catch(() => setState('error'));
  };

  useEffect(load, [period]);

  const trendMax = Math.max(1, ...((data?.trend || []).map(t => t.visits)));

  return (
    <div className="p-1 md:p-2 space-y-6" data-testid="acquisition-admin-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-black text-2xl text-slate-900">
            Acquisition
          </h1>
          <p className="text-sm text-slate-500">
            How visitors reach Prize League — referrer, campaigns, device and landing pages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-slate-200 rounded-xl p-1">
            {TIME_OPTIONS.map(([label, value]) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                data-testid={`acq-period-${value}`}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  period === value
                    ? 'bg-gradient-to-r from-[#8B5CFF] to-[#6C2BFF] text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            data-testid="acq-refresh"
            aria-label="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <AcquisitionAnalytics />

      <h2 className="font-display font-black text-lg text-slate-700 pt-2">
        Landing visits (earlier report, one record per visitor per day)
      </h2>

      {state === 'loading' && (
        <div className="text-slate-500 p-6">Loading acquisition data…</div>
      )}
      {state === 'error' && (
        <div className="text-rose-600 p-6">Failed to load acquisition data.</div>
      )}

      {state === 'ok' && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard label="Visits" value={data.total_visits} icon={MousePointerClick} tone="indigo" />
            <StatCard label="Page views" value={data.page_views || 0} icon={Globe} tone="blue" />
            <StatCard label="Unique visitors" value={data.unique_visitors} icon={Users} tone="fuchsia" />
            <StatCard label="Players (signed up)" value={data.converted_visitors ?? 0} icon={UserCheck} tone="emerald" />
            <StatCard label="Conversion rate" value={`${data.overall_conversion_rate ?? 0}%`} icon={Target} tone="rose" />
            <StatCard label="Window" value={data.period || period} icon={TrendingUp} tone="amber" />
          </div>

          {/* Daily trend */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <h2 className="font-display font-bold text-base">{['6m', '1y', 'lifetime'].includes(period) ? 'Monthly visits' : ['1h', '6h', '24h'].includes(period) ? 'Visits by hour window' : 'Daily visits'}</h2>
            </div>
            {!data.trend?.length ? (
              <div className="text-sm text-slate-400">No visits recorded yet.</div>
            ) : (
              <div className="flex items-end gap-1 h-40 overflow-x-auto">
                {data.trend.map((t) => (
                  <div key={t.day} className="flex flex-col items-center gap-1 min-w-[14px] flex-1" title={`${t.day}: ${t.visits} visits`}>
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-[#6C2BFF] to-[#8B5CFF]"
                      style={{ height: `${Math.max(3, (t.visits / trendMax) * 130)}px` }}
                    />
                    <span className="text-[9px] text-slate-400 rotate-0 whitespace-nowrap">
                      {t.day.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <BarList title="Top sources" icon={Link2} items={data.by_source} total={data.total_visits} />
            <BarList title="Channels" icon={Search} items={data.by_channel} total={data.total_visits} labelMap={CHANNEL_LABELS} />
            <BarList title="Devices" icon={Smartphone} items={data.by_device} total={data.total_visits} />
            <BarList title="Browsers" icon={Monitor} items={data.by_browser} total={data.total_visits} />
            <BarList title="Landing pages" icon={Globe} items={data.by_landing} total={data.total_visits} />
            <BarList title="Campaigns (UTM)" icon={Share2} items={data.by_campaign} total={data.total_visits} />
          </div>

          {/* Signup conversion by source */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5" data-testid="acq-conversion-table">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-4 h-4 text-rose-600" />
              <h2 className="font-display font-bold text-base">Signup conversion by source</h2>
              <span className="text-xs text-slate-400">— which sources turn visits into players</span>
            </div>
            {!data.by_source_conversion?.length ? (
              <div className="text-sm text-slate-400">No data yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2">Source</th>
                      <th className="text-right px-3 py-2">Visitors</th>
                      <th className="text-right px-3 py-2">Players</th>
                      <th className="text-left px-3 py-2 w-1/3">Conversion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_source_conversion.map((row) => (
                      <tr key={row.key} className="border-t border-slate-100" data-testid={`acq-conv-${row.key}`}>
                        <td className="px-3 py-2 font-semibold text-slate-700">{row.key}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.visitors}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{row.converted}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                                style={{ width: `${Math.min(100, row.rate)}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-600 w-12 text-right tabular-nums">{row.rate}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent visits */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <MousePointerClick className="w-4 h-4 text-indigo-600" />
              <h2 className="font-display font-bold text-base">Recent visits</h2>
            </div>
            {!visits.length ? (
              <div className="text-sm text-slate-400">No visits recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-2">When</th>
                      <th className="text-left px-3 py-2">Source</th>
                      <th className="text-left px-3 py-2">Channel</th>
                      <th className="text-left px-3 py-2">Landing</th>
                      <th className="text-left px-3 py-2">Device</th>
                      <th className="text-left px-3 py-2">Referrer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map((v) => (
                      <tr key={v.visit_id} className="border-t border-slate-100">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {v.created_at ? new Date(v.created_at).toLocaleString('en-GB') : '—'}
                        </td>
                        <td className="px-3 py-2 font-semibold">{v.source || '—'}</td>
                        <td className="px-3 py-2">{CHANNEL_LABELS[v.channel] || v.channel}</td>
                        <td className="px-3 py-2 font-mono truncate max-w-[160px]">{v.landing_path}</td>
                        <td className="px-3 py-2">{v.device_type} · {v.browser}</td>
                        <td className="px-3 py-2 truncate max-w-[180px] text-slate-500">{v.referrer_host || 'direct'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-4 h-4 text-blue-600" />
              <h2 className="font-display font-bold text-base">Recent page views</h2>
              <span className="text-xs text-slate-400">Individual route navigations</span>
            </div>
            {!pageViews.length ? (
              <div className="text-sm text-slate-400">No page views in this range.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 text-left">When</th><th className="px-3 py-2 text-left">Page</th><th className="px-3 py-2 text-left">Source</th><th className="px-3 py-2 text-left">Device</th><th className="px-3 py-2 text-left">Visitor state</th></tr></thead>
                  <tbody>{pageViews.map((view) => <tr key={view.view_id} className="border-t border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap">{view.created_at ? new Date(view.created_at).toLocaleString('en-GB') : '—'}</td>
                    <td className="px-3 py-2 font-mono">{view.page_path}</td>
                    <td className="px-3 py-2">{view.source_key || 'unknown'}</td>
                    <td className="px-3 py-2">{view.device_type || 'unknown'}</td>
                    <td className="px-3 py-2">{view.user_state || 'legacy / unknown'}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
