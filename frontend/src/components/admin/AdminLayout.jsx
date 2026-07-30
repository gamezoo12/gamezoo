import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Package, ShoppingBag, Trophy, BarChart3, LogOut, Shield, CreditCard, Settings as SettingsIcon, ShieldCheck, Wallet as WalletIcon, Gamepad2, Menu, X, ClipboardList, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import PrizeLeagueLogo from '../layout/PrizeLeagueLogo';
import MeeraChat from '../MeeraChat';

const LINKS = [
 { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
 { to: '/admin/users', label: 'Users', icon: Users },
 { to: '/admin/roles', label: 'Roles & Permissions', icon: ShieldCheck },
 { to: '/admin/kyc', label: 'KYC', icon: Shield },
 { to: '/admin/competitions', label: 'Contests', icon: Package },
 { to: '/admin/games', label: 'Games', icon: Gamepad2 },
 { to: '/admin/wallets', label: 'Wallets', icon: WalletIcon },
 { to: '/admin/orders', label: 'Orders', icon: ShoppingBag },
 { to: '/admin/payments', label: 'Payments', icon: CreditCard },
 { to: '/admin/winners', label: 'Winners', icon: Trophy },
 { to: '/admin/winner-selection', label: 'Winner Selection', icon: Trophy },
 { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
 { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
 { to: '/admin/audit-logs', label: 'Audit logs', icon: ClipboardList },
 { to: '/admin/legal', label: 'Legal Docs', icon: FileText },
];

/**
 * Prize League — premium admin layout.
 * Palette matches the public site: dark #0B0D1F sidebar, purple hover, gold active accent, gold-gradient logo.
 */
export default function AdminLayout() {
 const { user, loading, logout } = useAuth();
 const [open, setOpen] = useState(false);
 const nav = useNavigate();

 useEffect(() => {
 if (loading) return;
 if (!user) nav('/admin/login', { replace: true });
 else if (!['admin', 'super_admin', 'operator', 'support'].includes(user.role)) nav('/', { replace: true });
 }, [user, loading, nav]);

 useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);

 if (loading || !user || !['admin', 'super_admin', 'operator', 'support'].includes(user.role)) {
 return <div className="min-h-screen flex items-center justify-center text-slate-500" style={{ background: '#0B0D1F' }}>Checking access…</div>;
 }

 const Sidebar = ({ onNav }) => (
 <>
 <Link to="/" className="flex items-center gap-2 p-5 border-b border-white/10" onClick={onNav}>
 <PrizeLeagueLogo size={40} />
 </Link>
 <div className="px-5 pt-4 pb-2 text-[10px] uppercase tracking-widest text-[#FFD54A]/70 font-bold">Admin Panel</div>
 <nav className="flex-1 p-3 space-y-1 overflow-y-auto" onClick={onNav}>
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
 <Link to="/production" className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white"><Package className="w-4 h-4" /> Production Panel</Link>
 <button
 data-testid="admin-logout"
 onClick={async () => { await logout(); window.location.href = '/admin/login'; }}
 className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-rose-300 hover:bg-rose-500/10"
 ><LogOut className="w-4 h-4" /> Sign out</button>
 </div>
 </>
 );

 return (
 <div className="min-h-screen flex bg-slate-50" data-testid="admin-layout">
 {/* Desktop sidebar */}
 <aside className="w-64 hidden md:flex flex-col shrink-0" style={{ background: 'linear-gradient(180deg, #0B0D1F 0%, #161433 100%)' }}>
 <Sidebar />
 </aside>

 {/* Mobile drawer */}
 {open && (
 <div className="fixed inset-0 z-50 md:hidden">
 <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
 <aside className="absolute left-0 top-0 h-full w-72 flex flex-col" style={{ background: 'linear-gradient(180deg, #0B0D1F 0%, #161433 100%)' }}>
 <div className="flex items-center justify-between p-4 border-b border-white/10">
 <PrizeLeagueLogo size={34} />
 <button onClick={() => setOpen(false)} className="p-2 text-white"><X className="w-5 h-5" /></button>
 </div>
 <Sidebar onNav={() => setOpen(false)} />
 </aside>
 </div>
 )}

 <div className="flex-1 flex flex-col min-w-0">
 <header className="h-14 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <button className="md:hidden text-slate-700" onClick={() => setOpen(true)} aria-label="Menu"><Menu className="w-5 h-5" /></button>
 <Link to="/" className="font-display font-bold text-slate-900 hover:text-[#6C2BFF] text-sm">← Prize League</Link>
 </div>
 <div className="flex items-center gap-3">
 <div className="text-sm text-slate-600 hidden sm:block">{user.email}</div>
 <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8B5CFF] to-[#6C2BFF] text-white flex items-center justify-center text-xs font-bold">
 {user.name?.slice(0, 2).toUpperCase() || user.email?.slice(0, 2).toUpperCase() || 'AD'}
 </div>
 </div>
 </header>
 <main className="p-4 md:p-6 flex-1"><Outlet /></main>
 </div>

 <MeeraChat theme="light" />
 </div>
 );
}
