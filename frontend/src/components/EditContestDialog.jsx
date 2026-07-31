import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { adminAPI, uploadsAPI, api, API } from '../lib/api';
import {
  ContestImageFocalPicker,
  RandomDrawPanel,
  InstantWinComposer,
} from './ContestEngineControls';
import { useToast } from '../hooks/use-toast';
import { Upload, X, Loader2 } from 'lucide-react';

const CATS = [
  { value: 'prize-draws', label: 'Prize Draws' },
  { value: 'instant-wins', label: 'Instant Wins' },
  { value: 'jackpot', label: 'Jackpot' },
  { value: 'new-games', label: 'New Game' },
];

// Live preview of the auto-generated skill question. Whenever admin changes
// the operation or difficulty in the dialog we call a lightweight sample
// generator to give a concrete "here's what your users will see" hint. The
// actual question is generated PER-VISITOR on the backend — this is only a
// UI preview and never leaks the answer to any real player.
function SkillQuestionPreview({ op, difficulty }) {
  const sample = (() => {
    const r = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
    if (op === 'subtraction') {
      const [lo, hi, sb] = difficulty === 'easy' ? [5, 20, 5]
        : difficulty === 'medium' ? [20, 99, 20] : [200, 999, 99];
      const a = r(lo, hi); const b = r(1, Math.min(sb, a - 1));
      return { q: `${a} − ${b} = ?`, ans: a - b };
    }
    if (op === 'multiplication') {
      const ranges = { easy: [[1, 10], [1, 5]], medium: [[2, 12], [2, 12]], hard: [[10, 25], [2, 12]] };
      const [[la, ha], [lb, hb]] = ranges[difficulty] || ranges.easy;
      const a = r(la, ha); const b = r(lb, hb);
      return { q: `${a} × ${b} = ?`, ans: a * b };
    }
    if (op === 'division') {
      const ranges = { easy: [[1, 5], [1, 10]], medium: [[2, 12], [2, 12]], hard: [[5, 15], [5, 20]] };
      const [[lb, hb], [lr, hr]] = ranges[difficulty] || ranges.easy;
      const b = r(lb, hb); const q = r(lr, hr);
      return { q: `${b * q} ÷ ${b} = ?`, ans: q };
    }
    const ranges = { easy: [1, 20], medium: [10, 99], hard: [100, 999] };
    const [lo, hi] = ranges[difficulty] || ranges.easy;
    const a = r(lo, hi); const b = r(lo, hi);
    return { q: `${a} + ${b} = ?`, ans: a + b };
  })();
  return (
    <div className="mt-3 rounded-xl bg-white border border-slate-200 p-3 text-sm" data-testid="skill-preview">
      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Sample question a user might see</div>
      <div className="font-mono font-bold text-slate-900 text-lg mt-1">{sample.q}</div>
      <div className="text-xs text-slate-500 mt-1">Answer for this sample: <span className="font-mono">{sample.ans}</span> · Each visitor gets a different one</div>
    </div>
  );
}


