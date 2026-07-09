import { useEffect } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Package, ShoppingBag, Trophy, BarChart3, LogOut, Sparkles, Shield, CreditCard, Settings as SettingsIcon, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import MeeraChat from '../MeeraChat';

const LINKS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/roles', label: 'Roles & Permissions', icon: ShieldCheck },
  { to: '/admin/kyc', label: 'KYC', icon: Shield },
  { to: '/admin/competitions', label: 'Contests', icon: Package },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/winners', label: 'Winners', icon: Trophy },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
];

export default function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) nav('/admin/login', { replace: true });
    else if (!['admin', 'super_admin', 'operator', 'support'].includes(user.role)) nav('/', { replace: true });
  }, [user, loading, nav]);

  if (loading || !user || !['admin', 'super_admin', 'operator', 'support'].includes(user.role)) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Checking access…</div>;
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 bg-slate-900 text-slate-200 hidden md:flex flex-col">
        <Link to="/" className="flex items-center gap-2 p-5 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white"><Sparkles className="w-5 h-5" /></div>
          <div>
            <div className="font-display font-bold text-white">Prize League</div>
            <div className="text-[10px] uppercase tracking-wider text-teal-400">Admin Panel</div>
          </div>
        </Link>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {LINKS.map(l => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive ? 'bg-teal-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}>
              <l.icon className="w-4 h-4" /> {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800">
          <Link to="/production" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800"><Package className="w-4 h-4" /> Production Panel</Link>
          <button
            data-testid="admin-logout"
            onClick={async () => { await logout(); window.location.href = '/admin/login'; }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-rose-300 hover:bg-rose-500/10"
          ><LogOut className="w-4 h-4" /> Sign out</button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 px-5 flex items-center justify-between">
          <Link to="/" className="font-display font-semibold text-slate-900 hover:text-teal-600">← Prize League Admin</Link>
          <div className="flex items-center gap-3"><div className="text-sm text-slate-600">{user.email}</div><div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold">{user.name?.slice(0,2).toUpperCase() || 'AD'}</div></div>
        </header>
        <main className="p-6 flex-1"><Outlet /></main>
      </div>
      <MeeraChat theme="light" />
    </div>
  );
}
