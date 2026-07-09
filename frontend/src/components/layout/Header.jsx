import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, User, Menu, X, Sparkles, LogOut } from 'lucide-react';
import { NAV_LINKS } from '../../mock/mockData';
import { Button } from '../ui/button';
import NotificationsBell from './NotificationsBell';
import { useAuth } from '../../context/AuthContext';

export default function Header() {
  const [open, setOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    const load = () => {
      const raw = localStorage.getItem('gamezoo_cart');
      const cart = raw ? JSON.parse(raw) : [];
      setCartCount(cart.reduce((s, i) => s + i.qty, 0));
    };
    load();
    window.addEventListener('storage', load);
    const t = setInterval(load, 1500);
    return () => { window.removeEventListener('storage', load); clearInterval(t); };
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-slate-100">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 lg:px-8 h-16">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-teal-500/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="font-display font-extrabold text-xl tracking-tight text-slate-900">
            Prize<span className="text-teal-600">League</span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} to={l.href} className={`text-sm font-medium transition-colors ${pathname === l.href ? 'text-teal-600' : 'text-slate-700 hover:text-teal-600'}`}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <NotificationsBell />
          <Link to="/cart" className="relative p-2 rounded-lg hover:bg-slate-100">
            <ShoppingCart className="w-5 h-5 text-slate-700" />
            {cartCount > 0 && <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">{cartCount}</span>}
          </Link>
          {!user ? (
            <>
              <Link to="/login" className="hidden sm:inline-flex" data-testid="header-signin"><Button variant="ghost" size="sm" className="gap-1"><User className="w-4 h-4" /> Sign in</Button></Link>
              <Link to="/competitions" className="hidden sm:inline-flex"><Button size="sm" className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-md shadow-orange-500/20">Play Now</Button></Link>
            </>
          ) : (
            <div className="hidden sm:block relative">
              <button
                onClick={() => setMenu((v) => !v)}
                data-testid="header-user-menu"
                onBlur={() => setTimeout(() => setMenu(false), 150)}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-white text-xs font-bold flex items-center justify-center">
                  {(user.name || user.email || 'U').slice(0, 1).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-slate-800 max-w-[9rem] truncate">{user.name || user.email}</span>
              </button>
              {menu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-slate-100 py-1 z-50" data-testid="header-user-dropdown">
                  <Link to="/my-account" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">My account</Link>
                  <Link to="/my-account?tab=orders" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">My tickets</Link>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    data-testid="header-logout"
                    onClick={async () => { await logout(); window.location.href = '/'; }}
                    className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50"
                  ><LogOut className="w-4 h-4" /> Sign out</button>
                </div>
              )}
            </div>
          )}
          <button className="lg:hidden p-2" onClick={() => setOpen(!open)}>{open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-slate-100 bg-white">
          <div className="px-4 py-3 flex flex-col gap-2">
            {NAV_LINKS.map((l) => <Link key={l.href} to={l.href} onClick={() => setOpen(false)} className="py-2 text-slate-700">{l.label}</Link>)}
          </div>
        </div>
      )}
    </header>
  );
}
