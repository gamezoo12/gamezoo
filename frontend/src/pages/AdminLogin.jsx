import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/use-toast';
import { ShieldCheck, Lock, ArrowLeft } from 'lucide-react';
import PrizeLeagueLogo from '../components/layout/PrizeLeagueLogo';

export default function AdminLogin() {
  const { login } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const u = await login({ email: fd.get('email'), password: fd.get('password') });
      if (!['admin', 'super_admin', 'operator', 'support'].includes(u.role)) {
        toast({ title: 'Not a staff account', description: 'Use the player login page.' });
        nav('/');
        return;
      }
      toast({ title: `Welcome, ${u.name}` });
      nav(u.role === 'operator' ? '/production' : '/admin');
    } catch (err) {
      toast({ title: 'Sign in failed', description: err?.response?.data?.detail || 'Invalid credentials' });
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 pl-hero-bg relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-[#6C2BFF]/40 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-[32rem] h-[32rem] bg-[#FFD54A]/15 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="relative w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-[#FFD54A] mb-6"><ArrowLeft className="w-4 h-4" /> Back to public site</Link>
        <div className="pl-glass rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <PrizeLeagueLogo size={44} stacked />
            <div className="ml-auto text-[10px] uppercase tracking-widest font-bold text-[#FFD54A]/80 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Staff</div>
          </div>
          <h1 className="font-display text-2xl font-bold text-white">Admin sign in</h1>
          <p className="text-sm text-white/60 mb-6">Restricted access. Staff accounts only.</p>

          <form onSubmit={submit} className="space-y-4">
            <div><Label className="text-white/80 mb-1 block">Work email</Label><Input name="email" type="email" required placeholder="admin@prizeleague.co.uk" className="bg-white/5 border-white/10 text-white placeholder:text-white/40" /></div>
            <div><Label className="text-white/80 mb-1 block">Password</Label><Input name="password" type="password" required placeholder="••••••••" className="bg-white/5 border-white/10 text-white placeholder:text-white/40" /></div>
            <Button type="submit" disabled={busy} className="w-full h-11 pl-btn-gold font-extrabold hover:brightness-105">
              {busy ? 'Signing in…' : <><Lock className="w-4 h-4 mr-1" /> Sign in to admin</>}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-white/10 text-center">
            <p className="text-xs text-white/50">Are you a player?</p>
            <Link to="/login" className="text-sm text-[#FFD54A] font-semibold hover:underline">Go to player sign-in →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
