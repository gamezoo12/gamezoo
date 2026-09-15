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
    public_coming_soon: false,
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

  const generateContestDescription = () => {
    const title = String(form.title || '').trim() || 'This competition';
    const priceNumber = Number(form.price ?? 0);
    const ticketPrice = Number.isFinite(priceNumber) ? priceNumber : 0;
    const totalTickets = Math.max(0, parseInt(form.tickets_total, 10) || 0);
    const maxPerUser = Math.max(0, parseInt(form.max_tickets_per_user, 10) || 0);
    const attempts = Math.max(
      1,
      parseInt(form.attempts_per_ticket ?? form.max_attempts ?? 3, 10) || 1
    );
    const prizeAmount = Math.max(0, Number(form.prize_amount) || 0);
    const winners = Math.max(1, parseInt(form.num_prizes, 10) || 1);
    const engine = form.engine_type || 'leaderboard';

    const method =
      engine === 'instant_win'
        ? 'Instant Win'
        : engine === 'random_draw'
          ? 'Random Draw'
          : 'Skill Game';

    const gameName = form.game_type
      ? String(form.game_type).replace(/_/g, ' ')
      : '';

    const start = form.open_date
      ? new Date(form.open_date).toLocaleString('en-GB')
      : 'the published opening time';

    const end = form.end_date
      ? new Date(form.end_date).toLocaleString('en-GB')
      : 'the published closing time';

    const priceText =
      ticketPrice === 0
        ? 'Entry tickets are free.'
        : `Entry tickets cost ?${ticketPrice.toFixed(2)} each.`;

    const ticketText =
      totalTickets > 0
        ? `A total of ${totalTickets.toLocaleString('en-GB')} tickets are available.`
        : '';

    const limitText =
      maxPerUser > 0
        ? `Each user may enter a maximum of ${maxPerUser.toLocaleString('en-GB')} tickets.`
        : '';

    const attemptText =
      engine === 'leaderboard'
        ? `Each ticket provides ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'} at the selected skill game.`
        : '';

    const winnerText =
      winners === 1
        ? 'There will be 1 winner.'
        : `There will be ${winners} winners.`;

    const prizeBreakdown =
      winners > 1 && String(form.prize_values || '').trim()
        ? ` Prize distribution: ${String(form.prize_values).trim()}.`
        : '';

    const prizeDescription =
      String(form.prize_details || '').trim()
        ? ` ${String(form.prize_details).trim()}`
        : '';

    const methodText =
      engine === 'leaderboard'
        ? `Winner ranking is determined automatically by the leaderboard${gameName ? ` for ${gameName}` : ''}.`
        : engine === 'instant_win'
          ? 'Eligible entries are processed using the Instant Win competition engine.'
          : 'Eligible entries are included in the Random Draw competition process.';

    const postalText = form.free_postal_entry_available
      ? ` A free postal entry route is available.${
          String(form.free_postal_entry_instructions || '').trim()
            ? ` ${String(form.free_postal_entry_instructions).trim()}`
            : ''
        }`
      : '';

    const description = [
      `${title} is a ${method} competition with a prize value of ?${prizeAmount.toFixed(2)}.`,
      priceText,
      ticketText,
      limitText,
      attemptText,
      winnerText + prizeBreakdown + prizeDescription,
      `The competition opens at ${start} and closes at ${end}.`,
      methodText,
      'A skill question is used as part of the competition entry process.',
      postalText.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');

    upd('full_description', description);
    upd('short_description', `${title} ? ?${prizeAmount.toFixed(2)} prize.`);
    upd(
      'how_to_enter',
      ticketPrice === 0
        ? 'Complete the required skill question and follow the competition entry process.'
        : 'Complete the required skill question, select your tickets and complete checkout.'
    );

    if (engine === 'leaderboard') {
      upd(
        'skill_instructions',
        `Play the selected skill game using the attempts provided with each ticket. Your valid performance is recorded automatically on the leaderboard.`
      );
    }

    toast({
      title: 'Description generated',
      description: 'Review the description before saving or launching the contest.',
    });
  };

  const save = async () => {
    if (!String(form.title || '').trim()) {
      toast({
        title: 'Title required',
        description: 'Please enter the contest title.',
      });
      return;
    }

    if (form.public_coming_soon && !form.image) {
      toast({
        title: 'Image required',
        description: 'Please upload the Coming Soon image.',
      });
      return;
    }

    if (!form.public_coming_soon && !form.image) {
      toast({
        title: 'Image required',
        description: 'Please upload the contest image.',
      });
      return;
    }

    if (!form.public_coming_soon && !form.end_date) {
      toast({
        title: 'End date required',
        description: 'Please select the contest closing date and time.',
      });
      return;
    }

    if (
      !form.public_coming_soon &&
      (form.engine_type || 'leaderboard') === 'leaderboard' &&
      !form.game_type
    ) {
      toast({
        title: 'Game required',
        description: 'Please select the skill game for this contest.',
      });
      return;
    }

    setBusy(true);
    try {
      const payload = {
        title: form.title,
        subtitle: form.subtitle || '',
        category: form.category || 'prize-draws',
        image: form.image,
        price: Number.isFinite(Number(form.price)) ? Number(form.price) : 0,
        tickets_total: parseInt(form.tickets_total, 10) || 100,
        prize_amount: parseFloat(form.prize_amount) || 100,
        end_date: form.end_date,
        jackpot: !!form.jackpot,
        featured: !!form.featured,
        status: form.public_coming_soon
          ? 'draft'
          : (form.status || 'draft'),
        public_coming_soon: !!form.public_coming_soon,
        skill_question: form.skill_question,
        skill_question_type: form.skill_question_type || 'addition',
        skill_question_difficulty: form.skill_question_difficulty || 'easy',
        game_type: form.game_type || null,

        // Existing contest-engine contracts. These remain backend-compatible.
        entry_mode:
          (form.engine_type || 'leaderboard') === 'leaderboard'
            ? 'skill_game'
            : 'random_tickets',
        attempts_per_ticket: Math.max(
          1,
          parseInt(form.attempts_per_ticket ?? form.max_attempts ?? 3, 10) || 1
        ),
        max_attempts: Math.max(
          1,
          parseInt(form.attempts_per_ticket ?? form.max_attempts ?? 3, 10) || 1
        ),
        leaderboard_visibility: 'live',
        winner_selection_method:
          (form.engine_type || 'leaderboard') === 'leaderboard'
            ? 'leaderboard'
            : 'random_draw',

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

        seo_title: form.seo_title || null,
        seo_description: form.seo_description || null,
        publication_status: form.publication_status || 'published',
        engine_type: form.engine_type || 'leaderboard',
        free_postal_entry_available: !!form.free_postal_entry_available,
        free_postal_entry_instructions: form.free_postal_entry_instructions || null,
      };
      if (isCreate) {
        payload.status = form.public_coming_soon
          ? 'draft'
          : (form.status || 'draft');
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
          {/* Contest mode selector */}
          <div className="grid grid-cols-2 gap-2" data-testid="contest-mode-toggle">
            <button type="button" onClick={() => upd('public_coming_soon', false)}
              data-testid="contest-mode-real"
              className={`rounded-xl border-2 px-4 py-3 text-sm font-extrabold ${!form.public_coming_soon ? 'border-[#6C2BFF] bg-[#6C2BFF]/5 text-[#6C2BFF]' : 'border-slate-200 text-slate-500'}`}>
              REAL CONTEST
            </button>
            <button type="button" onClick={() => upd('public_coming_soon', true)}
              data-testid="contest-mode-coming-soon"
              className={`rounded-xl border-2 px-4 py-3 text-sm font-extrabold ${form.public_coming_soon ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-500'}`}>
              COMING SOON
            </button>
          </div>

          <div>
            <Label>Title</Label>
            <Input
              value={form.title || ''}
              onChange={e => upd('title', e.target.value)}
              placeholder="Enter contest title"
              data-testid="contest-title-input"
            />
          </div>

          {form.public_coming_soon && (
            <div
              className="space-y-2"
              data-testid="coming-soon-image-section"
            >
              <Label>Contest Image</Label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={onFileChange}
                data-testid="coming-soon-image-input"
              />

              {!form.image ? (
                <button
                  type="button"
                  onClick={onPickFile}
                  disabled={uploading}
                  className="flex aspect-[2/1] w-full flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-[#6C2BFF] hover:bg-[#6C2BFF]/5 disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="coming-soon-image-upload"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin text-[#6C2BFF]" />

                      <span className="mt-3 text-sm font-extrabold text-slate-800">
                        Uploading image...
                      </span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-[#6C2BFF]" />

                      <span className="mt-3 text-sm font-extrabold text-slate-900">
                        Upload Rectangle Image
                      </span>

                      <span className="mt-1 text-xs text-slate-500">
                        Recommended 1200 ? 600
                      </span>

                      <span className="mt-1 text-[11px] text-slate-400">
                        JPG, PNG or WEBP ? Maximum 8 MB
                      </span>
                    </>
                  )}
                </button>
              ) : (
                <div className="relative aspect-[2/1] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  <img
                    src={form.image}
                    alt={form.title || 'Coming Soon'}
                    className="h-full w-full object-cover object-center"
                    data-testid="coming-soon-image-preview"
                  />

                  <div className="absolute right-0 top-0 bg-black px-3 py-1.5 text-xs font-black uppercase tracking-wide text-white">
                    Coming Soon
                  </div>

                  <button
                    type="button"
                    onClick={onPickFile}
                    disabled={uploading}
                    className="absolute bottom-2 left-2 rounded-md bg-white px-3 py-2 text-xs font-extrabold text-slate-900 shadow"
                    data-testid="coming-soon-change-image"
                  >
                    {uploading ? 'Uploading...' : 'Change Image'}
                  </button>

                  <button
                    type="button"
                    onClick={removeImage}
                    disabled={uploading}
                    className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/80 text-white shadow hover:bg-black"
                    aria-label="Remove image"
                    data-testid="coming-soon-remove-image"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {uploadErr && (
                <div
                  className="text-xs font-semibold text-rose-600"
                  data-testid="coming-soon-image-error"
                >
                  {uploadErr}
                </div>
              )}
            </div>
          )}

          {!form.public_coming_soon && (<>
            {/* =========================================================
                REAL CONTEST - CLEAN ADMIN ARCHITECTURE
                ========================================================= */}

            {/* 1. CONTEST IMAGE */}
            <section
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
              data-testid="real-section-basic"
            >
              <div>
                <h3 className="text-base font-black text-slate-900">1. Contest Details</h3>
                <p className="text-xs text-slate-500">
                  The contest title is above. Upload the main rectangle image here.
                </p>
              </div>

              <div>
                <Label>Contest Image</Label>
                <ContestImageFocalPicker
                  initialImage={form.image}
                  onUploaded={(r) => {
                    if (r?.sizes?.card) upd('image', r.sizes.card);
                    else if (r?.recommended_image_url) upd('image', r.recommended_image_url);
                  }}
                />
              </div>
            </section>


            {/* 2. ENTRY SETTINGS */}
            <section
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
              data-testid="real-section-entry"
            >
              <div>
                <h3 className="text-base font-black text-slate-900">2. Entry Settings</h3>
                <p className="text-xs text-slate-500">
                  Set ticket price to ?0 when the contest is free.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label>Ticket Price (?)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price ?? 0}
                    onChange={e => upd('price', e.target.value)}
                    data-testid="real-ticket-price"
                  />
                </div>

                <div>
                  <Label>Total Tickets</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.tickets_total ?? 150}
                    onChange={e => upd('tickets_total', e.target.value)}
                    data-testid="real-total-tickets"
                  />
                </div>

                <div>
                  <Label>Maximum Entries Per User</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.max_tickets_per_user ?? ''}
                    onChange={e => upd('max_tickets_per_user', e.target.value)}
                    placeholder="e.g. 20"
                    data-testid="real-max-entries"
                  />
                </div>

                <div>
                  <Label>Attempts Per Entry</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={form.attempts_per_ticket ?? form.max_attempts ?? 3}
                    onChange={e => {
                      const v = Math.max(
                        1,
                        Math.min(10, parseInt(e.target.value, 10) || 1)
                      );
                      upd('attempts_per_ticket', v);
                      upd('max_attempts', v);
                    }}
                    data-testid="real-attempts-per-entry"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Used by Skill Game contests. No separate game timer is configured here.
                  </p>
                </div>
              </div>
            </section>


            {/* 3. PRIZE SETTINGS */}
            <section
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
              data-testid="real-section-prize"
            >
              <div>
                <h3 className="text-base font-black text-slate-900">3. Prize Settings</h3>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label>Prize Value (?)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.prize_amount ?? 0}
                    onChange={e => upd('prize_amount', e.target.value)}
                    data-testid="real-prize-value"
                  />
                </div>

                <div>
                  <Label>Number of Winners</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.num_prizes ?? 1}
                    onChange={e =>
                      upd(
                        'num_prizes',
                        Math.max(1, parseInt(e.target.value, 10) || 1)
                      )
                    }
                    data-testid="real-number-winners"
                  />
                </div>
              </div>

              {(parseInt(form.num_prizes, 10) || 1) > 1 && (
                <div>
                  <Label>Prize Distribution</Label>
                  <Input
                    value={form.prize_values || ''}
                    onChange={e => upd('prize_values', e.target.value)}
                    placeholder="e.g. 1st ?300, 2nd ?100, 3rd ?50"
                    data-testid="real-prize-distribution"
                  />
                </div>
              )}

              <div>
                <Label>Prize Description</Label>
                <textarea
                  rows={3}
                  value={form.prize_details || ''}
                  onChange={e => upd('prize_details', e.target.value)}
                  placeholder="Describe the prize and any important fulfilment information."
                  className="w-full rounded-lg border border-slate-200 p-3 text-sm"
                  data-testid="real-prize-description"
                />
              </div>
            </section>


            {/* 4. SCHEDULE */}
            <section
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
              data-testid="real-section-schedule"
            >
              <div>
                <h3 className="text-base font-black text-slate-900">4. Contest Schedule</h3>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label>Start Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={
                      form.open_date
                        ? new Date(form.open_date).toISOString().slice(0, 16)
                        : ''
                    }
                    onChange={e =>
                      upd(
                        'open_date',
                        e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null
                      )
                    }
                    data-testid="real-start-date"
                  />
                </div>

                <div>
                  <Label>End Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={endDateStr}
                    onChange={e =>
                      upd(
                        'end_date',
                        e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null
                      )
                    }
                    data-testid="real-end-date"
                  />
                </div>
              </div>
            </section>


            {/* 5. CONTEST TYPE */}
            <section
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
              data-testid="real-section-engine"
            >
              <div>
                <h3 className="text-base font-black text-slate-900">5. Contest Type</h3>
                <p className="text-xs text-slate-500">
                  Choose how the competition winner is determined.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  ['leaderboard', 'SKILL GAME'],
                  ['instant_win', 'INSTANT WIN'],
                  ['random_draw', 'RANDOM DRAW'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => upd('engine_type', value)}
                    className={`rounded-xl border-2 px-3 py-3 text-xs font-black ${
                      (form.engine_type || 'leaderboard') === value
                        ? 'border-[#6C2BFF] bg-[#6C2BFF]/5 text-[#6C2BFF]'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                    data-testid={`real-engine-${value}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>


            {/* 6. SKILL QUESTION */}
            <section
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
              data-testid="real-section-skill-question"
            >
              <div>
                <h3 className="text-base font-black text-slate-900">6. Skill Question</h3>
                <p className="text-xs text-slate-500">
                  The backend generates a fresh question for each visitor.
                  This preview is only an admin sample.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label>Operation</Label>
                  <select
                    value={form.skill_question_type || 'addition'}
                    onChange={e => upd('skill_question_type', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    data-testid="skill-op-select"
                  >
                    <option value="addition">Addition (+)</option>
                    <option value="subtraction">Subtraction (-)</option>
                    <option value="multiplication">Multiplication (?)</option>
                    <option value="division">Division (?)</option>
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
            </section>


            {/* 7. GAME - ONLY FOR SKILL GAME */}
            {(form.engine_type || 'leaderboard') === 'leaderboard' && (
              <section
                className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
                data-testid="real-section-game"
              >
                <div>
                  <h3 className="text-base font-black text-slate-900">7. Select Game</h3>
                  <p className="text-xs text-slate-500">
                    Game timing/scoring remains controlled by the existing game engine.
                    Leaderboard visibility is automatic.
                  </p>
                </div>

                <select
                  value={form.game_type || ''}
                  onChange={e => upd('game_type', e.target.value || null)}
                  data-testid="contest-game-select"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select a game</option>

                  <optgroup label="Puzzles">
                    <option value="jigsaw_3x3">Image Jigsaw (3?3)</option>
                    <option value="jigsaw_4x4">Image Jigsaw (4?4)</option>
                    <option value="slider_puzzle">15-Slider Puzzle</option>
                    <option value="odd_one_out">Odd One Out</option>
                  </optgroup>

                  <optgroup label="Memory">
                    <option value="memory_match">Memory Match (pairs)</option>
                    <option value="simon_says">Simon Says (sequence)</option>
                    <option value="pattern_repeat">Pattern Repeat</option>
                  </optgroup>

                  <optgroup label="Reaction">
                    <option value="number_sequence">Number Sequence 1?20</option>
                    <option value="target_tap">Target Tap</option>
                    <option value="reaction_time">Reaction Time</option>
                    <option value="whack_a_mole">Whack-a-Mole</option>
                    <option value="color_match">Color Match (Stroop)</option>
                    <option value="math_sprint">Math Sprint</option>
                  </optgroup>

                  <optgroup label="Trivia & Word">
                    <option value="emoji_riddle">Emoji Riddle</option>
                    <option value="word_unscramble">Word Unscramble</option>
                    <option value="trivia_quiz">Trivia Quiz</option>
                  </optgroup>
                </select>
              </section>
            )}


            {/* Existing operational controls remain available after creation */}
            {!isCreate && form.engine_type === 'random_draw' && (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-base font-black text-slate-900">
                  Random Draw Controls
                </h3>
                <RandomDrawPanel contestId={contest.contest_id} />
              </section>
            )}

            {!isCreate && form.engine_type === 'instant_win' && (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-base font-black text-slate-900">
                  Instant Win Controls
                </h3>
                <InstantWinComposer contestId={contest.contest_id} />
              </section>
            )}


            {/* 8. POSTAL ENTRY */}
            <section
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
              data-testid="real-section-postal"
            >
              <div>
                <h3 className="text-base font-black text-slate-900">8. Postal Entry</h3>
              </div>

              <label className="flex items-center gap-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={!!form.free_postal_entry_available}
                  onChange={e =>
                    upd('free_postal_entry_available', e.target.checked)
                  }
                  data-testid="fld-postal-toggle"
                  className="h-4 w-4 accent-emerald-600"
                />
                Free postal entry available for this contest
              </label>

              {form.free_postal_entry_available && (
                <div>
                  <Label>Postal Entry Instructions</Label>
                  <textarea
                    rows={4}
                    value={form.free_postal_entry_instructions || ''}
                    onChange={e =>
                      upd('free_postal_entry_instructions', e.target.value)
                    }
                    placeholder="Enter any contest-specific postal entry instructions."
                    className="w-full rounded-lg border border-slate-200 p-3 text-sm"
                    data-testid="real-postal-instructions"
                  />
                </div>
              )}
            </section>


            {/* 9. AUTO DESCRIPTION */}
            <section
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
              data-testid="real-section-description"
            >
              <div>
                <h3 className="text-base font-black text-slate-900">
                  9. Contest Description
                </h3>
                <p className="text-xs text-slate-500">
                  Generate the customer-facing description from the contest settings above.
                  You can review and edit it before saving.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={generateContestDescription}
                data-testid="generate-contest-description"
              >
                Generate Description
              </Button>

              <textarea
                rows={10}
                value={form.full_description || ''}
                onChange={e => upd('full_description', e.target.value)}
                placeholder="Click Generate Description after completing the contest details."
                className="w-full rounded-lg border border-slate-200 p-3 text-sm"
                data-testid="real-generated-description"
              />
            </section>


            {/* PUBLISH */}
            <section
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2"
              data-testid="real-section-publish"
            >
              <Label>Contest Status</Label>
              <select
                value={form.status || 'draft'}
                onChange={e => upd('status', e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                data-testid="contest-status-select"
              >
                <option value="draft">Save as Draft</option>
                <option value="live">Launch Contest</option>
              </select>
            </section>
          </>)}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={save}
            disabled={busy || uploading}
            data-testid="contest-save-btn"
            className="bg-[#6C2BFF] hover:bg-[#4A15D9]"
          >{busy
            ? 'Saving...'
            : uploading
              ? 'Uploading image...'
              : form.public_coming_soon
                ? 'Launch'
                : (isCreate ? 'Create contest' : 'Save changes')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
