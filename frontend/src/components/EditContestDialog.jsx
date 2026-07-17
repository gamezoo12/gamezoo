import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { adminAPI, uploadsAPI } from '../lib/api';
import { useToast } from '../hooks/use-toast';
import { Upload, X, Loader2 } from 'lucide-react';

const CATS = [
  { value: 'prize-draws', label: 'Prize Draws' },
  { value: 'instant-wins', label: 'Instant Wins' },
  { value: 'jackpot', label: 'Jackpot' },
  { value: 'new-games', label: 'New Game' },
];

export default function EditContestDialog({ contest, open, onClose, onSaved, mode = 'edit' }) {
  const { toast } = useToast();
  const isCreate = mode === 'create';
  const emptyForm = {
    title: '', subtitle: '', category: 'prize-draws', image: '',
    price: 1, tickets_total: 150, prize_amount: 100,
    end_date: new Date(Date.now() + 7 * 86400000).toISOString(),
    jackpot: false, featured: false, status: 'draft',
    skill_question: { q: 'What is 2 + 2?', options: ['3', '4', '5', '6'], answer: '4', type: 'math' },
  };
  const [form, setForm] = useState(() => (isCreate ? emptyForm : (contest || {})));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const fileInputRef = useRef(null);

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e) => {
    setUploadErr('');
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking same file
    if (!file) return;
    const okTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!okTypes.includes(file.type)) {
      setUploadErr('Only JPG, PNG or WEBP files are allowed.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadErr('File is too large. Maximum 8 MB.');
      return;
    }
    setUploading(true);
    try {
      const data = await uploadsAPI.image(file);
      upd('image', data.url);
      toast({ title: 'Image uploaded', description: 'Saved. Click "Save changes" to attach it to the contest.' });
    } catch (err) {
      setUploadErr(err?.response?.data?.detail || err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => { upd('image', ''); setUploadErr(''); };

  useEffect(() => {
    if (open) setForm(isCreate ? emptyForm : (contest || {}));
  }, [contest, open, isCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isCreate && !contest) return null;

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
        tickets_total: parseInt(form.tickets_total, 10) || 100,
        prize_amount: parseFloat(form.prize_amount) || 100,
        end_date: form.end_date,
        jackpot: !!form.jackpot,
        featured: !!form.featured,
        skill_question: form.skill_question,
        game_type: form.game_type || null,
      };
      if (isCreate) {
        payload.status = form.status || 'draft';
        await adminAPI.createContest(payload);
        toast({ title: 'Contest created', description: `"${payload.title}" saved as ${payload.status}` });
      } else {
        await adminAPI.updateContest(contest.contest_id, payload);
        toast({ title: 'Contest updated' });
      }
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast({ title: isCreate ? 'Create failed' : 'Update failed', description: e?.response?.data?.detail || e.message });
    } finally { setBusy(false); }
  };

  const skill = form.skill_question || { q: '', options: ['', '', '', ''], answer: '', type: 'trivia' };
  const endDateStr = form.end_date ? new Date(form.end_date).toISOString().slice(0, 16) : '';

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose?.()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isCreate ? 'Create new contest' : 'Edit contest'}</DialogTitle></DialogHeader>

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

          {/* Entry Mode + attempts + leaderboard visibility */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <div>
              <Label>Entry Mode</Label>
              <select
                value={form.entry_mode || 'skill_game'}
                onChange={e => upd('entry_mode', e.target.value)}
                data-testid="contest-entry-mode"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="skill_game">Skill Game</option>
                <option value="random_tickets">Random Ticket Numbers</option>
              </select>
              <div className="text-xs text-slate-500 mt-1">Determines the public flow after payment.</div>
            </div>
            <div>
              <Label>Attempts per ticket</Label>
              <Input
                type="number" min={1} max={10}
                value={form.attempts_per_ticket ?? form.max_attempts ?? 3}
                onChange={e => {
                  const v = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                  upd('attempts_per_ticket', v);
                  upd('max_attempts', v);  // keep legacy field in sync
                }}
                disabled={(form.entry_mode || 'skill_game') !== 'skill_game'}
                data-testid="contest-attempts-per-ticket"
              />
              <div className="text-xs text-slate-500 mt-1">
                Total attempts a user gets = <b>tickets bought × attempts per ticket</b>. Default 3.
                Example: 10 tickets × 3 = 30 total attempts pooled.
              </div>
            </div>
            <div>
              <Label>Leaderboard visibility</Label>
              <select
                value={form.leaderboard_visibility || 'live'}
                onChange={e => upd('leaderboard_visibility', e.target.value)}
                disabled={(form.entry_mode || 'skill_game') !== 'skill_game'}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="live">Live during contest</option>
                <option value="after_playing">Visible only after playing</option>
                <option value="after_close">Visible only after contest closes</option>
                <option value="hidden">Hidden</option>
              </select>
            </div>
            <div>
              <Label>Winner selection method</Label>
              <select
                value={form.winner_selection_method || 'random_draw'}
                onChange={e => upd('winner_selection_method', e.target.value)}
                disabled={(form.entry_mode || 'skill_game') === 'skill_game'}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="random_draw">Random draw (default)</option>
                <option value="manual">Manual (requires reason)</option>
              </select>
              <div className="text-xs text-slate-500 mt-1">Only for random-ticket contests. Skill contests auto-rank by score.</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-4">
            <Label>Skill game (played after ticket purchase)</Label>
            <p className="text-xs text-slate-500 -mt-1 mb-1">Optional. If none, winner is picked by admin/random draw.</p>
            <select
              value={form.game_type || ''}
              onChange={e => upd('game_type', e.target.value || null)}
              data-testid="contest-game-select"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">— None (winner picked manually) —</option>
              <optgroup label="Puzzles">
                <option value="jigsaw_3x3">Image Jigsaw (3×3)</option>
                <option value="jigsaw_4x4">Image Jigsaw (4×4)</option>
                <option value="slider_puzzle">15-Slider Puzzle</option>
                <option value="odd_one_out">Odd One Out</option>
              </optgroup>
              <optgroup label="Memory">
                <option value="memory_match">Memory Match (pairs)</option>
                <option value="simon_says">Simon Says (sequence)</option>
                <option value="pattern_repeat">Pattern Repeat</option>
              </optgroup>
              <optgroup label="Reaction">
                <option value="number_sequence">Number Sequence 1→20</option>
                <option value="target_tap">Target Tap</option>
                <option value="reaction_time">Reaction Time</option>
                <option value="whack_a_mole">Whack-a-Mole</option>
                <option value="color_match">Color Match (Stroop)</option>
                <option value="math_sprint">Math Sprint</option>
              </optgroup>
              <optgroup label="Trivia &amp; Word">
                <option value="emoji_riddle">Emoji Riddle</option>
                <option value="word_unscramble">Word Unscramble</option>
                <option value="trivia_quiz">Trivia Quiz</option>
              </optgroup>
            </select>
          </div>

          <div>
            <Label>Competition Image</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={onFileChange}
              data-testid="contest-image-input"
            />

            {/* Preview card */}
            <div className="mt-1 rounded-xl border-2 border-dashed border-slate-200 p-4 flex items-center gap-4">
              {form.image ? (
                <div className="relative w-28 h-28 shrink-0">
                  <img src={form.image} alt="Competition preview" className="w-full h-full object-cover rounded-lg border" data-testid="contest-image-preview" />
                  <button
                    type="button"
                    onClick={removeImage}
                    disabled={uploading}
                    data-testid="contest-image-remove"
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow hover:bg-rose-600 disabled:opacity-50"
                    aria-label="Remove image"
                  ><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <div className="w-28 h-28 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300 text-xs shrink-0">No image</div>
              )}

              <div className="flex-1 min-w-0">
                <Button
                  type="button"
                  onClick={onPickFile}
                  disabled={uploading}
                  data-testid="contest-image-upload-btn"
                  className="bg-slate-900 hover:bg-slate-800 text-white"
                >
                  {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4 mr-2" /> {form.image ? 'Replace image' : 'Upload image'}</>}
                </Button>
                <div className="text-xs text-slate-500 mt-2">JPG, PNG, or WEBP · up to 8 MB · used across all contest listings automatically.</div>
                {uploadErr && <div className="text-xs text-rose-600 mt-1" data-testid="contest-image-error">{uploadErr}</div>}
              </div>
            </div>

            {/* Advanced: paste an external URL (kept for backwards compat) */}
            <details className="mt-3">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">Advanced — paste an external image URL instead</summary>
              <Input value={form.image || ''} onChange={e => upd('image', e.target.value)} placeholder="https://…" className="mt-2" />
              <div className="mt-2">
                <div className="text-xs text-slate-500 mb-1">Or pick from the gallery:</div>
                <div className="flex gap-2 flex-wrap">
                  {[
                    'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
                    'https://images.pexels.com/photos/15633962/pexels-photo-15633962.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
                    'https://images.pexels.com/photos/19240616/pexels-photo-19240616.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
                    'https://images.pexels.com/photos/9462148/pexels-photo-9462148.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
                    'https://images.pexels.com/photos/973406/pexels-photo-973406.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
                    'https://images.pexels.com/photos/27064826/pexels-photo-27064826.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
                  ].map(url => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => upd('image', url)}
                      className={`w-14 h-14 rounded-lg overflow-hidden border-2 ${form.image === url ? 'border-[#6C2BFF]' : 'border-transparent hover:border-slate-300'}`}
                    ><img src={url} alt="" className="w-full h-full object-cover" /></button>
                  ))}
                </div>
              </div>
            </details>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.jackpot} onChange={e => upd('jackpot', e.target.checked)} /> Jackpot</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.featured} onChange={e => upd('featured', e.target.checked)} /> Featured</label>
            {isCreate && (
              <div className="flex items-center gap-2 text-sm ml-auto">
                <Label className="text-sm">Publish:</Label>
                <select value={form.status || 'draft'} onChange={e => upd('status', e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-sm">
                  <option value="draft">On hold (draft)</option>
                  <option value="live">Go live now</option>
                </select>
              </div>
            )}
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
          <Button
            onClick={save}
            disabled={busy || uploading}
            data-testid="contest-save-btn"
            className="bg-[#6C2BFF] hover:bg-[#4A15D9]"
          >{busy ? 'Saving…' : uploading ? 'Uploading image…' : (isCreate ? 'Create contest' : 'Save changes')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
