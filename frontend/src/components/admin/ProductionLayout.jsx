import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { Radio, Boxes, Wrench, LogOut, ShieldCheck, Trophy, Shield, Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import PrizeLeagueLogo from '../layout/PrizeLeagueLogo';
import MeeraChat from '../MeeraChat';

const LINKS = [
 { to: '/production', label: 'Operations', icon: Wrench, end: true },
 { to: '/production/live-draw', label: 'Live Draw', icon: Radio },
 { to: '/production/inventory', label: 'Prize Inventory', icon: Boxes },
 { to: '/production/winners', label: 'Winners feed', icon: Trophy },
 { to: '/production/kyc', label: 'KYC review', icon: Shield },
];

/**
 * Prize League — premium production layout.
 * Same palette as public/admin: dark base, purple gradient active, gold accent header dot.
 */
export default function ProductionLayout() {
 const { user, loading, logout } = useAuth();
 const [open, setOpen] = useState(false);
 const nav = useNavigate();

 useEffect(() => {
 if (loading) return;
 if (!user) nav('/admin/login', { replace: true });
 else if (!['admin', 'super_admin', 'operator'].includes(user.role)) nav('/', { replace: true });
 }, [user, loading, nav]);

 useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);

 if (loading || !user || !['admin', 'super_admin', 'operator'].includes(user.role)) {
 return <div className="min-h-screen flex items-center justify-center text-slate-400" style={{ background: '#0B0D1F' }}>Checking access…</div>;
 }

 const Sidebar = ({ onNav }) => (
 <>
 <Link to="/" className="flex items-center gap-2 p-5 border-b border-white/10" onClick={onNav}>
 <PrizeLeagueLogo size={40} />
 </Link>
 <div className="px-5 pt-4 pb-2 text-[10px] uppercase tracking-widest text-[#FFD54A]/70 font-bold">Production Panel</div>
 <nav className="flex-1 p-3 space-y-1" onClick={onNav}>
 {LINKS.map(l => (
 <NavLink
 key={l.to}
 to={l.to}
 end={l.end}
 className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${isActive ? 'bg-gradient-to-r from-[#8B5CFF] to-[#6C2BFF] text-white shadow-lg shadow-[#6C2BFF]/30' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
 >
 <l.icon className="w-4 h-4" /> {l.label}
 </NavLink>
 ))}
 </nav>
 <div className="p-3 border-t border-white/10 space-y-1" onClick={onNav}>
 <Link to="/admin" className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white"><ShieldCheck className="w-4 h-4" /> Admin Panel</Link>
 <button
 data-testid="production-logout"
 onClick={async () => { await logout(); window.location.href = '/admin/login'; }}
 className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-rose-300 hover:bg-rose-500/10"
 ><LogOut className="w-4 h-4" /> Sign out</button>
 </div>
 </>
 );

 return (
 <div className="min-h-screen flex" style={{ background: '#0B0D1F' }} data-testid="production-layout">
 <aside className="w-64 hidden md:flex flex-col border-r border-white/10 shrink-0" style={{ background: 'linear-gradient(180deg, #0B0D1F 0%, #161433 100%)' }}>
 <Sidebar />
 </aside>

 {open && (
 <div className="fixed inset-0 z-50 md:hidden">
 <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
 <aside className="absolute left-0 top-0 h-full w-72 flex flex-col border-r border-white/10" style={{ background: 'linear-gradient(180deg, #0B0D1F 0%, #161433 100%)' }}>
 <div className="flex items-center justify-between p-4 border-b border-white/10">
 <PrizeLeagueLogo size={34} />
 <button onClick={() => setOpen(false)} className="p-2 text-white"><X className="w-5 h-5" /></button>
 </div>
 <Sidebar onNav={() => setOpen(false)} />
 </aside>
 </div>
 )}

 <div className="flex-1 flex flex-col min-w-0">
 <header className="h-14 border-b border-white/10 px-4 md:px-6 flex items-center justify-between text-white" style={{ background: 'linear-gradient(180deg, #0B0D1F 0%, #161433 100%)' }}>
 <div className="flex items-center gap-3">
 <button className="md:hidden text-white" onClick={() => setOpen(true)} aria-label="Menu"><Menu className="w-5 h-5" /></button>
 <Link to="/" className="font-display font-bold hover:text-[#FFD54A] text-sm">← Prize League</Link>
 </div>
 <div className="flex items-center gap-2 text-xs text-emerald-400">
 <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live systems OK
 </div>
 </header>
 <main className="p-4 md:p-6 flex-1 text-slate-100"><Outlet /></main>
 </div>

 <MeeraChat theme="dark" />
 </div>
 );
}
