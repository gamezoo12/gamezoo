import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingCart, User, Menu, X, LogOut, Wallet as WalletIcon, ChevronDown, Trophy } from 'lucide-react';
import { Button } from '../ui/button';
import {
 AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
 AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import NotificationsBell from './NotificationsBell';
import AnnouncementTicker from './AnnouncementTicker';
import PrizeLeagueLogo from './PrizeLeagueLogo';
import { useAuth } from '../../context/AuthContext';
import { walletAPI } from '../../lib/api';
import { tokenCount } from '../../lib/format';

const NAV = [
 { label: 'Home', href: '/' },
 { label: 'Contests', href: '/competitions' },
 { label: 'Leaderboard', href: '/leaderboard' },
 { label: 'How It Works', href: '/how-it-works' },
 { label: 'Refer & Earn', href: '/refer' },
];

export default function Header() {
 const [open, setOpen] = useState(false); // mobile menu
 const [profileOpen, setProfileOpen] = useState(false);
 const [signOutOpen, setSignOutOpen] = useState(false);
 const [balance, setBalance] = useState(null);
 const [cartCount, setCartCount] = useState(0);
 const { pathname } = useLocation();
 const { user, logout } = useAuth();
 const profileRef = useRef(null);

 // Cart badge
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

 // Wallet balance
 useEffect(() => {
 if (!user) { setBalance(null); return undefined; }
 const load = () => walletAPI.me().then(w => setBalance(w.balance)).catch(() => {});
 load();
 const t = setInterval(load, 30000);
 return () => clearInterval(t);
 }, [user, pathname]);

 // Mobile menu → prevent body scroll
 useEffect(() => {
 document.body.style.overflow = open ? 'hidden' : '';
 return () => { document.body.style.overflow = ''; };
 }, [open]);

 // Close profile dropdown on outside click
 useEffect(() => {
 const onDown = (e) => { if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false); };
 document.addEventListener('mousedown', onDown);
 return () => document.removeEventListener('mousedown', onDown);
 }, []);

 const doLogout = async () => {
 setProfileOpen(false);
 setOpen(false);
 setSignOutOpen(false);
 await logout();
 window.location.href = '/';
 };

 const askLogout = () => {
 setProfileOpen(false);
 setOpen(false);
 setSignOutOpen(true);
 };

 const isActive = (href) => href === '/' ? pathname === '/' : pathname.startsWith(href);

 return (
 <>
 <header className="sticky top-0 z-40" data-testid="site-header">
 <div style={{ background: 'linear-gradient(180deg, #0B0D1F 0%, #161433 100%)' }} className="border-b border-white/5">
 <div className="max-w-7xl mx-auto flex items-center justify-between px-3 sm:px-4 lg:px-8 h-14 sm:h-16 md:h-[70px] gap-2">
 <Link to="/" className="shrink-0 flex items-center" data-testid="header-logo">
 {/* Compact emblem-only on tightest phones; full wordmark from ≥sm */}
 <span className="sm:hidden"><PrizeLeagueLogo size={36} emblemOnly /></span>
 <span className="hidden sm:inline lg:hidden"><PrizeLeagueLogo size={44} /></span>
 <span className="hidden lg:inline"><PrizeLeagueLogo size={60} /></span>
 </Link>

 {/* Desktop nav */}
 <nav className="hidden lg:flex items-center gap-8" aria-label="Main">
 {NAV.map((l) => (
 <Link
 key={l.href}
 to={l.href}
 data-testid={`nav-${l.label.toLowerCase().replace(/[\s&]+/g,'-')}`}
 className={`text-sm font-bold uppercase tracking-wider transition-colors ${isActive(l.href) ? 'text-white pl-nav-active' : 'text-white/70 hover:text-white'}`}
 >
 {l.label}
 </Link>
 ))}
 </nav>

 {/* Right cluster */}
 <div className="flex items-center gap-1 sm:gap-2">
 {user && (
 <Link
 to="/my-account?tab=wallet"
 data-testid="header-wallet-chip"
 className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[#FFD54A] text-xs font-bold transition"
 title="Your token balance — 1 token = £1"
 >
 <WalletIcon className="w-3.5 h-3.5" />
 {balance === null ? '…' : `${tokenCount(balance)} 🪙`}
 </Link>
 )}

 <span className="hidden sm:inline-flex"><NotificationsBell /></span>

 {/* Draw Centre icon — desktop only to keep the mobile header uncluttered */}
 <Link to="/draw-centre" className="hidden md:inline-flex relative p-2 rounded-lg hover:bg-white/5" aria-label="Draw centre" data-testid="header-draw-centre">
 <Trophy className="w-5 h-5 text-[#FFD54A]" />
 </Link>

 <Link to="/cart" className="relative p-2 rounded-lg hover:bg-white/5" aria-label="Cart" data-testid="header-cart">
 <ShoppingCart className="w-5 h-5 text-white/85" />
 {cartCount > 0 && <span className="absolute -top-1 -right-1 bg-[#FFD54A] text-slate-900 text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">{cartCount}</span>}
 </Link>

 {/* Compact gold PLAY button — visible from ≥sm (fuller label on md+) */}
 <Link to="/competitions" className="hidden sm:inline-flex" data-testid="header-play-btn">
 <button className="pl-btn-gold h-9 px-3 md:px-4 rounded-full font-extrabold text-xs md:text-sm">
 PLAY <span className="hidden md:inline">NOW</span>
 </button>
 </Link>

 {!user ? (
 <>
 {/* Mobile-only Sign in icon */}
 <Link
 to="/login"
 className="sm:hidden p-2 rounded-lg hover:bg-white/5"
 aria-label="Sign in"
 data-testid="mobile-signin-icon"
 >
 <User className="w-5 h-5 text-white/85" />
 </Link>
 <Link to="/login" className="hidden sm:inline-flex" data-testid="header-signin">
 <Button variant="ghost" size="sm" className="text-white/90 hover:text-white hover:bg-white/10">
 <User className="w-4 h-4 mr-1" /> Sign in
 </Button>
 </Link>
 </>
 ) : (
 <>
 {/* Mobile-only profile avatar → jumps to My Account */}
 <Link
 to="/my-account"
 className="sm:hidden"
 aria-label="My account"
 data-testid="mobile-profile-icon"
 >
 <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8B5CFF] to-[#6C2BFF] text-white text-xs font-bold flex items-center justify-center ring-2 ring-white/20">
 {(user.name || user.email || 'U').slice(0, 1).toUpperCase()}
 </div>
 </Link>

 <div ref={profileRef} className="relative hidden sm:block">
 <button
 onClick={() => setProfileOpen(v => !v)}
 data-testid="header-profile-btn"
 className="inline-flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-white/10 transition"
 >
 <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8B5CFF] to-[#6C2BFF] text-white text-xs font-bold flex items-center justify-center ring-2 ring-white/20">
 {(user.name || user.email || 'U').slice(0, 1).toUpperCase()}
 </div>
 <span className="text-sm font-semibold text-white max-w-[8rem] truncate hidden md:inline">Hi, {(user.name || user.email || 'You').split(' ')[0]}</span>
 <ChevronDown className={`w-4 h-4 text-white/70 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
 </button>

 {profileOpen && (
 <div
 data-testid="profile-dropdown"
 className="absolute right-0 mt-2 w-64 rounded-2xl overflow-hidden shadow-2xl border border-white/10"
 style={{ background: '#161433' }}
 >
 <div className="px-4 py-3 border-b border-white/10">
 <div className="text-white font-bold text-sm truncate">{user.name || user.email}</div>
 <div className="text-white/60 text-xs truncate">{user.email}</div>
 </div>
 <div className="py-1">
 <Link
 to="/my-account"
 onClick={() => setProfileOpen(false)}
 className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/85 hover:bg-white/5 hover:text-white transition"
 data-testid="dropdown-my-profile"
 >
 <User className="w-4 h-4 text-white/50" /> Go to My Profile
 </Link>
 </div>
 <div className="border-t border-white/10 py-1">
 <button
 onClick={askLogout}
 data-testid="profile-signout"
 className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 transition"
 >
 <LogOut className="w-4 h-4" /> Sign Out
 </button>
 </div>
 </div>
 )}
 </div>
 </>
 )}

 {/* Mobile burger */}
 <button
 className="lg:hidden p-2 text-white"
 onClick={() => setOpen(!open)}
 aria-label={open ? 'Close menu' : 'Open menu'}
 data-testid="mobile-menu-toggle"
 >
 {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
 </button>
 </div>
 </div>
 </div>

 <AnnouncementTicker />
 </header>

 {/* Mobile drawer */}
 {open && (
 <div className="fixed inset-0 z-50 lg:hidden" data-testid="mobile-menu">
 <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
 <aside className="absolute top-0 right-0 h-full w-[85%] max-w-sm p-6 flex flex-col" style={{ background: '#0B0D1F' }}>
 <div className="flex items-center justify-between mb-6">
 <PrizeLeagueLogo size={52} />
 <button onClick={() => setOpen(false)} className="p-2 text-white" aria-label="Close">
 <X className="w-6 h-6" />
 </button>
 </div>

 <nav className="flex-1 overflow-y-auto">
 {NAV.map((l) => (
 <Link
 key={l.href}
 to={l.href}
 onClick={() => setOpen(false)}
 className={`block py-4 px-3 rounded-xl text-lg font-bold uppercase tracking-wider border-b border-white/5 ${isActive(l.href) ? 'text-[#FFD54A]' : 'text-white/85 hover:text-white'}`}
 >
 {l.label}
 </Link>
 ))}

 {user ? (
 <>
 {/* Wallet + Draw Centre quick-access strip (mobile-only, keeps
     signed-in users one tap from their money and pending draws). */}
 <div className="mt-4 grid grid-cols-2 gap-2">
 <Link
 to="/my-account?tab=wallet"
 onClick={() => setOpen(false)}
 data-testid="mobile-wallet-link"
 className="flex flex-col items-start gap-1 py-3 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10"
 >
 <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/60">
 <WalletIcon className="w-3 h-3" /> Tokens
 </div>
 <div className="text-[#FFD54A] font-black text-lg leading-none">
 {balance === null ? '…' : `${tokenCount(balance)} 🪙`}
 </div>
 </Link>
 <Link
 to="/draw-centre"
 onClick={() => setOpen(false)}
 data-testid="mobile-draw-centre-link"
 className="flex flex-col items-start gap-1 py-3 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10"
 >
 <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/60">
 <Trophy className="w-3 h-3 text-[#FFD54A]" /> Draw Centre
 </div>
 <div className="text-white font-black text-sm leading-none pt-0.5">
 View draws →
 </div>
 </Link>
 </div>

 <Link
 to="/my-account"
 onClick={() => setOpen(false)}
 data-testid="mobile-profile-link"
 className="mt-3 flex items-center gap-3 py-3 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white"
 >
 <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#8B5CFF] to-[#6C2BFF] text-white text-xs font-bold flex items-center justify-center">
 {(user.name || user.email || 'U').slice(0, 1).toUpperCase()}
 </div>
 <div className="flex-1 min-w-0">
 <div className="font-bold text-sm truncate">{user.name || user.email}</div>
 <div className="text-white/60 text-xs">Go to Profile →</div>
 </div>
 </Link>
 <button
 onClick={askLogout}
 data-testid="mobile-signout"
 className="mt-3 w-full flex items-center justify-center gap-2 py-4 px-3 rounded-xl border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 font-bold"
 >
 <LogOut className="w-5 h-5" /> Sign Out
 </button>
 </>
 ) : (
 <div className="mt-6 space-y-3">
 <Link to="/login" onClick={() => setOpen(false)}>
 <button className="w-full py-3 rounded-full border border-white/20 text-white font-bold">Sign in</button>
 </Link>
 <Link to="/competitions" onClick={() => setOpen(false)}>
 <button className="w-full py-3 rounded-full pl-btn-gold font-extrabold">PLAY NOW</button>
 </Link>
 </div>
 )}
 </nav>
 </aside>
 </div>
 )}

 {/* Global sign-out confirmation */}
 <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
 <AlertDialogContent data-testid="header-signout-confirm">
 <AlertDialogHeader>
 <AlertDialogTitle>Sign out of Prize League?</AlertDialogTitle>
 <AlertDialogDescription>
 You&apos;ll need to sign in again to access your account, wallet and tickets.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel data-testid="header-signout-cancel">Stay signed in</AlertDialogCancel>
 <AlertDialogAction
 data-testid="header-signout-confirm-btn"
 onClick={doLogout}
 className="bg-red-600 hover:bg-red-700 text-white"
 >
 Sign out
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </>
 );
}
