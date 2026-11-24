import { useEffect, useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import WorldSelectionImages from '../../components/admin/WorldSelectionImages';
import { worldAdminAPI } from '../../lib/api';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../../components/ui/button';

export default function WorldSelectionAdmin() {
  const { toast } = useToast();
  const [demoLimit, setDemoLimit] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    worldAdminAPI.demoSettings().then(data => setDemoLimit(Number(data.attempts_per_level_per_game ?? 1))).catch(() => {});
  }, []);

  const saveDemoLimit = async () => {
    setSaving(true);
    try {
      await worldAdminAPI.setDemoSettings({ attempts_per_level_per_game: Number(demoLimit) });
      toast({ title: 'Demo attempt limit saved' });
    } catch (error) {
      toast({ title: 'Could not save limit', description: error?.response?.data?.detail || 'Please retry.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">World Selection</h1>
        <p className="mt-1 text-sm text-slate-500">Design the public world picker and control demo access for every level and game.</p>
      </div>
      <WorldSelectionImages />
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><Gamepad2 className="h-5 w-5 text-[#6C2BFF]" /> Demo attempts</div>
        <p className="mt-1 text-xs text-slate-500">Limit is tracked separately for each user, level, championship stage, and game. Default is one demo per game on every level.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-xs font-bold text-slate-600">Demo attempts allowed per game and level<input type="number" min="0" max="20" value={demoLimit} onChange={event => setDemoLimit(Math.max(0, Math.min(20, Number(event.target.value) || 0)))} className="mt-1 block h-10 w-32 border border-slate-200 bg-white px-3 font-normal" /></label>
          <Button type="button" onClick={saveDemoLimit} disabled={saving} className="pl-btn-purple text-white">{saving ? 'Saving...' : 'Save limit'}</Button>
        </div>
      </section>
    </main>
  );
}
