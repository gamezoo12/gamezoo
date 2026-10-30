import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Megaphone, Pencil, Trash2 } from 'lucide-react';
import { announcementsAdminAPI as api } from '../../lib/api';

const TZ = 'Europe/London';
const STATUS_STYLE = {
  published: 'bg-emerald-100 text-emerald-800', draft: 'bg-slate-100 text-slate-700', scheduled: 'bg-amber-100 text-amber-800',
  expired: 'bg-rose-100 text-rose-800', disabled: 'bg-slate-200 text-slate-500',
};
const field = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm';
const label = 'mb-1 block text-xs font-semibold text-slate-600';
const empty = { title: '', text: '', icon: '', link: '', priority: 0, start: '', end: '', publish: false };

const londonParts = (date) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}).formatToParts(date).map((p) => [p.type, p.value]));

// 'YYYY-MM-DDTHH:mm' typed as Europe/London wall time -> UTC ISO string.
export function londonToUtcIso(local) {
  if (!local) return null;
  const [d, t] = local.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, da, h, mi);
  let guess = wall;
  for (let i = 0; i < 2; i += 1) {
    const p = londonParts(new Date(guess));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess -= shown - wall;
  }
  return new Date(guess).toISOString();
}

export function utcIsoToLondonLocal(iso) {
  if (!iso) return '';
  const p = londonParts(new Date(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const londonLabel = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }) : '—');
const errText = (e) => {
  const d = e?.response?.data?.detail;
  return typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg).join('; ') : e?.message || 'Request failed';
};

function Preview({ form }) {
  return (
    <div className="overflow-hidden rounded-md border border-white/10" style={{ background: 'linear-gradient(90deg, #6C2BFF 0%, #8B5CFF 50%, #6C2BFF 100%)' }} data-testid="announcement-preview">
      <div className="flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-semibold text-white/95 md:text-[15px]">
        <span aria-hidden>{form.icon || '📢'}</span><span>{form.text || 'Your announcement text appears here'}</span>
        {form.link && <span className="underline">(link)</span>}
      </div>
    </div>
  );
}

