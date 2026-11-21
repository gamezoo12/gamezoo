import CountryBadge from '../../components/admin/CountryBadge';
import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Check, ImagePlus, Pencil, Trash2, X } from 'lucide-react';
import { gbp } from '../../lib/format';
import { useToast } from '../../hooks/use-toast';
import { WinnersAllWorlds } from '../../components/admin/WinnersAllWorlds';
import WinnersApprovals from '../production/WinnersApprovals';
import { resolveMediaUrl } from '../../lib/media';

function HomepageContentAdmin() {
  const { toast } = useToast();
  const [data, setData] = useState({ winners: [], reviews: [], review_count: 0, review_rating: 5, google_review_url: '' });
  const [kind, setKind] = useState('winner');
  const [form, setForm] = useState({ name: '', prize: '', text: '', rating: 5, image_url: '' });
  const [settings, setSettings] = useState({ review_count: 0, review_rating: 5, google_review_url: '' });
  const [uploading, setUploading] = useState(false);
  const [editingWinner, setEditingWinner] = useState(null);
  const [winnerDraft, setWinnerDraft] = useState({ name: '', prize: '', image_url: '' });

  const load = () => adminAPI.homepageContent().then((next) => {
    setData(next);
    setSettings({ review_count: next.review_count || 0, review_rating: next.review_rating || 5, google_review_url: next.google_review_url || '' });
  }).catch(() => {});
  useEffect(() => { load(); }, []);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await adminAPI.uploadHomepageImage(file);
      setForm((current) => ({ ...current, image_url: result.url }));
    } catch (error) {
      toast({ title: 'Image upload failed', description: error?.response?.data?.detail, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const add = async (event) => {
    event.preventDefault();
    try {
      await adminAPI.addHomepageContent({ ...form, kind, rating: Number(form.rating) });
      setForm({ name: '', prize: '', text: '', rating: 5, image_url: '' });
      toast({ title: kind === 'winner' ? 'Winner published' : 'Review published' });
      load();
    } catch (error) {
      toast({ title: 'Could not publish', description: error?.response?.data?.detail, variant: 'destructive' });
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    try {
      await adminAPI.updateHomepageContentSettings({
        ...settings,
        review_count: Number(settings.review_count),
        review_rating: Number(settings.review_rating),
      });
      toast({ title: 'Review summary saved' });
      load();
    } catch (error) {
      toast({ title: 'Could not save', description: error?.response?.data?.detail, variant: 'destructive' });
    }
  };

  const remove = async (item) => {
    const isWinner = item.kind === 'winner' || item.kind === 'free_world_winner';
    if (!window.confirm(isWinner ? 'Hide this winner from Recent Winners?' : 'Delete this review?')) return;
    try {
      if (isWinner) await adminAPI.hideRecentWinner(item.winner_id || item.content_id);
      else await adminAPI.deleteHomepageContent(item.content_id);
      load();
    } catch (error) { toast({ title: isWinner ? 'Could not hide winner' : 'Could not remove review', description: error?.response?.data?.detail, variant: 'destructive' }); }
  };

  const beginEdit = (item) => {
    setEditingWinner(item.winner_id || item.content_id);
    setWinnerDraft({ name: item.name || '', prize: item.prize || '', image_url: item.image_url || '' });
  };

  const uploadWinnerImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await adminAPI.uploadHomepageImage(file);
      setWinnerDraft(current => ({ ...current, image_url: result.url || '' }));
    } catch (error) { toast({ title: 'Image upload failed', description: error?.response?.data?.detail, variant: 'destructive' }); }
    finally { setUploading(false); }
  };

  const saveWinner = async () => {
    if (!editingWinner) return;
    try {
      await adminAPI.editRecentWinner(editingWinner, winnerDraft);
      setEditingWinner(null);
      toast({ title: 'Recent winner updated' });
      load();
    } catch (error) { toast({ title: 'Could not update winner', description: error?.response?.data?.detail, variant: 'destructive' }); }
  };

  const items = [...(data.winners || []), ...(data.reviews || [])];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="homepage-content-admin">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-display text-lg font-bold">Homepage winners & reviews</h3><p className="text-xs text-slate-500">Newest items appear first on the homepage.</p></div>
        <div className="flex rounded-lg bg-slate-100 p-1">
          {['winner', 'review'].map((value) => <button key={value} type="button" onClick={() => setKind(value)} className={`rounded-md px-4 py-2 text-sm font-bold ${kind === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{value === 'winner' ? 'Winner' : 'Review'}</button>)}
        </div>
      </div>
      {kind === 'winner' && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Recent Winners are created automatically from paid-world contests and Free World championships. Use the Edit and image controls on each winner below.</div>}
      {kind === 'review' && <form onSubmit={add} className="grid gap-3 md:grid-cols-2">
        <input required value={form.name} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder={kind === 'winner' ? 'Winner name' : 'Reviewer name'} data-testid="homepage-content-name" />
        {kind === 'winner' ? <input required value={form.prize} maxLength={160} onChange={(event) => setForm({ ...form, prize: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Prize won (money or gift)" data-testid="homepage-content-prize" /> : <input required type="number" min="1" max="5" value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Rating 1-5" />}
        {kind === 'review' && <textarea required value={form.text} maxLength={1000} onChange={(event) => setForm({ ...form, text: event.target.value })} className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2" placeholder="Review text" data-testid="homepage-content-text" />}
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm font-bold text-slate-600 md:col-span-2">
          <ImagePlus className="h-4 w-4" />{uploading ? 'Uploading...' : form.image_url ? 'Image ready (click to replace)' : kind === 'winner' ? 'Upload winner image' : 'Upload review image (optional)'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={upload} />
        </label>
        {form.image_url && <img src={resolveMediaUrl(form.image_url)} alt="Upload preview" className="h-28 w-28 rounded-lg object-cover" />}
        <Button type="submit" disabled={uploading} className="bg-[#6C2BFF] hover:bg-[#4A15D9] md:col-span-2">Publish {kind}</Button>
      </form>}

      <form onSubmit={saveSettings} className="mt-5 grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-600">Total Google review count<input type="number" min="0" value={settings.review_count} onChange={(event) => setSettings({ ...settings, review_count: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
        <label className="text-xs font-bold text-slate-600">Overall rating<input type="number" min="0" max="5" step="0.1" value={settings.review_rating} onChange={(event) => setSettings({ ...settings, review_rating: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
        <label className="text-xs font-bold text-slate-600">Google reviews URL<input type="url" value={settings.google_review_url} onChange={(event) => setSettings({ ...settings, google_review_url: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" placeholder="https://..." /></label>
        <Button type="submit" variant="outline" className="md:col-span-3">Save review summary</Button>
      </form>

      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const winnerId = item.winner_id || item.content_id;
          const isWinner = item.kind === 'winner' || item.kind === 'free_world_winner';
          const editing = editingWinner === winnerId;
          return <article key={item.content_id} className="rounded-xl border border-slate-100 p-3">
            <div className="flex gap-3">
              {item.image_url ? <img src={resolveMediaUrl(item.image_url)} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400"><ImagePlus className="h-5 w-5" /></div>}
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-xs font-bold uppercase text-[#6C2BFF]">{isWinner ? (item.kind === 'free_world_winner' ? 'Free World winner' : 'Paid winner') : 'Review'}{item.is_demo && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-800">Demo</span>}</div><div className="truncate text-sm font-bold">{item.name}</div><div className="line-clamp-2 text-xs text-slate-500">{item.prize || item.text}</div><div className="mt-1 text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString('en-GB')}</div></div>
              <div className="flex flex-col gap-1">
                {isWinner && <button type="button" onClick={() => editing ? setEditingWinner(null) : beginEdit(item)} className="p-1 text-slate-600" title={editing ? 'Cancel edit' : 'Edit winner'}>{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</button>}
                <button type="button" onClick={() => remove(item)} className="self-start p-1 text-rose-600" title={isWinner ? 'Hide winner' : 'Delete review'}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            {editing && <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
              <input value={winnerDraft.name} maxLength={80} onChange={event => setWinnerDraft(current => ({ ...current, name: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Display name" />
              <input value={winnerDraft.prize} maxLength={160} onChange={event => setWinnerDraft(current => ({ ...current, prize: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Displayed prize" />
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 p-2 text-xs font-bold text-slate-600"><ImagePlus className="h-4 w-4" />{uploading ? 'Uploading...' : 'Upload or replace image'}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={uploadWinnerImage} /></label>
              {winnerDraft.image_url && <img src={resolveMediaUrl(winnerDraft.image_url)} alt="Winner preview" className="h-24 w-full rounded-lg object-contain bg-slate-50" />}
              <div className="flex gap-2"><Button type="button" size="sm" onClick={saveWinner} disabled={uploading} className="bg-[#6C2BFF] hover:bg-[#4A15D9]">Save changes</Button><Button type="button" size="sm" variant="outline" onClick={() => setEditingWinner(null)}>Cancel</Button></div>
            </div>}
          </article>;
        })}
      </div>
    </section>
  );
}

export default function WinnersAdmin() {
  const [winners, setWinners] = useState([]);
  const [ticker, setTicker] = useState([]);
  const [form, setForm] = useState({ user_name: '', prize_amount: '' });
  const { toast } = useToast();

  const load = () => adminAPI.winners().then(setWinners).catch(() => {});
  const loadTicker = () => adminAPI.tickerWinners().then((d) => setTicker(d.winners || [])).catch(() => {});
  useEffect(() => { load(); loadTicker(); }, []);

  const addTicker = async (e) => {
    e.preventDefault();
    try {
      await adminAPI.addTickerWinner({ user_name: form.user_name, prize_amount: Number(form.prize_amount), currency: 'GBP' });
      setForm({ user_name: '', prize_amount: '' });
      toast({ title: 'Winner added to ticker' });
      loadTicker();
    } catch (err) { toast({ title: 'Failed', description: JSON.stringify(err?.response?.data?.detail || '') }); }
  };

  const removeTicker = async (id) => {
    try { await adminAPI.deleteTickerWinner(id); loadTicker(); }
    catch (err) { toast({ title: 'Failed', description: err?.response?.data?.detail }); }
  };

  const markPaid = async (id) => {
    try { await adminAPI.markPaid(id); toast({ title: 'Marked as paid' }); load(); }
    catch (e) { toast({ title: 'Failed', description: e?.response?.data?.detail }); }
  };

  return (
    <div className="space-y-4">
      <WinnersApprovals />
      <HomepageContentAdmin />
      <div className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="ticker-winners-admin">
        <h3 className="font-display font-bold mb-3">Announcement ticker winners ({ticker.length})</h3>
        <form onSubmit={addTicker} className="flex flex-wrap gap-2 mb-3">
          <input required maxLength={60} placeholder="Winner name" value={form.user_name} onChange={(e) => setForm({ ...form, user_name: e.target.value })} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="ticker-winner-name" />
          <input required type="number" min="0.01" step="0.01" placeholder="Prize £" value={form.prize_amount} onChange={(e) => setForm({ ...form, prize_amount: e.target.value })} className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-32" data-testid="ticker-winner-amount" />
          <Button type="submit" className="bg-[#6C2BFF] hover:bg-[#4A15D9]" data-testid="ticker-winner-add">Add winner</Button>
        </form>
        <ul className="divide-y divide-slate-100">{ticker.map((t) => <li key={t.winner_id} className="flex items-center justify-between py-2 text-sm"><span>{t.user_name} won {gbp(t.prize_amount)}</span><button type="button" onClick={() => removeTicker(t.winner_id)} className="text-red-600 text-xs hover:underline">Remove</button></li>)}</ul>
      </div>
      <WinnersAllWorlds />
      {winners.some((w) => !w.paid_out && w.source !== 'draw_studio') && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="legacy-unpaid-winners">
          <h3 className="font-display font-bold mb-2">Unpaid legacy contest winners</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {winners.filter((w) => !w.paid_out && w.source !== 'draw_studio').map(w => <div key={w.winner_id} className="rounded-xl border border-slate-100 p-3 text-sm"><div className="font-bold">{w.prize_title}</div><div className="text-slate-500">{w.user_name}<CountryBadge userId={w.user_id} /> · Ticket #{w.ticket_number} · {gbp(w.prize_cash_amount ?? w.prize_amount)}</div><Button size="sm" onClick={() => markPaid(w.winner_id)} className="mt-2 bg-[#6C2BFF] hover:bg-[#4A15D9]"><Check className="w-3.5 h-3.5 mr-1" />Mark PAID + credit wallet</Button></div>)}
          </div>
        </div>
      )}
    </div>
  );
}
