import { useEffect, useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { practiceAPI } from '../../../lib/api';
import { resolveMediaUrl } from '../../../lib/media';

const COUNT_KEY = 'pl-practice-level-starts';

// Decides whether this level start should show an ad (every N level starts, per browser session).
export async function adForThisStart() {
  try {
    const cfg = await practiceAPI.nextAd();
    if (!cfg.enabled || (!cfg.ad && !cfg.adsense)) return null;
    const n = Number(sessionStorage.getItem(COUNT_KEY) || 0) + 1;
    sessionStorage.setItem(COUNT_KEY, String(n));
    return n % Math.max(1, cfg.every_n_levels) === 0 ? cfg : null;
  } catch { return null; }
}

function AdSenseUnit({ client, slot }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!document.querySelector(`script[data-adsense="${client}"]`)) {
      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.dataset.adsense = client;
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      document.head.appendChild(s);
    }
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* ad blocked */ }
  }, [client]);
  return <ins ref={ref} className="adsbygoogle block min-h-[250px] w-full" data-ad-client={client} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" data-testid="practice-ad-adsense" />;
}

// Full-screen ad before a level; the player can skip after a short countdown.
export function AdInterstitial({ cfg, onDone }) {
  const [left, setLeft] = useState(cfg.skip_after_s);
  const ad = cfg.adsense ? null : cfg.ad;
  useEffect(() => { if (ad) practiceAPI.adEvent(ad.ad_id, 'impression'); }, [ad]);
  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const click = () => {
    practiceAPI.adEvent(ad.ad_id, 'click');
    if (ad.click_url) window.open(ad.click_url, ad.click_url.startsWith('/') ? '_self' : '_blank', 'noopener');
  };
  return (
    <div className="fixed inset-0 z-[2147483000] flex flex-col bg-black/95 p-3 sm:p-6" data-testid="practice-ad">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span className="rounded bg-white/10 px-2 py-0.5 font-black uppercase tracking-widest">Ad</span>
        <button type="button" disabled={left > 0} onClick={onDone} className="inline-flex h-9 items-center gap-1 rounded-full bg-white/15 px-4 text-sm font-black text-white disabled:opacity-60" data-testid="practice-ad-skip">
          {left > 0 ? `Skip in ${left}` : <>Skip ad<X className="h-4 w-4" /></>}
        </button>
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4">
        {cfg.adsense ? <AdSenseUnit client={cfg.adsense.client} slot={cfg.adsense.slot} /> : (
          <>
            <button type="button" onClick={click} className="block w-full overflow-hidden rounded-2xl" data-testid="practice-ad-media">
              {ad.media_type === 'video'
                ? <video src={resolveMediaUrl(ad.media_url)} autoPlay muted playsInline loop className="max-h-[65vh] w-full bg-black object-contain" />
                : <img src={resolveMediaUrl(ad.media_url)} alt={ad.title} className="max-h-[65vh] w-full object-contain" />}
            </button>
            <div className="text-center font-display text-xl font-black text-white" data-testid="practice-ad-title">{ad.title}</div>
            {ad.click_url && <button type="button" onClick={click} className="inline-flex h-11 items-center gap-2 rounded-full bg-amber-400 px-6 font-black text-slate-900" data-testid="practice-ad-cta">{ad.cta || 'Learn more'}<ExternalLink className="h-4 w-4" /></button>}
          </>
        )}
      </div>
    </div>
  );
}
