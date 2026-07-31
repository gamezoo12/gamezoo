import { useEffect, useRef, useState } from 'react';
import { api, uploadsAPI, API } from '../lib/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { useAuth } from '../context/AuthContext';
import {
  ImagePlus, Crosshair, ShieldAlert, PlayCircle, CheckCircle2, Download,
  Lock, Copy, Eye, EyeOff,
} from 'lucide-react';

// ---------------------------------------------------------------------
// FOCAL POINT PICKER — click on the preview to set focus_x/focus_y (0..1).
// Uploads the file through /api/admin/uploads/contest-image with those coords
// and returns the 5 variant URLs.
// ---------------------------------------------------------------------
export function ContestImageFocalPicker({ initialImage, onUploaded }) {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const previewRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(initialImage || '');
  const [focal, setFocal] = useState({ x: 0.5, y: 0.5 });
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const pickFile = (f) => {
    setFile(f);
    setResult(null);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    }
  };

  const handleClick = (e) => {
    if (!previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setFocal({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
  };

  const upload = async () => {
    if (!file) return toast({ title: 'Select an image first' });
    setUploading(true);
    try {
      const r = await uploadsAPI.contestImage(file, {
        focal_x: focal.x, focal_y: focal.y, alt: '',
      });
      setResult(r);
      toast({ title: 'Image processed', description: `${Object.keys(r.sizes || {}).length} variants generated.` });
      onUploaded?.(r);
    } catch (err) {
      toast({ title: 'Upload failed', description: err?.response?.data?.detail || err.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="focal-picker">
      <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
        <Crosshair className="w-4 h-4 text-indigo-600" />
        <span>Click anywhere on the preview to set the focal point — cropping will keep this point visible on every device size. Use the rule-of-thirds grid to position the subject on an intersection.</span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
        data-testid="focal-file-input"
      />

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          <ImagePlus className="w-4 h-4 mr-1" /> {file ? 'Replace file' : 'Select image'}
        </Button>
        <Button type="button" onClick={upload} disabled={!file || uploading} className="pl-btn-purple text-white">
          {uploading ? 'Processing…' : 'Process & upload'}
        </Button>
        {file && <span className="text-xs text-slate-500 self-center truncate">{file.name}</span>}
      </div>

      {previewUrl && (
        <div className="relative rounded-xl overflow-hidden border border-slate-200 select-none cursor-crosshair" data-testid="focal-preview">
          <img
            ref={previewRef}
            src={previewUrl}
            alt="Preview"
            onClick={handleClick}
            className="w-full max-h-80 object-contain bg-slate-100"
          />
          {/* Rule-of-thirds grid overlay */}
          <div className="pointer-events-none absolute inset-0" data-testid="focal-grid-overlay" aria-hidden="true">
            <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/70 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" />
            <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/70 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" />
            <div className="absolute top-1/3 left-0 right-0 h-px bg-white/70 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" />
            <div className="absolute top-2/3 left-0 right-0 h-px bg-white/70 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" />
            {/* Intersection dots */}
            {[[33.33,33.33],[66.66,33.33],[33.33,66.66],[66.66,66.66]].map(([l,t],i)=>(
              <div key={i} className="absolute w-1.5 h-1.5 -ml-0.5 -mt-0.5 rounded-full bg-white/90 ring-1 ring-black/20" style={{ left: `${l}%`, top: `${t}%` }} />
            ))}
          </div>
          {file && (
            <div
              className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-white shadow-xl bg-indigo-600 flex items-center justify-center pointer-events-none"
              style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
              data-testid="focal-crosshair"
            >
              <Crosshair className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
      )}

      {file && (
        <div className="text-xs text-slate-500 font-mono">
          Focal point: x={focal.x.toFixed(2)} · y={focal.y.toFixed(2)}
        </div>
      )}

      {result && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs">
          <div className="font-bold text-emerald-800 mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> Variants ready
          </div>
          <ul className="grid grid-cols-2 gap-1 text-emerald-900">
            {Object.entries(result.sizes || {}).map(([k, url]) => (
              <li key={k}><span className="font-semibold">{k}:</span> <a href={url} target="_blank" rel="noreferrer" className="underline break-all">{url.split('/').pop()}</a></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// RANDOM DRAW controls (Engine 2)
// ---------------------------------------------------------------------
export function RandomDrawPanel({ contestId }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [numWinners, setNumWinners] = useState(1);
  const [reason, setReason] = useState('');
  const [approver, setApprover] = useState('');
  const [busy, setBusy] = useState(false);
  const [draws, setDraws] = useState([]);
  const [showRedraw, setShowRedraw] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';

  const refresh = () =>
    api.get(`/admin/engines/random-draw/${contestId}`).then(r => setDraws(r.data.draws || [])).catch(() => {});

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [contestId]);

  const runDraw = async () => {
    setBusy(true);
    try {
      const payload = { num_winners: parseInt(numWinners, 10) };
      if (showRedraw) { payload.reason = reason; payload.approver_admin_email = approver; }
      await api.post(`/admin/engines/random-draw/${contestId}`, payload);
      toast({ title: 'Draw executed', description: 'Review the winners below then publish.' });
      refresh();
    } catch (err) {
      toast({ title: 'Draw failed', description: err?.response?.data?.detail || err.message });
    } finally { setBusy(false); }
  };

  const publish = async (drawId) => {
    if (!window.confirm('Publish these winners as the final draw? Contest status will change to "drawn".')) return;
    try {
      await api.post(`/admin/engines/random-draw/${contestId}/confirm/${drawId}`);
      toast({ title: 'Draw published' });
      refresh();
    } catch (err) { toast({ title: 'Failed', description: err?.response?.data?.detail }); }
  };

  if (!isSuperAdmin) {
    return <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-center gap-2"><Lock className="w-4 h-4" /> Random Draw execution is restricted to Super Admin.</div>;
  }

  const hasDraws = draws.length > 0;

  return (
    <div className="space-y-4" data-testid="random-draw-panel">
      <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5" />
        <span>The Random-Draw engine must be enabled in Company Settings after legal review. This UI will return 423 if the flag is OFF.</span>
      </div>

      <div className="grid md:grid-cols-3 gap-2 items-end">
        <div>
          <Label>Number of winners</Label>
          <Input type="number" min={1} value={numWinners} onChange={e => setNumWinners(e.target.value)} data-testid="draw-num-winners" />
        </div>
        {showRedraw && (
          <>
            <div>
              <Label>Reason for redraw</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} data-testid="draw-reason" />
            </div>
            <div>
              <Label>Second Super Admin (approver email)</Label>
              <Input value={approver} onChange={e => setApprover(e.target.value)} data-testid="draw-approver" />
            </div>
          </>
        )}
        <Button onClick={runDraw} disabled={busy} className="pl-btn-purple text-white" data-testid="draw-run-btn">
          <PlayCircle className="w-4 h-4 mr-1" /> {busy ? 'Drawing…' : (hasDraws ? 'Run REDRAW' : 'Run draw')}
        </Button>
        {hasDraws && !showRedraw && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" onChange={e => setShowRedraw(e.target.checked)} className="w-4 h-4" data-testid="draw-redraw-toggle" />
            I need to run a REDRAW (requires reason + second Super Admin)
          </label>
        )}
      </div>

      {hasDraws && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
            Draw history ({draws.length})
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {draws.map(d => (
              <li key={d.draw_id} className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{d.draw_id}</span>
                  {d.is_redraw && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">REDRAW</span>}
                  {d.confirmed
                    ? <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">PUBLISHED</span>
                    : <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">DRAFT</span>}
                  <span className="text-xs text-slate-500 ml-auto">{new Date(d.executed_at).toLocaleString('en-GB')}</span>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  <div><strong>Winners:</strong> #{d.winning_ticket_numbers.join(', #')}</div>
                  <div className="font-mono truncate"><strong>Pool hash:</strong> {d.pool_hash_sha256}</div>
                  <div><strong>Pool size:</strong> {d.pool_size} · Algorithm: {d.algorithm_version}</div>
                </div>
                <div className="flex gap-2 mt-2">
                  {!d.confirmed && <Button size="sm" onClick={() => publish(d.draw_id)} className="bg-emerald-600 hover:bg-emerald-700" data-testid={`draw-publish-${d.draw_id}`}>Publish</Button>}
                  <a
                    href={`${API}/admin/engines/random-draw/${contestId}/report/${d.draw_id}`}
                    target="_blank"
                    rel="noreferrer"
                    data-testid={`draw-download-${d.draw_id}`}
                  >
                    <Button size="sm" variant="outline"><Download className="w-3 h-3 mr-1" /> Download report</Button>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// INSTANT WIN composer (Engine 3) — CSV in, config-hash out
// ---------------------------------------------------------------------
export function InstantWinComposer({ contestId }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [csv, setCsv] = useState('ticket_number,rank,amount,description\n5,1,500,First Prize\n99,2,250,Second Prize\n68,3,100,Third Prize');
  const [preview, setPreview] = useState([]);
  const [previewVisible, setPreviewVisible] = useState(true);
  const [committed, setCommitted] = useState(null);
  const [busy, setBusy] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';

  const parseCsv = () => {
    const rows = csv.split('\n').map(l => l.trim()).filter(Boolean);
    if (!rows.length) return [];
    const header = rows[0].toLowerCase().split(',').map(s => s.trim());
    const idx = {
      ticket_number: header.indexOf('ticket_number'),
      rank: header.indexOf('rank'),
      amount: header.indexOf('amount'),
      description: header.indexOf('description'),
    };
    if (idx.ticket_number < 0 || idx.amount < 0) return [];
    return rows.slice(1).map(r => {
      const cells = r.split(',').map(s => s.trim());
      return {
        ticket_number: parseInt(cells[idx.ticket_number], 10),
        rank: idx.rank >= 0 ? parseInt(cells[idx.rank], 10) : null,
        amount: parseFloat(cells[idx.amount]),
        description: idx.description >= 0 ? cells[idx.description] : '',
      };
    }).filter(p => Number.isFinite(p.ticket_number) && Number.isFinite(p.amount));
  };

  useEffect(() => { setPreview(parseCsv()); /* eslint-disable-next-line */ }, [csv]);

  const commit = async () => {
    if (!preview.length) return toast({ title: 'CSV empty or invalid' });
    if (!window.confirm(`Commit ${preview.length} winning tickets? This locks BEFORE any ticket sales — cannot be modified after.`)) return;
    setBusy(true);
    try {
      const r = await api.post(`/admin/engines/instant-win/${contestId}/commit`, { prizes: preview });
      setCommitted(r.data);
      // For security, clear the CSV so nobody looking at the admin's screen can see winners
      setCsv('');
      setPreview([]);
      toast({ title: 'Committed', description: 'Winning tickets encrypted. The plain map is no longer accessible.' });
    } catch (err) {
      toast({ title: 'Failed', description: err?.response?.data?.detail });
    } finally { setBusy(false); }
  };

  const copyHash = async () => {
    if (!committed?.config_hash) return;
    try { await navigator.clipboard.writeText(committed.config_hash); toast({ title: 'Hash copied' }); }
    catch { toast({ title: 'Copy failed' }); }
  };

  if (!isSuperAdmin) {
    return <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-center gap-2"><Lock className="w-4 h-4" /> Instant-win commit is restricted to Super Admin.</div>;
  }

  return (
    <div className="space-y-3" data-testid="instant-win-composer">
      <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5" />
        <span>
          The Instant-Win engine must be enabled in Company Settings after legal review. Winning
          tickets are encrypted server-side the moment you commit — nobody, including admins,
          can read them afterwards. This must be done <strong>before any tickets are sold</strong>.
        </span>
      </div>

      {committed ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-700" />
            <h4 className="font-display font-bold text-emerald-900">Configuration committed &amp; locked</h4>
          </div>
          <div className="text-sm text-emerald-900 mb-1">
            <strong>Winning tickets committed:</strong> {committed.num_winning_tickets}
          </div>
          <div className="text-xs text-emerald-900 font-mono break-all bg-white rounded p-2 mt-2 flex items-start gap-2">
            <div className="flex-1"><strong>Config hash (SHA-256):</strong><br />{committed.config_hash}</div>
            <Button variant="outline" size="sm" onClick={copyHash} data-testid="iw-copy-hash"><Copy className="w-3 h-3" /></Button>
          </div>
          <p className="text-[11px] text-emerald-800 mt-2">Publish this hash externally (e.g. Twitter or a legal notice) to prove the winners list was pre-committed and not manipulated during the contest.</p>
        </div>
      ) : (
        <>
          <Label>Winning tickets CSV (columns: ticket_number, rank, amount, description)</Label>
          <textarea
            value={csv}
            onChange={e => setCsv(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-slate-200 font-mono text-xs p-2"
            data-testid="iw-csv"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Parsed {preview.length} rows</span>
            <Button size="sm" variant="ghost" onClick={() => setPreviewVisible(!previewVisible)}>
              {previewVisible ? <><EyeOff className="w-3 h-3 mr-1" /> Hide preview</> : <><Eye className="w-3 h-3 mr-1" /> Show preview</>}
            </Button>
          </div>
          {previewVisible && preview.length > 0 && (
            <table className="w-full text-xs border border-slate-100 rounded-lg overflow-hidden">
              <thead className="bg-slate-50">
                <tr><th className="p-2 text-left">Ticket</th><th className="p-2 text-left">Rank</th><th className="p-2 text-left">Amount</th><th className="p-2 text-left">Description</th></tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="p-2 font-mono">#{p.ticket_number}</td>
                    <td className="p-2">{p.rank || '—'}</td>
                    <td className="p-2">£{p.amount.toFixed(2)}</td>
                    <td className="p-2">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Button onClick={commit} disabled={busy || !preview.length} className="bg-red-600 hover:bg-red-700 text-white" data-testid="iw-commit-btn">
            <Lock className="w-4 h-4 mr-1" /> {busy ? 'Committing…' : 'Commit & Lock (irreversible)'}
          </Button>
        </>
      )}
    </div>
  );
}
