import { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import { Button } from '../ui/button';
import { worldAdminAPI } from '../../lib/api';

const Num = ({ label, value, onChange, testid, min = 0 }) => (
  <label className="block">
    <span className="text-[11px] font-bold uppercase text-slate-500">{label}</span>
    <input type="number" min={min} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}
      className="w-32 mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
  </label>
);

const Group = ({ title, free, cost, setFree, setCost, prefix }) => (
  <div className="rounded-xl border border-slate-100 p-4" data-testid={`car-${prefix}`}>
    <div className="font-bold text-slate-800 mb-1">{title}</div>
    <p className="text-xs text-slate-500 mb-3">{Number(free) === 0 ? `Token only — every attempt costs ${cost} token${Number(cost) === 1 ? '' : 's'}.` : `${free} free attempt${Number(free) === 1 ? '' : 's'}, then ${cost} token${Number(cost) === 1 ? '' : 's'} per extra attempt.`}</p>
    <div className="flex flex-wrap gap-3">
      <Num label="Free attempts (0 = none)" value={free} onChange={setFree} testid={`car-${prefix}-free`} />
      <Num label="Tokens per attempt" value={cost} onChange={setCost} min={1} testid={`car-${prefix}-cost`} />
    </div>
  </div>
);

export default function ChampionAttemptRules() {
  const [r, setR] = useState(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { worldAdminAPI.championAttemptRules().then((d) => setR({ from: d.late_from_stage, ef: d.early.free_attempts, ec: d.early.token_cost, lf: d.late.free_attempts, lc: d.late.token_cost })).catch(() => setMsg('Could not load rules')); }, []);
  if (!r) return null;
  const set = (k) => (v) => setR({ ...r, [k]: v });
  const save = async () => {
    setSaving(true); setMsg('');
    try {
      await worldAdminAPI.setChampionAttemptRules({ late_from_stage: Number(r.from), early_free_attempts: Number(r.ef), early_token_cost: Number(r.ec), late_free_attempts: Number(r.lf), late_token_cost: Number(r.lc) });
      setMsg('Saved. New rules apply to Championships players start from now on.');
    } catch (e) { setMsg(e?.response?.data?.detail?.[0]?.msg || e?.response?.data?.detail || 'Save failed'); } finally { setSaving(false); }
  };
  const late = Number(r.from);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="section-champion-attempt-rules">
      <h2 className="font-extrabold text-lg text-slate-900 flex items-center gap-2 mb-1"><Coins className="w-5 h-5 text-[#6C2BFF]" /> Championship Attempt Rules</h2>
      <p className="text-xs text-slate-500 mb-4">Applies to the Championship level in each player's personal progression only (not normal levels).</p>
      <div className="mb-4"><Num label="Paid rule starts at Championship" value={r.from} onChange={set('from')} min={2} testid="car-from-stage" /></div>
      <div className="grid gap-3 md:grid-cols-2">
        <Group title={`C1 – C${late - 1}`} free={r.ef} cost={r.ec} setFree={set('ef')} setCost={set('ec')} prefix="early" />
        <Group title={`C${late} onwards`} free={r.lf} cost={r.lc} setFree={set('lf')} setCost={set('lc')} prefix="late" />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button className="bg-[#6C2BFF] hover:bg-[#5a22d6] text-white" disabled={saving} onClick={save} data-testid="car-save">{saving ? 'Saving…' : 'Save rules'}</Button>
        {msg && <span className="text-xs text-slate-600" data-testid="car-msg">{msg}</span>}
      </div>
    </section>
  );
}
