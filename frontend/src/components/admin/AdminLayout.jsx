import { NavLink, Outlet, Link } from 'react-router-dom';
import { LayoutDashboard, Users, Package, ShoppingBag, Trophy, BarChart3, LogOut, Sparkles } from 'lucide-react';

const LINKS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/competitions', label: 'Competitions', icon: Package },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/admin/winners', label: 'Winners', icon: Trophy },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
];

export default function AdminLayout() {
  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 bg-slate-900 text-slate-200 hidden md:flex flex-col">
        <Link to="/" className="flex items-center gap-2 p-5 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white"><Sparkles className="w-5 h-5" /></div>
          <div>
            <div className="font-display font-bold text-white">GameZoo</div>
            <div className="text-[10px] uppercase tracking-wider text-teal-400">Admin Panel</div>
          </div>
        </Link>
        <nav className="flex-1 p-3 space-y-1">
          {LINKS.map(l => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive ? 'bg-teal-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}>
              <l.icon className="w-4 h-4" /> {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800">
          <Link to="/production" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800">
            <Package className="w-4 h-4" /> Production Panel
          </Link>
          <Link to="/" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800">
            <LogOut className="w-4 h-4" /> Back to site
          </Link>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 px-5 flex items-center justify-between">
          <div className="font-display font-semibold text-slate-900">Admin Dashboard</div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold">AD</div>
          </div>
        </header>
        <main className="p-6 flex-1"><Outlet /></main>
      </div>
    </div>
  );
}
