import { useEffect, useState } from 'react';
import { Eye, Save, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { signupChallengeAdminAPI, uploadsAPI } from '../../../lib/api';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Switch } from '../../ui/switch';
import { Label } from '../../ui/label';

export const errText = (e) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : d?.message || (Array.isArray(d) ? d.map((x) => x.msg).join(', ') : 'Request failed'); };
const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const toIso = (v) => (v ? new Date(v).toISOString() : null);

export const BLANK = {
  title: 'WELCOME CHALLENGE', description: 'Play our skill game and post the highest verified score to win.', prize_type: 'cash', prize_amount_gbp: 50,
  prize_label: '£50 GIVEAWAY', prize_description: '', game_id: 'number_sequence', game_config: { target: 20 }, attempts_allowed: 3, time_limit_s: 60,
  demo_enabled: true, demo_time_limit_s: 30, demo_max_runs: 3, how_to_play: [], start_at: null, end_at: null, eligible_signups_from: null,
  uk_only: true, winner_count: 1, prize_distribution: [{ rank: 1, prize: '£50' }], ranking_method: 'highest_score', tie_break: 'fastest_time',
  whatsapp_url: 'https://chat.whatsapp.com/I6L15DZ3r9FD4NEaNPDesL', instagram_url: 'https://www.instagram.com/prizeleague', share_url: 'https://www.prizeleague.co.uk',
  background_url: '', scorecard_bg_url: '', rules_text: '', legal_reviewed: false,
};

function Field({ label, children, hint }) {
  return <div className="space-y-1"><Label className="text-xs font-semibold text-slate-600">{label}</Label>{children}{hint && <p className="text-[11px] text-slate-400">{hint}</p>}</div>;
}
const sel = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm';

function ImageField({ label, value, onChange, testId }) {
  const [busy, setBusy] = useState(false);
  const up = async (f) => { if (!f) return; setBusy(true); try { onChange((await uploadsAPI.image(f)).url); toast.success('Image uploaded'); } catch (e) { toast.error(errText(e)); } finally { setBusy(false); } };
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" data-testid={`${testId}-url`} />
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 text-xs font-semibold" data-testid={`${testId}-upload`}>
          <Upload className="h-3.5 w-3.5" />{busy ? '…' : 'Upload'}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => up(e.target.files?.[0])} />
        </label>
      </div>
    </Field>
  );
}