export default function AnnouncementsAdmin() {
  const [items, setItems] = useState([]);
  const [generated, setGenerated] = useState([]);
  const [editingGenerated, setEditingGenerated] = useState(null);
  const [generatedText, setGeneratedText] = useState('');
  const [audit, setAudit] = useState([]);
  const [form, setForm] = useState(empty);
  const [badge, setBadge] = useState({ enabled: true, text: '', url: '/my-account/promotions' });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [list, log, badgeSettings, generatedItems] = await Promise.all([api.list(), api.audit().catch(() => ({ items: [] })), api.badgeSettings(), api.generated()]);
    setItems(list.announcements); setAudit(log.items); setBadge(badgeSettings); setGenerated(generatedItems.items || []);
  }, []);
  useEffect(() => { load().catch((e) => setError(errText(e))); }, [load]);

  const run = async (fn, ok) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); setNotice(ok); await load(); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };

  const payload = (publish) => ({
    title: form.title, text: form.text, icon: form.icon || null, link: form.link || null, priority: Number(form.priority) || 0,
    start_at: londonToUtcIso(form.start), end_at: londonToUtcIso(form.end), publish,
  });
  const save = (publish) => run(async () => {
    if (editingId) await api.update(editingId, payload(publish)); else await api.create(payload(publish));
    setForm(empty); setEditingId(null);
  }, publish ? 'Saved and published.' : 'Saved.');

  const edit = (a) => {
    setEditingId(a.announcement_id);
    setForm({ title: a.title, text: a.text, icon: a.icon || '', link: a.link || '', priority: a.priority, start: utcIsoToLondonLocal(a.start_at), end: utcIsoToLondonLocal(a.end_at), publish: a.published });
  };
  const move = (index, delta) => {
    const ids = items.map((a) => a.announcement_id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => api.reorder(ids), 'Order updated (applies within the same priority).');
  };
  const updateGenerated = (item, changes) => run(async () => {
    await api.updateGenerated(item.id, { text: item.text, enabled: item.enabled !== false, published: item.published !== false, deleted: !!item.deleted, ...changes });
    setEditingGenerated(null);
  }, 'Ticker announcement updated.');

  return (
    <div className="mx-auto max-w-5xl space-y-5" data-testid="announcements-admin">
      <header><h1 className="flex items-center gap-2 text-2xl font-black text-slate-950"><Megaphone className="h-6 w-6" /> Announcement Management</h1>
        <p className="mt-1 text-sm text-slate-500">Messages shown in the scrolling ticker under the site header. Automatic winner announcements are unaffected. Times are Europe/London.</p></header>
      {error && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" data-testid="announcement-error">{error}</div>}
      {notice && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" data-testid="promotion-badge-settings">
        <h2 className="font-bold text-slate-900">Promotion icon</h2>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={badge.enabled} onChange={(e) => setBadge({ ...badge, enabled: e.target.checked })} /> Enabled</label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className={label}>Displayed text</span><input className={field} maxLength={80} value={badge.text} placeholder="Use promotion text" onChange={(e) => setBadge({ ...badge, text: e.target.value })} /></label>
          <label><span className={label}>Destination</span><input className={field} maxLength={500} value={badge.url} onChange={(e) => setBadge({ ...badge, url: e.target.value })} /></label>
        </div>
        <button type="button" disabled={busy} className="h-10 rounded-md bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50" onClick={() => run(async () => { await api.saveBadgeSettings(badge); window.dispatchEvent(new Event('pl:promotion-badge-updated')); }, 'Promotion icon settings saved.')}>Save icon settings</button>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" data-testid="announcement-form">
        <h2 className="font-bold text-slate-900">{editingId ? 'Edit announcement' : 'Create announcement'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className={label}>Title (admin only)</span><input className={field} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="ann-title" /></label>
          <label><span className={label}>Emoji / icon (optional)</span><input className={field} maxLength={8} value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} data-testid="ann-icon" /></label>
          <label className="sm:col-span-2"><span className={label}>Announcement text (max 200)</span><input className={field} maxLength={200} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} data-testid="ann-text" /></label>
          <label><span className={label}>Link (optional: /page or https://…)</span><input className={field} value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} data-testid="ann-link" /></label>
          <label><span className={label}>Priority (0–100, higher shows first)</span><input className={field} type="number" min="0" max="100" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} data-testid="ann-priority" /></label>
          <label><span className={label}>Start (Europe/London, optional)</span><input className={field} type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} data-testid="ann-start" /></label>
          <label><span className={label}>End (Europe/London, optional)</span><input className={field} type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} data-testid="ann-end" /></label>
        </div>
        <div><span className={label}>Live preview</span><Preview form={form} /></div>
        <div className="flex flex-wrap justify-end gap-2">
          {editingId && <button type="button" className="h-10 rounded-full border px-4 text-sm font-bold" onClick={() => { setEditingId(null); setForm(empty); }}>Cancel edit</button>}
          <button type="button" disabled={busy} onClick={() => save(false)} className="h-10 rounded-full border border-slate-300 px-4 text-sm font-bold" data-testid="ann-save-draft">Save draft</button>
          <button type="button" disabled={busy} onClick={() => save(true)} className="h-10 rounded-full bg-[#6C2BFF] px-4 text-sm font-bold text-white" data-testid="ann-publish">Publish</button>
        </div>
      </section>

      <section className="space-y-2" data-testid="announcement-list">
        {items.map((a, index) => (
          <article key={a.announcement_id} className="rounded-lg border border-slate-200 bg-white p-3" data-testid={`announcement-row-${a.announcement_id}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><div className="font-bold text-slate-900">{a.icon} {a.title}</div><div className="text-sm text-slate-600">{a.text}</div>
                <div className="mt-1 text-xs text-slate-500">Priority {a.priority} · Start {londonLabel(a.start_at)} · End {londonLabel(a.end_at)} · Created {londonLabel(a.created_at)} by {a.created_by || '—'} · Updated {londonLabel(a.updated_at)} by {a.updated_by || '—'}{a.link ? ` · ${a.link}` : ''}</div></div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${STATUS_STYLE[a.status]}`} data-testid="announcement-status">{a.status}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
              <button type="button" className="rounded border px-2 py-1" onClick={() => edit(a)}><Pencil className="mr-1 inline h-3 w-3" />Edit</button>
              {a.published ? <button type="button" className="rounded border px-2 py-1" onClick={() => run(() => api.action(a.announcement_id, 'unpublish'), 'Unpublished.')}>Unpublish</button>
                : <button type="button" className="rounded border px-2 py-1" onClick={() => run(() => api.action(a.announcement_id, 'publish'), 'Published.')}>Publish</button>}
              {a.enabled ? <button type="button" className="rounded border px-2 py-1" onClick={() => run(() => api.action(a.announcement_id, 'disable'), 'Disabled.')}>Disable</button>
                : <button type="button" className="rounded border px-2 py-1" onClick={() => run(() => api.action(a.announcement_id, 'enable'), 'Enabled.')}>Enable</button>}
              <button type="button" aria-label="Move up" className="rounded border px-2 py-1" onClick={() => move(index, -1)}><ArrowUp className="h-3 w-3" /></button>
              <button type="button" aria-label="Move down" className="rounded border px-2 py-1" onClick={() => move(index, 1)}><ArrowDown className="h-3 w-3" /></button>
              <button type="button" className="rounded border border-rose-300 px-2 py-1 text-rose-700" onClick={() => window.confirm(`Delete "${a.title}"? This cannot be undone.`) && run(() => api.remove(a.announcement_id), 'Deleted.')}><Trash2 className="mr-1 inline h-3 w-3" />Delete</button>
            </div>
          </article>
        ))}
        {!items.length && <p className="rounded-lg border bg-white p-6 text-center text-sm text-slate-500">No announcements yet. The ticker shows its default messages.</p>}
      </section>

      <section className="space-y-2" data-testid="generated-announcement-list">
        <h2 className="font-bold text-slate-900">Automatic and default announcements</h2>
        {generated.map((item) => <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3" data-testid={`generated-announcement-${item.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 text-sm text-slate-700"><b>{item.icon} {item.sample}</b><div className="text-xs text-slate-500">{item.kind === 'winner' || item.kind === 'promotion_winner' ? 'Automatic winner' : 'Default announcement'}</div></div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase">{item.deleted ? 'Deleted' : item.enabled === false ? 'Disabled' : item.published === false ? 'Unpublished' : 'Published'}</span>
          </div>
          {editingGenerated === item.id && <div className="mt-2 space-y-2">
            <label className="block text-xs font-semibold">Announcement text<input className={field} maxLength={200} value={generatedText} onChange={(e) => setGeneratedText(e.target.value)} /></label>
            {item.values && <p className="text-xs text-slate-500">Keep {Object.keys(item.values).map(key => `{${key}}`).join(' and ')} to show the actual winner information.</p>}
            <button type="button" className="rounded border px-2 py-1 text-xs font-bold" onClick={() => updateGenerated(item, { text: generatedText })}>Save</button>
            <button type="button" className="ml-2 rounded border px-2 py-1 text-xs font-bold" onClick={() => setEditingGenerated(null)}>Cancel</button>
          </div>}
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
            {!item.deleted && <><button type="button" className="rounded border px-2 py-1" onClick={() => { setEditingGenerated(item.id); setGeneratedText(item.text); }}>Edit</button>
              <button type="button" className="rounded border px-2 py-1" onClick={() => updateGenerated(item, { published: item.published === false })}>{item.published === false ? 'Publish' : 'Unpublish'}</button>
              <button type="button" className="rounded border px-2 py-1" onClick={() => updateGenerated(item, { enabled: item.enabled === false })}>{item.enabled === false ? 'Enable' : 'Disable'}</button></>}
            {item.deleted ? <button type="button" className="rounded border px-2 py-1" onClick={() => updateGenerated(item, { deleted: false })}>Restore</button>
              : <button type="button" className="rounded border border-rose-300 px-2 py-1 text-rose-700" onClick={() => window.confirm('Remove this announcement from the ticker?') && updateGenerated(item, { deleted: true })}>Delete</button>}
          </div>
        </article>)}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-xs" data-testid="announcement-audit">
        <h2 className="mb-2 text-sm font-bold text-slate-900">Audit log</h2>
        {audit.slice(0, 30).map((row) => <div key={row.audit_id} className="border-t py-1">{londonLabel(row.created_at)} · {row.action} · {row.announcement_id} · {row.actor_id}</div>)}
        {!audit.length && <p className="text-slate-500">No changes recorded.</p>}
      </section>
    </div>
  );
}
