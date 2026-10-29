import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export const PERIOD_OPTIONS = [
  { label: 'Last 1 Hour', value: '1h' },
  { label: 'Last 6 Hours', value: '6h' },
  { label: 'Last 24 Hours', value: '24h' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 1 Month', value: '1m' },
  { label: 'Last 1 Year', value: '1y' },
  { label: 'Full Time', value: 'all_time' },
];

const STORAGE_KEY = 'pl_admin_period';
const isValid = (value) => PERIOD_OPTIONS.some((option) => option.value === value);

export const periodLabel = (value) => PERIOD_OPTIONS.find((option) => option.value === value)?.label || value;

// One filter for Business Review, Acquisition and Analytics; it lives in the URL so reports open with it preserved.
export function usePeriod() {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('period');
  let stored = null;
  try { stored = sessionStorage.getItem(STORAGE_KEY); } catch (e) { /* storage unavailable */ }
  const period = isValid(fromUrl) ? fromUrl : isValid(stored) ? stored : '7d';
  const setPeriod = useCallback((value) => {
    if (!isValid(value)) return;
    try { sessionStorage.setItem(STORAGE_KEY, value); } catch (e) { /* storage unavailable */ }
    const next = new URLSearchParams(params);
    next.set('period', value);
    setParams(next, { replace: true });
  }, [params, setParams]);
  return [period, setPeriod];
}

export const reportPath = (period, query = {}) => {
  const search = new URLSearchParams({ ...query, period });
  return `/admin/analytics?${search.toString()}`;
};

export default function PeriodFilter({ period, onChange }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-1" role="group" aria-label="Date range" data-testid="period-filter">
      {PERIOD_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={period === option.value}
          data-testid={`period-${option.value}`}
          className={`rounded-md px-3 py-1.5 text-xs font-bold ${period === option.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
