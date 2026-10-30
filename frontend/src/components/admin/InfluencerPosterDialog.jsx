import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Copy, Download, Eye, MessageCircle, QrCode, Share2, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { BRAND as brand } from '../../lib/brand';

const W = 1080;
const H = 1350;
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const isDrawable = (el) => el instanceof HTMLCanvasElement && el.width > 0 && el.height > 0;

const loadImg = (src) => new Promise((ok) => {
  const i = new Image();
  let t;
  const done = (v) => { clearTimeout(t); ok(v); };
  t = setTimeout(() => done(null), 5000);
  i.onload = () => done(i.naturalWidth > 0 ? i : null);
  i.onerror = () => done(null);
  i.src = src;
});

async function waitForQr(holder) {
  for (let i = 0; i < 60; i += 1) {
    const el = holder.current?.querySelector('canvas');
    if (isDrawable(el)) {
      const copy = document.createElement('canvas');
      copy.width = el.width; copy.height = el.height;
      copy.getContext('2d').drawImage(el, 0, 0);
      return copy;
    }
    await frame();
  }
  throw new Error('QR code is not ready yet, please try again');
}

function box(g, x, y, w, h, r) {
  g.beginPath();
  if (typeof g.roundRect === 'function') g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
  g.fill();
}

async function drawPoster(qrCanvas, code) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b0730'); bg.addColorStop(0.55, '#2a1170'); bg.addColorStop(1, '#0b0730');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, 640, 60, W / 2, 640, 620);
  glow.addColorStop(0, 'rgba(250,204,21,0.25)'); glow.addColorStop(1, 'rgba(250,204,21,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  const logo = await loadImg(brand.logoUrl);
  if (logo) { try { g.drawImage(logo, W / 2 - 60, 60, 120, 120 / brand.logoAspect); } catch { /* poster still renders without the logo */ } }
  g.textAlign = 'center';
  g.fillStyle = '#fde68a'; g.font = '800 64px Poppins, sans-serif'; g.fillText('PRIZE LEAGUE', W / 2, 270);
  g.fillStyle = '#ffffff'; g.font = '900 104px Poppins, sans-serif'; g.fillText('SCAN & JOIN', W / 2, 400);
  const size = 560; const x = (W - size) / 2; const y = 450; const pad = 36;
  g.fillStyle = '#facc15'; box(g, x - pad - 8, y - pad - 8, size + 2 * pad + 16, size + 2 * pad + 16, 44);
  g.fillStyle = '#ffffff'; box(g, x - pad, y - pad, size + 2 * pad, size + 2 * pad, 36);
  g.imageSmoothingEnabled = false;
  g.drawImage(qrCanvas, x, y, size, size);
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = '600 36px Inter, sans-serif'; g.fillText('Use promo code', W / 2, 1150);
  g.fillStyle = '#facc15'; g.font = '900 88px Poppins, sans-serif'; g.fillText(code, W / 2, 1245);
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '500 26px Inter, sans-serif'; g.fillText('prizeleague.co.uk · 18+ · T&Cs apply', W / 2, 1310);
  const blob = await new Promise((ok) => c.toBlob((b) => ok(b), 'image/png'));
  if (!blob) throw new Error('Could not export the poster image');
  return blob;
}

export function InfluencerPosterDialog({ promo, link, onClose, notify }) {
  const qrHolder = useRef(null);
  const busyRef = useRef(false);
  const [poster, setPoster] = useState(null);
  const [preview, setPreview] = useState(false);
  const [state, setState] = useState('idle');
  const url = useMemo(() => (poster ? URL.createObjectURL(poster) : ''), [poster]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const file = () => new File([poster], `prize-league-${promo.code}.png`, { type: 'image/png' });
  const generate = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true; setState('working');
    try { setPoster(await drawPoster(await waitForQr(qrHolder), promo.code)); setState('ready'); }
    catch (e) { setState('error'); notify(`Poster could not be generated: ${e?.message || 'unknown error'}`); }
    finally { busyRef.current = false; }
  }, [promo.code, notify]);
  useEffect(() => { generate(); }, [generate]);
  const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); notify(`${label} copied`); } catch { notify(`Could not copy ${label.toLowerCase()}`); } };
  const download = () => { if (!url) return; const a = document.createElement('a'); a.href = url; a.download = file().name; document.body.appendChild(a); a.click(); a.remove(); };
  const share = async () => {
    const text = `Join Prize League with my code ${promo.code}: ${link}`;
    try {
      if (poster && navigator.canShare?.({ files: [file()] })) await navigator.share({ files: [file()], title: 'Prize League', text });
      else if (navigator.share) await navigator.share({ title: 'Prize League', text, url: link });
      else await copy(link, 'Link');
    } catch (e) { if (e?.name !== 'AbortError') notify('Sharing is not available on this device'); }
  };
  const whatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(`Join Prize League with my code ${promo.code} 👉 ${link}`)}`, '_blank', 'noopener');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto" data-testid="influencer-poster-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" />QR code & poster · {promo.code}</DialogTitle></DialogHeader>
        <div className="flex items-center gap-4">
          <div ref={qrHolder} className="rounded-lg bg-white p-2 ring-1 ring-slate-200" data-testid="influencer-qr"><QRCodeCanvas value={link} size={600} level="H" marginSize={2} style={{ width: 120, height: 120 }} /></div>
          <div className="min-w-0 text-xs"><div className="font-semibold text-slate-900">Opens signup with {promo.code} applied</div><div className="mt-1 break-all text-slate-500" data-testid="influencer-qr-link">{link}</div></div>
        </div>
        {state === 'error' && <p className="text-xs text-rose-600" role="alert" data-testid="poster-error">The poster couldn't be generated. Press Generate Poster to try again.</p>}
        {preview && url && <img src={url} alt={`Poster for ${promo.code}`} className="w-full rounded-xl ring-1 ring-slate-200" data-testid="influencer-poster-preview" />}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Button variant="outline" onClick={generate} disabled={state === 'working'} data-testid="poster-generate"><Sparkles className="mr-1 h-4 w-4" />{state === 'working' ? 'Generating…' : 'Generate Poster'}</Button>
          <Button variant="outline" disabled={!poster} onClick={() => setPreview((p) => !p)} data-testid="poster-preview"><Eye className="mr-1 h-4 w-4" />{preview ? 'Hide' : 'Preview'}</Button>
          <Button disabled={!poster} onClick={download} data-testid="poster-download"><Download className="mr-1 h-4 w-4" />Download PNG</Button>
          <Button variant="outline" disabled={!poster} onClick={share} data-testid="poster-share"><Share2 className="mr-1 h-4 w-4" />Share</Button>
          <Button variant="outline" onClick={whatsapp} className="text-emerald-700" data-testid="poster-whatsapp"><MessageCircle className="mr-1 h-4 w-4" />WhatsApp</Button>
          <Button variant="outline" onClick={() => copy(link, 'Link')} data-testid="poster-copy-link"><Copy className="mr-1 h-4 w-4" />Copy Link</Button>
          <Button variant="outline" onClick={() => copy(promo.code, 'Promo code')} className="col-span-2 sm:col-span-3" data-testid="poster-copy-code"><Copy className="mr-1 h-4 w-4" />Copy Promo Code</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
