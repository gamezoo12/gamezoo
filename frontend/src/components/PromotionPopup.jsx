import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const visitorId=()=>{let id=localStorage.getItem('fw_promo_visitor');if(!id){id=(crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`);localStorage.setItem('fw_promo_visitor',id)}return id};
const device=()=>window.innerWidth<640?'mobile':window.innerWidth<1024?'tablet':'desktop';
const event=(name)=>{const u=new URL(window.location.href);return api.post('/promotion/event',{event:name,visitor_id:visitorId(),page:u.pathname,device:device(),source:u.searchParams.get('utm_source'),medium:u.searchParams.get('utm_medium'),campaign:u.searchParams.get('utm_campaign'),referrer:document.referrer||null}).catch(()=>{})};

export default function PromotionPopup(){
 const {user}=useAuth();const[cfg,setCfg]=useState(null);const[open,setOpen]=useState(false);
 useEffect(()=>{api.get('/promotion/config').then(r=>{const c=r.data;setCfg(c);if(c?.is_live&&sessionStorage.getItem(`promo_seen_${c.promotion_id}`)!=='1'){setOpen(true);event('impression')}}).catch(()=>{})},[]);
 if(!cfg?.is_live||!open)return null;
 const close=()=>{event('close');sessionStorage.setItem(`promo_seen_${cfg.promotion_id}`,'1');setOpen(false)};
 const join=()=>{event('join_click');sessionStorage.setItem('fw_promo_intent','join');sessionStorage.setItem(`promo_seen_${cfg.promotion_id}`,'1');window.location.href=user?'/my-account/promotions':'/login?promo=join'};
 const refer=()=>{event('refer_click');sessionStorage.setItem('fw_promo_intent','refer');sessionStorage.setItem(`promo_seen_${cfg.promotion_id}`,'1');window.location.href=user?'/refer':'/login?promo=refer'};
 const img=cfg.mobile_image_url||cfg.tablet_image_url||cfg.desktop_image_url;
 return <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
  <div className="relative w-[92vw] sm:w-[85vw] lg:w-[80vw] max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl bg-[#0B0D1F] shadow-2xl border border-white/10">
   <button onClick={close} className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white" aria-label="Close promotion"><X className="w-5 h-5"/></button>
   <div className="h-[60vh] max-h-[60vh] bg-black/20">{img?<picture><source media="(min-width:1024px)" srcSet={cfg.desktop_image_url||img}/><source media="(min-width:640px)" srcSet={cfg.tablet_image_url||img}/><img src={img} alt={cfg.name||'Promotion'} className="w-full h-full object-cover"/></picture>:<div className="w-full h-full flex items-center justify-center text-white/40 text-center px-6">Promotion artwork will appear here</div>}</div>
   <div className="min-h-[16vh] p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center bg-[#0B0D1F]">
    <button onClick={join} className="w-full py-4 rounded-xl bg-gradient-to-r from-[#FFD54A] to-[#FFB300] text-[#0B0D1F] font-black text-base sm:text-lg">JOIN CONTEST</button>
    <button onClick={refer} className="w-full py-4 rounded-xl border-2 border-[#FFD54A] text-[#FFD54A] font-black text-base sm:text-lg">REFER A FRIEND</button>
   </div>
  </div>
 </div>;
}