export default function ChallengeEditor({ initial, games, onSaved, onPreview }) {
  const [f, setF] = useState(initial || BLANK);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setF(initial || BLANK); }, [initial]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const cfg = (k, v) => setF((p) => ({ ...p, game_config: { ...p.game_config, [k]: Number(v) } }));
  const game = games.find((g) => g.id === f.game_id);
  const tiers = (f.prize_distribution || []).map((t) => `${t.rank}: ${t.prize}`).join('\n');
  const locked = f.status === 'archived';

  const body = () => ({
    ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, f[k]])),
    prize_amount_gbp: f.prize_amount_gbp === '' ? null : Number(f.prize_amount_gbp),
    attempts_allowed: Number(f.attempts_allowed), time_limit_s: Number(f.time_limit_s), demo_time_limit_s: Number(f.demo_time_limit_s),
    demo_max_runs: Number(f.demo_max_runs), winner_count: Number(f.winner_count),
  });
  const save = async () => {
    setSaving(true);
    try {
      const r = f.challenge_id ? await signupChallengeAdminAPI.update(f.challenge_id, body()) : await signupChallengeAdminAPI.create(body());
      toast.success(f.challenge_id ? 'Challenge saved. Existing participants keep their original rules.' : 'Draft challenge created');
      onSaved(r);
    } catch (e) { toast.error(errText(e)); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6" data-testid="sc-admin-editor">
      <section className="grid gap-4 md:grid-cols-2">
        <Field label="Challenge title"><Input value={f.title} onChange={(e) => set('title', e.target.value)} data-testid="sc-admin-title" /></Field>
        <Field label="Prize headline (shown big)"><Input value={f.prize_label} onChange={(e) => set('prize_label', e.target.value)} data-testid="sc-admin-prize-label" /></Field>
        <Field label="Prize type">
          <select className={sel} value={f.prize_type} onChange={(e) => set('prize_type', e.target.value)} data-testid="sc-admin-prize-type">
            <option value="cash">Cash</option><option value="gift">Gift / physical prize</option><option value="voucher">Voucher</option><option value="other">Other</option>
          </select>
        </Field>
        <Field label="Prize value (£, optional)"><Input type="number" min="0" value={f.prize_amount_gbp ?? ''} onChange={(e) => set('prize_amount_gbp', e.target.value)} data-testid="sc-admin-prize-amount" /></Field>
        <Field label="Prize details (e.g. gift name)"><Input value={f.prize_description} onChange={(e) => set('prize_description', e.target.value)} data-testid="sc-admin-prize-description" /></Field>
        <Field label="Description"><Input value={f.description} onChange={(e) => set('description', e.target.value)} data-testid="sc-admin-description" /></Field>
      </section>

      <section className="grid gap-4 rounded-xl border p-4 md:grid-cols-3">
        <Field label="Game" hint={game && !game.supported ? game.reason : 'Only games the server scores itself can be used.'}>
          <select className={sel} value={f.game_id} onChange={(e) => { const g = games.find((x) => x.id === e.target.value); setF((p) => ({ ...p, game_id: e.target.value, game_config: g?.defaults || {} })); }} data-testid="sc-admin-game">
            {games.map((g) => <option key={g.id} value={g.id} disabled={!g.supported}>{g.label}{g.supported ? '' : ' (unsupported)'}</option>)}
          </select>
        </Field>
        {f.game_id === 'number_sequence'
          ? <Field label="Numbers to tap (5-50)"><Input type="number" min="5" max="50" value={f.game_config?.target ?? 20} onChange={(e) => cfg('target', e.target.value)} data-testid="sc-admin-cfg-target" /></Field>
          : <>
            <Field label="Colours (2-11)"><Input type="number" min="2" max="11" value={f.game_config?.colours ?? 6} onChange={(e) => cfg('colours', e.target.value)} data-testid="sc-admin-cfg-colours" /></Field>
            <Field label="Rounds (5-40)"><Input type="number" min="5" max="40" value={f.game_config?.rounds ?? 20} onChange={(e) => cfg('rounds', e.target.value)} data-testid="sc-admin-cfg-rounds" /></Field>
          </>}
        <Field label="Real attempts (1-10)"><Input type="number" min="1" max="10" value={f.attempts_allowed} onChange={(e) => set('attempts_allowed', e.target.value)} data-testid="sc-admin-attempts" /></Field>
        <Field label="Time limit per attempt (s)"><Input type="number" min="10" max="600" value={f.time_limit_s} onChange={(e) => set('time_limit_s', e.target.value)} data-testid="sc-admin-time-limit" /></Field>
        <Field label="How to play (one step per line)"><Textarea rows={3} value={(f.how_to_play || []).join('\n')} onChange={(e) => set('how_to_play', e.target.value.split('\n'))} placeholder={game?.how_to?.join('\n')} data-testid="sc-admin-how-to" /></Field>
      </section>

      <section className="grid gap-4 rounded-xl border p-4 md:grid-cols-3">
        <div className="flex items-center gap-3"><Switch checked={f.demo_enabled} onCheckedChange={(v) => set('demo_enabled', v)} data-testid="sc-admin-demo-enabled" /><Label>Demo / practice mode</Label></div>
        <Field label="Demo time limit (s)"><Input type="number" min="10" max="300" value={f.demo_time_limit_s} onChange={(e) => set('demo_time_limit_s', e.target.value)} data-testid="sc-admin-demo-time" /></Field>
        <Field label="Practice runs allowed"><Input type="number" min="1" max="20" value={f.demo_max_runs} onChange={(e) => set('demo_max_runs', e.target.value)} data-testid="sc-admin-demo-runs" /></Field>
        <Field label="Starts"><Input type="datetime-local" value={toLocal(f.start_at)} onChange={(e) => set('start_at', toIso(e.target.value))} data-testid="sc-admin-start" /></Field>
        <Field label="Closes (required to publish)"><Input type="datetime-local" value={toLocal(f.end_at)} onChange={(e) => set('end_at', toIso(e.target.value))} data-testid="sc-admin-end" /></Field>
        <Field label="Eligible signups from" hint="Blank = accounts created after publishing."><Input type="datetime-local" value={toLocal(f.eligible_signups_from)} onChange={(e) => set('eligible_signups_from', toIso(e.target.value))} data-testid="sc-admin-eligible-from" /></Field>
        <div className="flex items-center gap-3"><Switch checked={f.uk_only} onCheckedChange={(v) => set('uk_only', v)} data-testid="sc-admin-uk-only" /><Label>Real attempts: UK + verified +44 mobile only</Label></div>
      </section>

      <section className="grid gap-4 rounded-xl border p-4 md:grid-cols-3">
        <Field label="Winners"><Input type="number" min="1" max="100" value={f.winner_count} onChange={(e) => set('winner_count', e.target.value)} data-testid="sc-admin-winner-count" /></Field>
        <Field label="Prize per rank (rank: prize, one per line)">
          <Textarea rows={3} defaultValue={tiers} key={f.challenge_id || 'new'} data-testid="sc-admin-distribution"
            onBlur={(e) => set('prize_distribution', e.target.value.split('\n').map((l) => l.split(':')).filter((p) => p.length > 1 && Number(p[0]) > 0 && p.slice(1).join(':').trim()).map((p) => ({ rank: Number(p[0]), prize: p.slice(1).join(':').trim() })))} />
        </Field>
        <Field label="Winner method / tie-break" hint="Winner = highest verified score.">
          <select className={sel} value={f.tie_break} onChange={(e) => set('tie_break', e.target.value)} data-testid="sc-admin-tie-break">
            <option value="fastest_time">Tie: faster time, then earliest finish</option><option value="earliest_finish">Tie: earliest finish</option>
          </select>
        </Field>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Field label="WhatsApp community link"><Input value={f.whatsapp_url} onChange={(e) => set('whatsapp_url', e.target.value)} data-testid="sc-admin-whatsapp" /></Field>
        <Field label="Instagram page link"><Input value={f.instagram_url} onChange={(e) => set('instagram_url', e.target.value)} data-testid="sc-admin-instagram" /></Field>
        <Field label="Share link base"><Input value={f.share_url} onChange={(e) => set('share_url', e.target.value)} data-testid="sc-admin-share-url" /></Field>
        <ImageField label="Challenge background" value={f.background_url} onChange={(v) => set('background_url', v)} testId="sc-admin-bg" />
        <ImageField label="Scorecard background" value={f.scorecard_bg_url} onChange={(v) => set('scorecard_bg_url', v)} testId="sc-admin-card-bg" />
      </section>

      <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <Field label="Published giveaway rules (eligibility, closing date, prize terms, winner selection)"><Textarea rows={5} value={f.rules_text} onChange={(e) => set('rules_text', e.target.value)} data-testid="sc-admin-rules" /></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.legal_reviewed} onChange={(e) => set('legal_reviewed', e.target.checked)} data-testid="sc-admin-legal-reviewed" />
          The rules and UK promotional/legal classification have been reviewed. Publishing is blocked until this is ticked.</label>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={saving || locked} data-testid="sc-admin-save"><Save className="mr-1 h-4 w-4" />{saving ? 'Saving…' : f.challenge_id ? 'Save changes' : 'Create draft'}</Button>
        <Button variant="outline" onClick={() => onPreview({ ...BLANK, ...f, ...body() }, game)} data-testid="sc-admin-preview"><Eye className="mr-1 h-4 w-4" />Preview full screen</Button>
        <Button variant="outline" onClick={() => onPreview({ ...BLANK, ...f, ...body() }, game, true)} data-testid="sc-admin-preview-scorecard"><Eye className="mr-1 h-4 w-4" />Preview scorecard</Button>
      </div>
    </div>
  );
}
