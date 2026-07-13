import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingCart, User, Menu, X, Sparkles, LogOut, Wallet as WalletIcon } from 'lucide-react';
import { NAV_LINKS } from '../../mock/mockData';
import { Button } from '../ui/button';
import NotificationsBell from './NotificationsBell';
import { useAuth } from '../../context/AuthContext';
import { walletAPI } from '../../lib/api';

export default function Header() {
  const [open, setOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [balance, setBalance] = useState(null);
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  useEffect(() => {
    const load = () => {
      const raw = localStorage.getItem('prizeleague_cart') || localStorage.getItem('gamezoo_cart');
      const cart = raw ? JSON.parse(raw) : [];
      setCartCount(cart.reduce((s, i) => s + i.qty, 0));
    };
    load();
    window.addEventListener('storage', load);
    const t = setInterval(load, 1500);
    return () => { window.removeEventListener('storage', load); clearInterval(t); };
  }, [pathname]);

  useEffect(() => {
    if (!user) { setBalance(null); return undefined; }
    const load = () => walletAPI.me().then(w => setBalance(w.balance)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [user, pathname]);

  const doLogout = async () => { await logout(); window.location.href = '/'; };

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 lg:px-8 h-16">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 flex items-center justify-center text-white shadow-lg shadow-fuchsia-500/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="font-display font-extrabold text-xl tracking-tight text-slate-900">
            Prize<span className="text-orange-600">League</span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-7">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} to={l.href} className={`text-sm font-medium transition-colors ${pathname === l.href ? 'text-orange-600' : 'text-slate-700 hover:text-orange-600'}`}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user && (
            <Link
              to="/my-account?tab=wallet"
              data-testid="header-wallet-chip"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-orange-100 to-amber-100 border border-orange-200 text-orange-800 text-xs font-bold hover:from-orange-200"
            >
              <WalletIcon className="w-3.5 h-3.5" />
              {balance === null ? '…' : `£${Number(balance).toFixed(2)}`}
            </Link>
          )}
          <NotificationsBell />
          <Link to="/cart" className="relative p-2 rounded-lg hover:bg-slate-100">
            <ShoppingCart className="w-5 h-5 text-slate-700" />
            {cartCount > 0 && <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">{cartCount}</span>}
          </Link>
          {!user ? (
            <>
              <Link to="/login" className="hidden sm:inline-flex" data-testid="header-signin"><Button variant="ghost" size="sm" className="gap-1"><User className="w-4 h-4" /> Sign in</Button></Link>
              <Link to="/competitions" className="hidden sm:inline-flex"><Button size="sm" className="bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white shadow-md">Play Now</Button></Link>
            </>
          ) : (
            <>
              <Link to="/my-account" className="hidden sm:inline-flex" data-testid="header-account">
                <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-fuchsia-600 text-white text-xs font-bold flex items-center justify-center">
                    {(user.name || user.email || 'U').slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-slate-800 max-w-[8rem] truncate">{user.name || user.email}</span>
                </div>
              </Link>
              <Button
                onClick={doLogout}
                data-testid="header-logout"
                size="sm"
                variant="outline"
                className="hidden sm:inline-flex border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              >
                <LogOut className="w-4 h-4 mr-1" /> Sign out
              </Button>
            </>
          )}
          <button className="lg:hidden p-2" onClick={() => setOpen(!open)}>{open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-slate-100 bg-white">
          <div className="px-4 py-3 flex flex-col gap-2">
            {NAV_LINKS.map((l) => <Link key={l.href} to={l.href} onClick={() => setOpen(false)} className="py-2 text-slate-700">{l.label}</Link>)}
            {user && (
              <>
                <Link to="/my-account" onClick={() => setOpen(false)} className="py-2 text-slate-700">My account</Link>
                <button
                  data-testid="mobile-logout"
                  onClick={async () => { setOpen(false); await logout(); window.location.href = '/'; }}
                  className="py-2 text-rose-600 text-left flex items-center gap-2"
                ><LogOut className="w-4 h-4" /> Sign out</button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
