import { useCallback, useEffect, useState } from 'react';
import { Archive, Gift, Pause, Plus, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { signupChallengeAdminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import ChallengeEditor, { BLANK, errText } from '../../components/admin/signupChallenge/ChallengeEditor';
import { AnalyticsPanel, ParticipantsPanel } from '../../components/admin/signupChallenge/Panels';
import SignupChallengeScreen from '../../components/signupChallenge/SignupChallengeScreen';

const BADGE = { draft: 'bg-slate-100 text-slate-700', published: 'bg-emerald-100 text-emerald-800', paused: 'bg-amber-100 text-amber-800', archived: 'bg-slate-200 text-slate-500' };

function previewState(f, game, card) {
  const n = Number(f.attempts_allowed) || 1;
  const attempts = card ? Array.from({ length: n }, (_, i) => ({ attempt_id: `p${i}`, attempt_no: i + 1, status: 'completed', score: 1250 + i * 450, duration_ms: 20000 - i * 1500 })) : [];
  return {
    challenge: { ...f, challenge_id: f.challenge_id || 'preview', game_label: game?.label || f.game_id, how_to_play: (f.how_to_play || []).filter((s) => s.trim()).length ? f.how_to_play.filter((s) => s.trim()) : game?.how_to || [] },
    participation: card
      ? { status: 'completed', attempts_used: n, best_score: attempts[n - 1].score, best_attempt_id: `p${n - 1}`, demo_runs: 0, display_name: 'Alex', share_code: 'preview' }
      : { status: 'eligible', attempts_used: 0, best_score: 0, demo_runs: 0, display_name: 'Preview', share_code: 'preview' },
    attempts, remaining: Number(f.attempts_allowed), can_play_real: false, real_block_reason: null,
  };
}

function AuditList({ challengeId }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { signupChallengeAdminAPI.audit(challengeId).then((r) => setRows(r.audit)).catch(() => {}); }, [challengeId]);
  return (
    <ul className="space-y-1 text-sm" data-testid="sc-admin-audit">
      {rows.map((r) => <li key={r.audit_id} className="rounded border px-3 py-2">{new Date(r.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })} · <b>{r.action}</b> · {r.admin_email}</li>)}
      {!rows.length && <li className="text-slate-400">No changes recorded yet.</li>}
    </ul>
  );
}

export default function SignupChallengeAdmin() {
  const [list, setList] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [games, setGames] = useState([]);
  const [sel, setSel] = useState(null);
  const [preview, setPreview] = useState(null);
  const [denied, setDenied] = useState(false);
  const load = useCallback(async (pick) => {
    try {
      const r = await signupChallengeAdminAPI.list();
      setList(r.challenges); setEnabled(r.enabled);
      setSel((cur) => r.challenges.find((c) => c.challenge_id === (pick || cur?.challenge_id)) || (pick === 'new' ? null : r.challenges[0] || null));
    } catch (e) { if (e?.response?.status === 403) setDenied(true); else toast.error(errText(e)); }
  }, []);
  useEffect(() => { load(); signupChallengeAdminAPI.games().then((r) => setGames(r.games)).catch(() => {}); }, [load]);

  const toggle = async (v) => { try { setEnabled((await signupChallengeAdminAPI.setEnabled(v)).enabled); toast.success(v ? 'Signup Challenge feature turned ON' : 'Signup Challenge feature turned OFF'); } catch (e) { toast.error(errText(e)); } };
  const status = async (s) => { try { await signupChallengeAdminAPI.setStatus(sel.challenge_id, s); toast.success(`Challenge ${s}`); load(sel.challenge_id); } catch (e) { toast.error(errText(e)); } };

  if (denied) return <p className="p-8 text-slate-500" data-testid="sc-admin-denied">Signup Challenge Management is available to Super Admin only.</p>;
  return (
    <div className="space-y-6 p-4 md:p-8" data-testid="sc-admin-page">
      <header className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100"><Gift className="h-5 w-5 text-violet-700" /></span>
          <div><h1 className="text-2xl font-black">Signup Challenge Management</h1><p className="text-sm text-slate-500">One-time Welcome Challenge shown to new users after verified signup.</p></div></div>
        <label className="ml-auto flex items-center gap-3 rounded-xl border px-4 py-2">
          <Switch checked={enabled} onCheckedChange={toggle} data-testid="sc-admin-feature-toggle" />
          <span className="text-sm font-bold">{enabled ? 'Challenge ON' : 'Challenge OFF'}</span>
        </label>
      </header>

      <div className="flex flex-wrap gap-2" data-testid="sc-admin-list">
        {list.map((c) => (
          <button key={c.challenge_id} type="button" onClick={() => setSel(c)} data-testid={`sc-admin-item-${c.challenge_id}`}
            className={`rounded-xl border px-4 py-2 text-left transition-colors ${sel?.challenge_id === c.challenge_id ? 'border-violet-500 bg-violet-50' : 'bg-white hover:bg-slate-50'}`}>
            <span className="block text-sm font-bold">{c.prize_label} · {c.title}</span>
            <span className="text-xs text-slate-500"><span className={`mr-1 rounded px-1.5 py-0.5 ${BADGE[c.status]}`}>{c.status}</span>{c.participants} players · v{c.version}</span>
          </button>
        ))}
        <Button variant="outline" onClick={() => setSel(null)} data-testid="sc-admin-new"><Plus className="mr-1 h-4 w-4" />New challenge</Button>
      </div>

      {sel && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm">
          <span>Status: <b data-testid="sc-admin-status">{sel.status}</b></span>
          {sel.status !== 'published' && sel.status !== 'archived' && <Button size="sm" onClick={() => status('published')} data-testid="sc-admin-publish"><Rocket className="mr-1 h-4 w-4" />Publish</Button>}
          {sel.status === 'published' && <Button size="sm" variant="outline" onClick={() => status('paused')} data-testid="sc-admin-pause"><Pause className="mr-1 h-4 w-4" />Pause</Button>}
          {sel.status !== 'archived' && <Button size="sm" variant="outline" onClick={() => status('archived')} data-testid="sc-admin-archive"><Archive className="mr-1 h-4 w-4" />Archive</Button>}
          <span className="text-xs text-slate-500">Only one challenge can be published at a time. Players only see it while the feature is ON and the challenge is published.</span>
        </div>
      )}

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings" data-testid="sc-admin-tab-settings">Settings</TabsTrigger>
          {sel && <TabsTrigger value="participants" data-testid="sc-admin-tab-participants">Participants & scores</TabsTrigger>}
          {sel && <TabsTrigger value="analytics" data-testid="sc-admin-tab-analytics">Analytics</TabsTrigger>}
          {sel && <TabsTrigger value="audit" data-testid="sc-admin-tab-audit">Audit history</TabsTrigger>}
        </TabsList>
        <TabsContent value="settings"><ChallengeEditor initial={sel || BLANK} games={games} onSaved={(c) => load(c.challenge_id)} onPreview={(f, g, card) => setPreview({ ...previewState(f, g, card), k: Date.now() })} /></TabsContent>
        {sel && <TabsContent value="participants"><ParticipantsPanel challengeId={sel.challenge_id} /></TabsContent>}
        {sel && <TabsContent value="analytics"><AnalyticsPanel challengeId={sel.challenge_id} /></TabsContent>}
        {sel && <TabsContent value="audit"><AuditList challengeId={sel.challenge_id} /></TabsContent>}
      </Tabs>

      {preview && <SignupChallengeScreen key={preview.k} initial={preview} preview onClose={() => setPreview(null)} />}
    </div>
  );
}
