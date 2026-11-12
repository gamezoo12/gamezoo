import { useEffect, useState } from 'react';
import { Clock3, Save } from 'lucide-react';
import { adminAPI } from '../../lib/api';

const TIMING_KEYS = [...Array.from({ length: 10 }, (_, index) => `L${index + 1}`), 'CHAMPION'];
const LABELS = { CHAMPION: 'Champion Level' };

export default function FreeWorldTimingSettings() {
  const [settings, setSettings] = useState(null);
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminAPI.freeWorldTimings();
      setSettings(Object.fromEntries(TIMING_KEYS.map((key) => [key, String(data.settings?.[key] ?? '')])));
      setHistory(data.history || []);
    } catch (error) {
      setMessage(error?.response?.data?.detail || 'Could not load Free World timing settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await adminAPI.updateFreeWorldTimings({
        settings: Object.fromEntries(TIMING_KEYS.map((key) => [key, Number(settings[key])])),
        reason: reason.trim(),
      });
      setReason('');
      setMessage('Timing settings saved. New game attempts only.');
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.detail || 'Could not save timing settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="section-free-world-timing">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <Clock3 className="h-5 w-5 text-[#6C2BFF]" /> Free World Timing
          </h2>
          <p className="mt-1 text-sm text-slate-500">Changes apply to new Normal Level and Champion attempts only.</p>
        </div>
        <span className="text-xs font-bold text-rose-700">Super Admin only</span>
      </div>

      {loading && !settings ? <p role="status" className="text-sm text-slate-500">Loading timing settings…</p> : (
        <form onSubmit={save}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {TIMING_KEYS.map((key) => (
              <label key={key} className="text-xs font-bold text-slate-600">
                {LABELS[key] || `Level ${key.slice(1)}`} (seconds)
                <input
                  aria-label={`${LABELS[key] || `Level ${key.slice(1)}`} time limit in seconds`}
                  type="number"
                  min="5"
                  max={key === 'CHAMPION' ? '1800' : '900'}
                  step="1"
                  required
                  value={settings?.[key] ?? ''}
                  onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900"
                />
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs font-bold text-slate-600">
              Audit reason
              <input
                type="text"
                minLength="10"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why are these timing settings changing?"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
              />
            </label>
            <button type="submit" disabled={saving || loading || !settings} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save timings'}
            </button>
          </div>
        </form>
      )}

      {message && <p role="status" className="mt-3 text-sm font-semibold text-slate-700">{message}</p>}

      <div className="mt-6 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-extrabold text-slate-800">Timing change history</h3>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr><th className="px-2 py-2">Changed</th><th className="px-2 py-2">Level</th><th className="px-2 py-2">Before</th><th className="px-2 py-2">After</th><th className="px-2 py-2">Admin</th><th className="px-2 py-2">Reason</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((entry, index) => (
                <tr key={`${entry.setting_key}-${entry.created_at}-${index}`}>
                  <td className="px-2 py-2 whitespace-nowrap">{entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}</td>
                  <td className="px-2 py-2">{LABELS[entry.setting_key] || `Level ${String(entry.setting_key).slice(1)}`}</td>
                  <td className="px-2 py-2 tabular-nums">{entry.previous_time_limit_seconds}s</td>
                  <td className="px-2 py-2 tabular-nums">{entry.time_limit_seconds}s</td>
                  <td className="px-2 py-2">{entry.actor_email || entry.actor_user_id || '—'}</td>
                  <td className="px-2 py-2">{entry.reason}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan="6" className="px-2 py-6 text-center text-slate-500">No timing changes recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
