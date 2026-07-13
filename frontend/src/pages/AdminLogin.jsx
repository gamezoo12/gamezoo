import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/use-toast';
import { ShieldCheck, Lock, ArrowLeft } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-[32rem] h-[32rem] bg-fuchsia-500/15 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="relative w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-teal-400 mb-6"><ArrowLeft className="w-4 h-4" /> Back to public site</Link>
        <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white"><ShieldCheck className="w-5 h-5" /></div>
            <div>
              <div className="font-display font-extrabold text-white text-lg">Prize League</div>
              <div className="text-[10px] uppercase tracking-widest text-teal-400">Staff Portal</div>
            </div>
          </div>
          <h1 className="font-display text-2xl font-bold text-white">Admin sign in</h1>
          <p className="text-sm text-slate-400 mb-6">Restricted access. Staff accounts only.</p>

          <form onSubmit={submit} className="space-y-4">
            <div><Label className="text-slate-300 mb-1 block">Work email</Label><Input name="email" type="email" required placeholder="admin@prizeleague.co.uk" className="bg-slate-800 border-slate-700 text-white" /></div>
            <div><Label className="text-slate-300 mb-1 block">Password</Label><Input name="password" type="password" required placeholder="••••••••" className="bg-slate-800 border-slate-700 text-white" /></div>
            <Button type="submit" disabled={busy} className="w-full h-11 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-semibold">
              {busy ? 'Signing in…' : <><Lock className="w-4 h-4 mr-1" /> Sign in to admin</>}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-700/50 text-center">
            <p className="text-xs text-slate-500">Are you a player?</p>
            <Link to="/login" className="text-sm text-teal-400 font-semibold hover:underline">Go to player sign-in →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
