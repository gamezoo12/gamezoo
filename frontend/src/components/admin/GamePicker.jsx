import { useMemo, useState } from 'react';
import { GAME_CATALOG } from '../../lib/gameCatalog';
import { ARCADE_STYLE_META, ARCADE_THEME_LABELS } from '../../lib/arcadeMeta';

const arcadeParts = (id) => {
  const m = /^arc_([a-z_]+?)_(fruit|space|football|ocean|party|christmas|halloween|summer)$/.exec(id || '');
  return m ? { style: m[1], theme: m[2] } : null;
};

// Search + Style + Theme filters in front of a plain game <select>; used everywhere admins pick a game.
export function GamePicker({ value, onChange, options, disabled, testid, className, labels = {}, placeholder = 'Select a game' }) {
  const [q, setQ] = useState('');
  const [style, setStyle] = useState('all');
  const [theme, setTheme] = useState('all');
  const names = useMemo(() => ({ ...Object.fromEntries(GAME_CATALOG.map((g) => [g.id, g.label])), ...labels }), [labels]);
  const ids = options || GAME_CATALOG.map((g) => g.id);
  const shown = ids.filter((id) => {
    const p = arcadeParts(id);
    if (style === 'classic' && p) return false;
    if (style !== 'all' && style !== 'classic' && p?.style !== style) return false;
    if (theme !== 'all' && p?.theme !== theme) return false;
    return !q || String(names[id] || id).toLowerCase().includes(q.toLowerCase());
  });
  const list = value && !shown.includes(value) ? [value, ...shown] : shown;
  const field = 'rounded-lg border border-slate-200 px-2 py-1.5 text-xs';
  return (
    <div className="space-y-1.5">
      {!disabled && <div className="flex flex-wrap gap-1.5" data-testid={`${testid}-filters`}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search games…" className={`${field} min-w-[120px] flex-1`} data-testid={`${testid}-search`} />
        <select value={style} onChange={(e) => setStyle(e.target.value)} className={field} data-testid={`${testid}-style`}>
          <option value="all">All styles</option><option value="classic">Classic games</option>
          {Object.entries(ARCADE_STYLE_META).map(([k, m]) => <option key={k} value={k}>{m[0]}</option>)}
        </select>
        <select value={theme} onChange={(e) => setTheme(e.target.value)} className={field} data-testid={`${testid}-theme`}>
          <option value="all">All themes</option>
          {Object.entries(ARCADE_THEME_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>}
      <select value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} className={className} data-testid={testid}>
        <option value="">{placeholder} ({shown.length})</option>
        {list.map((id) => <option key={id} value={id}>{names[id] || id}</option>)}
      </select>
    </div>
  );
}
