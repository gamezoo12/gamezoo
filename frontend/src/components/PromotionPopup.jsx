import { useEffect, useState } from 'react';
import { X, Ticket, Users } from 'lucide-react';
import { promotionAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function PromotionPopup() {
  const { user } = useAuth();
  const [cfg,setCfg]=useState(null); const [open,setOpen]=useState(false); const [busy,setBusy]=useState(false); const [joined,setJoined]=useState(false); const [count,setCount]=useState(0);
  useEffect(()=>{ promotionAPI.config().then(c=>{setCfg(c); if(c?.is_live && sessionStorage.getItem(`promo_seen_${c.promotion_id}`)!=='1') setOpen(true);}).catch(()=>{}); },[]);
  if(!cfg?.is_live || !open) return null;
  const close=()=>{sessionStorage.setItem(`promo_seen_${cfg.promotion_id}`,'1');setOpen(false)};
  const join=async()=>{ if(!user){ window.location.href='/login'; return; } setBusy(true); try{const r=await promotionAPI.join();setJoined(true);setCount(r.ticket_count||1);}finally{setBusy(false);} };
  return <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
    <div className="relative w-[80vw] max-w-5xl max-h-[90vh] overflow-auto rounded-3xl bg-[#0B0D1F] text-white shadow-2xl border border-white/10">
      <button onClick={close} className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-2 hover:bg-black/70" aria-label="Close promotion"><X className="w-5 h-5"/></button>
      {(cfg.mobile_image_url||cfg.tablet_image_url||cfg.desktop_image_url) && <picture><source media="(min-width:1024px)" srcSet={cfg.desktop_image_url||cfg.tablet_image_url||cfg.mobile_image_url}/><source media="(min-width:640px)" srcSet={cfg.tablet_image_url||cfg.desktop_image_url||cfg.mobile_image_url}/><img src={cfg.mobile_image_url||cfg.tablet_image_url||cfg.desktop_image_url} alt={cfg.name} className="w-full max-h-[52vh] object-cover"/></picture>}
      <div className="p-5 sm:p-8 text-center">
        <div className="text-xs uppercase tracking-[.25em] text-[#FFD54A] font-bold">Free World Special Promotion</div>
        <h2 className="mt-2 text-2xl sm:text-4xl font-black">Win £{Number(cfg.prize_total_gbp||1000).toLocaleString()}</h2>
        <p className="mt-2 text-white/70">{cfg.winner_count} winners · £{Number(cfg.prize_per_winner_gbp||500).toLocaleString()} each</p>
        <div className="mt-5 grid sm:grid-cols-2 gap-3 text-left"><div className="rounded-2xl bg-white/5 p-4 flex gap-3"><Ticket className="text-[#FFD54A]"/><span>Join once and receive your promotion ticket.</span></div><div className="rounded-2xl bg-white/5 p-4 flex gap-3"><Users className="text-[#FFD54A]"/><span>Each referred friend who joins gives you another ticket.</span></div></div>
        {joined ? <div className="mt-6 rounded-xl bg-emerald-500/15 border border-emerald-400/30 p-4 font-bold">You’re in! You currently have {count} promotion ticket{count===1?'':'s'}.</div> : <button onClick={join} disabled={busy} className="mt-6 w-full sm:w-auto px-10 py-4 rounded-xl bg-gradient-to-r from-[#FFD54A] to-[#FFB300] text-[#0B0D1F] font-black text-lg disabled:opacity-50">{busy?'Joining…':'Join Contest'}</button>}
      </div>
    </div>
  </div>;
}
