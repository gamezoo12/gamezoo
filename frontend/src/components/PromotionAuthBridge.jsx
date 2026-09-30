import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
export default function PromotionAuthBridge(){const{user}=useAuth();useEffect(()=>{if(!user||sessionStorage.getItem('fw_promo_signup_started')!=='1')return;sessionStorage.removeItem('fw_promo_signup_started');const u=new URL(window.location.href);api.post('/promotion/event',{event:'signup_complete',visitor_id:localStorage.getItem('fw_promo_visitor'),page:u.pathname,device:window.innerWidth<640?'mobile':window.innerWidth<1024?'tablet':'desktop',source:u.searchParams.get('utm_source'),medium:u.searchParams.get('utm_medium'),campaign:u.searchParams.get('utm_campaign'),referrer:document.referrer||null}).catch(()=>{})},[user]);return null}
