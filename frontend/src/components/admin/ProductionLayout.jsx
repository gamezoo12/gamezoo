import { useEffect } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { Radio, Boxes, Wrench, LogOut, Sparkles, ShieldCheck, Trophy, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import MeeraChat from '../MeeraChat';

const LINKS = [
  { to: '/production', label: 'Operations', icon: Wrench, end: true },
  { to: '/production/live-draw', label: 'Live Draw', icon: Radio },
  { to: '/production/inventory', label: 'Prize Inventory', icon: Boxes },
  { to: '/production/winners', label: 'Winners feed', icon: Trophy },
  { to: '/production/kyc', label: 'KYC review', icon: Shield },
];

export default function ProductionLayout() {
  const { user, loading, logout } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!user) nav('/admin/login', { replace: true });
    else if (!['admin', 'super_admin', 'operator'].includes(user.role)) nav('/', { replace: true });
  }, [user, loading, nav]);

  if (loading || !user || !['admin', 'super_admin', 'operator'].includes(user.role)) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Checking access…</div>;
  }

  return (
    <div className="min-h-screen flex bg-slate-950">
      <aside className="w-64 bg-slate-900 text-slate-200 hidden md:flex flex-col border-r border-slate-800">
        <Link to="/" className="flex items-center gap-2 p-5 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center text-white"><Sparkles className="w-5 h-5" /></div>
          <div><div className="font-display font-bold text-white">Prize League</div><div className="text-[10px] uppercase tracking-wider text-orange-400">Production Panel</div></div>
        </Link>
        <nav className="flex-1 p-3 space-y-1">
          {LINKS.map(l => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${isActive ? 'bg-orange-500 text-white' : 'hover:bg-slate-800 text-slate-300'}`}>
              <l.icon className="w-4 h-4" /> {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800 space-y-1">
          <Link to="/admin" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800"><ShieldCheck className="w-4 h-4" /> Admin Panel</Link>
          <button
            data-testid="production-logout"
            onClick={async () => { await logout(); window.location.href = '/admin/login'; }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-rose-300 hover:bg-rose-500/10"
          ><LogOut className="w-4 h-4" /> Sign out</button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-slate-900 border-b border-slate-800 px-5 flex items-center justify-between text-slate-200">
          <Link to="/" className="font-display font-semibold hover:text-orange-400">← Prize League Production</Link>
          <div className="flex items-center gap-2 text-xs text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live systems OK</div>
        </header>
        <main className="p-6 flex-1 text-slate-100"><Outlet /></main>
      </div>
      <MeeraChat theme="dark" />
    </div>
  );
}