export default function EditContestDialog({ contest, open, onClose, onSaved, mode = 'edit' }) {
  const { toast } = useToast();
  const isCreate = mode === 'create';
  const emptyForm = {
    title: '', subtitle: '', category: 'prize-draws', image: '',
    price: 1, tickets_total: 150, prize_amount: 100,
    end_date: new Date(Date.now() + 7 * 86400000).toISOString(),
    jackpot: false, featured: false, status: 'draft',
    skill_question_type: 'addition',
    skill_question_difficulty: 'easy',
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
      const data = await uploadsAPI.contestImage(file, { focal_x: 0.5, focal_y: 0.5, alt: form.title || '' });
      upd('image', data?.sizes?.card || data?.recommended_image_url);
      upd('mobile_image', data?.sizes?.mobile || data?.recommended_mobile_image_url);
      toast({ title: 'Image processed', description: `Generated ${Object.keys(data?.sizes || {}).length} responsive variants.` });
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
        skill_question_type: form.skill_question_type || 'addition',
        skill_question_difficulty: form.skill_question_difficulty || 'easy',
        game_type: form.game_type || null,

        // Extended editable fields (Phase-1 launch spec)
        short_description: form.short_description || null,
        full_description: form.full_description || null,
        how_to_enter: form.how_to_enter || null,
        skill_instructions: form.skill_instructions || null,
        eligibility: form.eligibility || null,
        max_tickets_per_user: form.max_tickets_per_user ? parseInt(form.max_tickets_per_user, 10) : null,
        open_date: form.open_date || null,
        draw_date: form.draw_date || null,
        prize_details: form.prize_details || null,
        num_prizes: form.num_prizes ? parseInt(form.num_prizes, 10) : 1,
        prize_values: form.prize_values || null,
        winner_method: form.winner_method || null,
        scoring_method: form.scoring_method || null,
        tiebreak_method: form.tiebreak_method || null,
        verification_method: form.verification_method || null,
        prize_credit_timeframe: form.prize_credit_timeframe || null,
        refund_conditions: form.refund_conditions || null,
        important_info: form.important_info || null,
        contest_rules: form.contest_rules || null,
        terms_acknowledgement: form.terms_acknowledgement || null,
        country_restrictions: form.country_restrictions || null,
        age_restriction: form.age_restriction || '18+',
        mobile_image: form.mobile_image || null,
        seo_title: form.seo_title || null,
        seo_description: form.seo_description || null,
        publication_status: form.publication_status || 'published',
        engine_type: form.engine_type || 'leaderboard',
        free_postal_entry_available: !!form.free_postal_entry_available,
        free_postal_entry_instructions: form.free_postal_entry_instructions || null,
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

  const skill = form.skill_question || { q: '', options: ['', '', '', ''], answer: '', type: 'trivia' }; // eslint-disable-line no-unused-vars
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
            <Label className="text-base font-semibold">Skill question (auto-generated)</Label>
            <p className="text-xs text-slate-500 mt-1">
              Every visitor gets a fresh math problem, verified server-side. Pick the
              operation and difficulty; the platform generates a new question per user.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <Label>Operation</Label>
                <select
                  value={form.skill_question_type || 'addition'}
                  onChange={e => upd('skill_question_type', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  data-testid="skill-op-select"
                >
                  <option value="addition">Addition (+)</option>
                  <option value="subtraction">Subtraction (−)</option>
                  <option value="multiplication">Multiplication (×)</option>
                  <option value="division">Division (÷)</option>
                </select>
              </div>
              <div>
                <Label>Difficulty</Label>
                <select
                  value={form.skill_question_difficulty || 'easy'}
                  onChange={e => upd('skill_question_difficulty', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  data-testid="skill-difficulty-select"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <SkillQuestionPreview
              op={form.skill_question_type || 'addition'}
              difficulty={form.skill_question_difficulty || 'easy'}
            />
          </div>

          {/* ---- Extended admin fields (23 optional) ---- */}
          <details className="pt-3 border-t border-slate-100" data-testid="advanced-contest-fields">
            <summary className="cursor-pointer text-base font-semibold text-[#6C2BFF] py-2 select-none">
              Advanced fields (contest info, T&amp;Cs, SEO, postal entry) — 23 fields
            </summary>
            <div className="grid md:grid-cols-2 gap-3 mt-3">
              <div className="md:col-span-2">
                <Label>Short description</Label>
                <Input value={form.short_description || ''} onChange={e => upd('short_description', e.target.value)} data-testid="fld-short-description" />
              </div>
              <div className="md:col-span-2">
                <Label>Full description</Label>
                <textarea rows={3} value={form.full_description || ''} onChange={e => upd('full_description', e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" data-testid="fld-full-description" />
              </div>
              <div className="md:col-span-2">
                <Label>How to enter</Label>
                <textarea rows={2} value={form.how_to_enter || ''} onChange={e => upd('how_to_enter', e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <Label>Skill game instructions</Label>
                <textarea rows={2} value={form.skill_instructions || ''} onChange={e => upd('skill_instructions', e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <Label>Eligibility</Label>
                <textarea rows={2} value={form.eligibility || ''} onChange={e => upd('eligibility', e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              </div>
              <div>
                <Label>Max tickets per user</Label>
                <Input type="number" value={form.max_tickets_per_user || ''} onChange={e => upd('max_tickets_per_user', e.target.value)} />
              </div>
              <div>
                <Label>Number of prizes</Label>
                <Input type="number" value={form.num_prizes || 1} onChange={e => upd('num_prizes', e.target.value)} />
              </div>
              <div>
                <Label>Open date</Label>
                <Input type="datetime-local" value={form.open_date ? new Date(form.open_date).toISOString().slice(0, 16) : ''} onChange={e => upd('open_date', e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </div>
              <div>
                <Label>Draw / result date</Label>
                <Input type="datetime-local" value={form.draw_date ? new Date(form.draw_date).toISOString().slice(0, 16) : ''} onChange={e => upd('draw_date', e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </div>
              <div className="md:col-span-2">
                <Label>Prize details</Label>
                <textarea rows={2} value={form.prize_details || ''} onChange={e => upd('prize_details', e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <Label>Prize values (breakdown)</Label>
                <Input value={form.prize_values || ''} onChange={e => upd('prize_values', e.target.value)} placeholder="e.g. 1st £500 · 2nd £250 · 3rd £100" />
              </div>
              <div><Label>Winner determination method</Label><Input value={form.winner_method || ''} onChange={e => upd('winner_method', e.target.value)} /></div>
              <div><Label>Scoring method</Label><Input value={form.scoring_method || ''} onChange={e => upd('scoring_method', e.target.value)} /></div>
              <div><Label>Tie-break method</Label><Input value={form.tiebreak_method || ''} onChange={e => upd('tiebreak_method', e.target.value)} /></div>
              <div><Label>Result verification method</Label><Input value={form.verification_method || ''} onChange={e => upd('verification_method', e.target.value)} /></div>
              <div><Label>Prize crediting timeframe</Label><Input value={form.prize_credit_timeframe || ''} onChange={e => upd('prize_credit_timeframe', e.target.value)} /></div>
              <div><Label>Refund conditions</Label><Input value={form.refund_conditions || ''} onChange={e => upd('refund_conditions', e.target.value)} /></div>
              <div className="md:col-span-2"><Label>Important information</Label><textarea rows={2} value={form.important_info || ''} onChange={e => upd('important_info', e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" /></div>
              <div className="md:col-span-2"><Label>Contest-specific rules</Label><textarea rows={2} value={form.contest_rules || ''} onChange={e => upd('contest_rules', e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" /></div>
              <div className="md:col-span-2"><Label>Terms acknowledgement</Label><textarea rows={2} value={form.terms_acknowledgement || ''} onChange={e => upd('terms_acknowledgement', e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" /></div>
              <div><Label>Country restrictions</Label><Input value={form.country_restrictions || ''} onChange={e => upd('country_restrictions', e.target.value)} placeholder="United Kingdom only" /></div>
              <div><Label>Age restriction</Label><Input value={form.age_restriction || '18+'} onChange={e => upd('age_restriction', e.target.value)} /></div>
              <div><Label>Mobile image URL</Label><Input value={form.mobile_image || ''} onChange={e => upd('mobile_image', e.target.value)} placeholder="Optional smaller image for mobile" /></div>
              <div>
                <Label>Contest engine</Label>
                <select value={form.engine_type || 'leaderboard'} onChange={e => upd('engine_type', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" data-testid="fld-engine-type">
                  <option value="leaderboard">Skill Leaderboard (Engine 1) — active</option>
                  <option value="random_draw">Random draw (Engine 2) — requires legal flag</option>
                  <option value="instant_win">Instant win (Engine 3) — requires legal flag</option>
                </select>
              </div>
              <div>
                <Label>Publication status</Label>
                <select value={form.publication_status || 'published'} onChange={e => upd('publication_status', e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
              <div><Label>SEO title</Label><Input value={form.seo_title || ''} onChange={e => upd('seo_title', e.target.value)} /></div>
              <div><Label>SEO description</Label><Input value={form.seo_description || ''} onChange={e => upd('seo_description', e.target.value)} /></div>
              <div className="md:col-span-2 flex items-center gap-2 mt-1">
                <input type="checkbox" checked={!!form.free_postal_entry_available} onChange={e => upd('free_postal_entry_available', e.target.checked)} data-testid="fld-postal-toggle" className="w-4 h-4 accent-emerald-600" />
                <Label className="!m-0">Free postal entry available for this contest</Label>
              </div>
              {form.free_postal_entry_available && (
                <div className="md:col-span-2">
                  <Label>Free postal entry instructions (contest-specific)</Label>
                  <textarea rows={2} value={form.free_postal_entry_instructions || ''} onChange={e => upd('free_postal_entry_instructions', e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
                </div>
              )}
            </div>
          </details>

          {/* ---- Focal-point image uploader ---- */}
          <details className="pt-3 border-t border-slate-100" data-testid="focal-picker-section">
            <summary className="cursor-pointer text-base font-semibold text-[#6C2BFF] py-2 select-none">
              Image upload with focal-point picker (recommended)
            </summary>
            <div className="mt-3">
              <ContestImageFocalPicker
                initialImage={form.image}
                onUploaded={(r) => {
                  if (r?.sizes?.card) upd('image', r.sizes.card);
                  if (r?.sizes?.mobile) upd('mobile_image', r.sizes.mobile);
                }}
              />
            </div>
          </details>

          {/* ---- Engine 2: Random Draw controls ---- */}
          {!isCreate && form.engine_type === 'random_draw' && (
            <details className="pt-3 border-t border-slate-100" data-testid="random-draw-section">
              <summary className="cursor-pointer text-base font-semibold text-[#6C2BFF] py-2 select-none">
                Random Draw controls (Engine 2)
              </summary>
              <div className="mt-3"><RandomDrawPanel contestId={contest.contest_id} /></div>
            </details>
          )}

          {/* ---- Engine 3: Instant Win composer ---- */}
          {!isCreate && form.engine_type === 'instant_win' && (
            <details className="pt-3 border-t border-slate-100" data-testid="instant-win-section">
              <summary className="cursor-pointer text-base font-semibold text-[#6C2BFF] py-2 select-none">
                Instant Win composer (Engine 3)
              </summary>
              <div className="mt-3"><InstantWinComposer contestId={contest.contest_id} /></div>
            </details>
          )}
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
