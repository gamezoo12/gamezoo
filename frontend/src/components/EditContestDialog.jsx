import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { adminAPI } from '../lib/api';
import { useToast } from '../hooks/use-toast';

const CATS = [
  { value: 'prize-draws', label: 'Prize Draws' },
  { value: 'instant-wins', label: 'Instant Wins' },
  { value: 'jackpot', label: 'Jackpot' },
  { value: 'new-games', label: 'New Game' },
];

export default function EditContestDialog({ contest, open, onClose, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => contest || {});
  const [busy, setBusy] = useState(false);

  useEffect(() => { setForm(contest || {}); }, [contest, open]);

  if (!contest) return null;

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updSkill = (k, v) => setForm(f => ({ ...f, skill_question: { ...(f.skill_question || {}), [k]: v } }));

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        subtitle: form.subtitle,
        category: form.category,
        image: form.image,
        price: parseFloat(form.price) || 1,
        tickets_total: parseInt(form.tickets_total) || 100,
        prize_amount: parseFloat(form.prize_amount) || 100,
        end_date: form.end_date,
        jackpot: !!form.jackpot,
        featured: !!form.featured,
        skill_question: form.skill_question,
      };
      await adminAPI.updateContest(contest.contest_id, payload);
      toast({ title: 'Contest updated' });
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast({ title: 'Update failed', description: e?.response?.data?.detail });
    } finally { setBusy(false); }
  };

  const skill = form.skill_question || { q: '', options: ['', '', '', ''], answer: '', type: 'trivia' };
  const endDateStr = form.end_date ? new Date(form.end_date).toISOString().slice(0, 16) : '';

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose?.()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit contest</DialogTitle></DialogHeader>

        <div className="space-y-4 py-3">
          <div>
            <Label>Title</Label>
            <Input value={form.title || ''} onChange={e => upd('title', e.target.value)} />
          </div>
          <div>
            <Label>Subtitle</Label>
            <Input value={form.subtitle || ''} onChange={e => upd('subtitle', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prize amount (£)</Label>
              <Input type="number" step="0.01" value={form.prize_amount || 0} onChange={e => upd('prize_amount', e.target.value)} />
            </div>
            <div>
              <Label>Ticket price (£)</Label>
              <Input type="number" step="0.01" value={form.price || 0} onChange={e => upd('price', e.target.value)} />
            </div>
            <div>
              <Label>Number of tickets</Label>
              <Input type="number" value={form.tickets_total || 0} onChange={e => upd('tickets_total', e.target.value)} />
            </div>
            <div>
              <Label>Category</Label>
              <select value={form.category || 'prize-draws'} onChange={e => upd('category', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>End date/time</Label>
            <Input type="datetime-local" value={endDateStr} onChange={e => upd('end_date', e.target.value ? new Date(e.target.value).toISOString() : null)} />
          </div>
          <div>
            <Label>Image URL</Label>
            <Input value={form.image || ''} onChange={e => upd('image', e.target.value)} placeholder="https://…" />
            {form.image && <img src={form.image} alt="" className="mt-2 rounded-lg w-32 h-32 object-cover border" />}
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.jackpot} onChange={e => upd('jackpot', e.target.checked)} /> Jackpot</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.featured} onChange={e => upd('featured', e.target.checked)} /> Featured</label>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <Label className="text-base font-semibold">Skill question</Label>
            <Input value={skill.q} onChange={e => updSkill('q', e.target.value)} placeholder="What is 2 + 2?" className="mt-2" />
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[0, 1, 2, 3].map(i => (
                <Input key={i} value={skill.options[i] || ''} onChange={e => {
                  const opts = [...skill.options]; opts[i] = e.target.value; updSkill('options', opts);
                }} placeholder={`Option ${i + 1}`} />
              ))}
            </div>
            <div className="mt-2">
              <Label>Correct answer</Label>
              <select value={skill.answer} onChange={e => updSkill('answer', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="">— pick correct answer —</option>
                {(skill.options || []).map((o, i) => o ? <option key={i} value={o}>{o}</option> : null)}
              </select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-teal-600 hover:bg-teal-700">{busy ? 'Saving…' : 'Save changes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
