import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { useToast } from '../hooks/use-toast';
import { Sparkles, Mail, Phone, Shield, Gift, Trophy, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
  );
}

export default function Login() {
  const [mode, setMode] = useState('register');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { toast } = useToast();
  const { login, register } = useAuth();

  const emailSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      if (mode === 'login') { await login({ email: fd.get('email'), password: fd.get('password') }); toast({ title: 'Welcome back!' }); }
      else { await register({ email: fd.get('email'), password: fd.get('password'), name: fd.get('name') }); toast({ title: 'Account created!', description: 'Welcome to GameZoo 🎉' }); }
      nav('/my-account');
    } catch (err) { toast({ title: 'Sign in failed', description: err?.response?.data?.detail || 'Please try again.' }); }
    finally { setBusy(false); }
  };

  const google = () => {
    const redirectUrl = window.location.origin + '/my-account';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] grid lg:grid-cols-2 relative overflow-hidden">
      {/* Colourful left panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 text-white bg-gradient-to-br from-teal-500 via-emerald-500 to-cyan-500 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-amber-300/40 rounded-full blur-3xl float" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-fuchsia-400/30 rounded-full blur-3xl float" style={{ animationDelay: '1s' }} />
        <div className="confetti absolute inset-0 opacity-30" />
        <div className="relative">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center"><Sparkles className="w-5 h-5" /></div>
            <span className="font-display font-extrabold text-2xl">GameZoo</span>
          </Link>
        </div>
        <div className="relative space-y-6">
          <h2 className="font-display text-5xl font-extrabold leading-tight">Play. Solve.<br />Win real cash.</h2>
          <p className="text-white/85 text-lg max-w-md">Skill-based prize contests from just £1. Answer a puzzle, grab a ticket, win up to £500 tax-free.</p>
          <div className="space-y-3 pt-4">
            <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center"><Gift className="w-5 h-5" /></div><div><div className="font-semibold">10 free spins on signup</div><div className="text-xs text-white/70">Instant welcome bonus</div></div></div>
            <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center"><Trophy className="w-5 h-5" /></div><div><div className="font-semibold">Same-day payouts</div><div className="text-xs text-white/70">Cash straight to your bank</div></div></div>
            <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center"><Zap className="w-5 h-5" /></div><div><div className="font-semibold">Free postal entry</div><div className="text-xs text-white/70">100% UK-legal, no purchase necessary</div></div></div>
          </div>
        </div>
        <p className="relative text-xs text-white/60">18+ only. Please play responsibly.</p>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center px-4 py-12 bg-gradient-to-b from-white via-teal-50/40 to-white">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white"><Sparkles className="w-5 h-5" /></div>
            <span className="font-display font-extrabold text-xl">GameZoo</span>
          </div>

          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-6">
            <button onClick={() => setMode('register')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === 'register' ? 'bg-white text-teal-700 shadow' : 'text-slate-500'}`}>Sign up free</button>
            <button onClick={() => setMode('login')} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === 'login' ? 'bg-white text-teal-700 shadow' : 'text-slate-500'}`}>Log in</button>
          </div>

          <h1 className="font-display text-3xl font-extrabold text-slate-900">{mode === 'login' ? 'Welcome back!' : 'Create your free account'}</h1>
          <p className="text-sm text-slate-500 mb-5">{mode === 'login' ? 'Great to see you again.' : 'Takes less than 30 seconds.'}</p>

          <Button onClick={google} variant="outline" className="w-full h-11 gap-2 border-slate-200 hover:bg-slate-50 font-semibold">
            <GoogleIcon /> Continue with Google
          </Button>

          <div className="flex items-center gap-2 my-4"><div className="flex-1 h-px bg-slate-100" /><span className="text-xs text-slate-400">OR</span><div className="flex-1 h-px bg-slate-100" /></div>

          <Tabs defaultValue="email">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="email"><Mail className="w-4 h-4 mr-1" /> Email</TabsTrigger>
              <TabsTrigger value="phone"><Phone className="w-4 h-4 mr-1" /> Mobile</TabsTrigger>
            </TabsList>
            <TabsContent value="email" className="mt-4">
              <form onSubmit={emailSubmit} className="space-y-3">
                {mode === 'register' && (<div><Label className="mb-1 block">Your name</Label><Input name="name" required placeholder="Alex Smith" /></div>)}
                <div><Label className="mb-1 block">Email</Label><Input name="email" type="email" required placeholder="you@email.com" /></div>
                <div><Label className="mb-1 block">Password</Label><Input name="password" type="password" required minLength={6} placeholder="••••••••" /></div>
                <Button type="submit" disabled={busy} className="w-full h-11 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold shadow-lg shadow-orange-500/20">
                  {busy ? 'Please wait…' : (mode === 'login' ? 'Log in →' : 'Create free account →')}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="phone" className="mt-4">
              <form onSubmit={(e) => { e.preventDefault(); toast({ title: 'SMS OTP disabled', description: 'Add Twilio credentials to activate.' }); }} className="space-y-3">
                <div><Label className="mb-1 block">Mobile number</Label><Input type="tel" required placeholder="07xxx xxx xxx" /></div>
                <Button type="submit" className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white">Send OTP</Button>
                <p className="text-[11px] text-slate-500 text-center"><Shield className="w-3 h-3 inline mr-1" /> Twilio required – currently disabled.</p>
              </form>
            </TabsContent>
          </Tabs>

          <p className="text-[11px] text-slate-400 text-center mt-5">By continuing you agree to our <a href="/faq" className="underline">Terms</a> and confirm you’re 18 or older.</p>
          <p className="text-xs text-slate-400 text-center mt-3">Staff? <Link to="/admin-login" className="text-slate-600 hover:text-teal-600 font-semibold">Admin sign-in →</Link></p>
        </div>
      </div>
    </div>
  );
}
