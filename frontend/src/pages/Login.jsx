import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { useToast } from '../hooks/use-toast';
import { Mail, Phone, Shield, Gift, Trophy, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PrizeLeagueLogo from '../components/layout/PrizeLeagueLogo';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
  );
}

export default function Login() {
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { toast } = useToast();
  const { login, register } = useAuth();

  const emailSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login({ email: fd.get('email'), password: fd.get('password') });
        toast({ title: 'Welcome back!' });
      } else {
        await register({ email: fd.get('email'), password: fd.get('password'), name: fd.get('name') });
        toast({ title: 'Account created!', description: 'Welcome to Prize League 🎉' });
      }
      nav('/my-account');
    } catch (err) {
      const raw = err?.response?.data?.detail;
      const detail = Array.isArray(raw) ? raw.map(e => e.msg).join('. ') : (raw || 'Please check your details and try again.');
      if (mode === 'register' && /already/i.test(detail)) {
        toast({ title: 'Email already registered', description: 'Switch to "Log in" and try your password.' });
        setMode('login');
      } else {
        toast({ title: mode === 'login' ? 'Sign in failed' : 'Sign up failed', description: detail });
      }
    } finally { setBusy(false); }
  };

  const google = () => {
    const redirectUrl = window.location.origin + '/my-account';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] grid lg:grid-cols-2 relative overflow-hidden bg-white" data-testid="login-page">
      {/* Left panel — premium purple/gold brand hero */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 text-white pl-hero-bg overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-[#FFD54A]/25 rounded-full blur-3xl pl-float" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-[#8B5CFF]/30 rounded-full blur-3xl pl-float" style={{ animationDelay: '1s' }} />
        <div className="relative">
          <Link to="/" className="inline-flex"><PrizeLeagueLogo size={44} stacked /></Link>
        </div>
        <div className="relative space-y-6">
          <h2 className="font-display text-5xl font-extrabold leading-tight">
            Play. Compete.<br />
            <span className="pl-gold-text">Win amazing prizes.</span>
          </h2>
          <p className="text-white/80 text-lg max-w-md">Skill-based prize contests. Answer a puzzle, grab a ticket, climb the leaderboard.</p>
          <div className="space-y-3 pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 backdrop-blur flex items-center justify-center"><Gift className="w-5 h-5 text-[#FFD54A]" /></div>
              <div><div className="font-semibold">3 free tickets on signup</div><div className="text-xs text-white/60">Instant welcome bonus</div></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 backdrop-blur flex items-center justify-center"><Trophy className="w-5 h-5 text-[#FFD54A]" /></div>
              <div><div className="font-semibold">Real prizes</div><div className="text-xs text-white/60">Verified winners, delivered per T&amp;Cs</div></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 backdrop-blur flex items-center justify-center"><Zap className="w-5 h-5 text-[#FFD54A]" /></div>
              <div><div className="font-semibold">Free postal entry</div><div className="text-xs text-white/60">No purchase necessary · 18+ only</div></div>
            </div>
          </div>
        </div>
        <p className="relative text-xs text-white/50">18+ only. Please play responsibly. UK residents only.</p>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-6"><PrizeLeagueLogo size={40} stacked invert /></div>

          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-6" data-testid="auth-mode-tabs">
            <button
              onClick={() => setMode('register')}
              data-testid="mode-signup"
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${mode === 'register' ? 'bg-white text-[#6C2BFF] shadow' : 'text-slate-500'}`}
            >Sign up free</button>
            <button
              onClick={() => setMode('login')}
              data-testid="mode-login"
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${mode === 'login' ? 'bg-white text-[#6C2BFF] shadow' : 'text-slate-500'}`}
            >Log in</button>
          </div>

          <h1 className="font-display text-3xl font-extrabold text-slate-900">
            {mode === 'login' ? 'Welcome back!' : 'Create your free account'}
          </h1>
          <p className="text-sm text-slate-500 mb-5">
            {mode === 'login' ? 'Great to see you again.' : 'Takes less than 30 seconds.'}
          </p>

          <Button onClick={google} variant="outline" className="w-full h-11 gap-2 border-slate-200 hover:bg-slate-50 hover:border-[#6C2BFF]/40 font-semibold" data-testid="google-signin">
            <GoogleIcon /> Continue with Google
          </Button>

          <div className="flex items-center gap-2 my-4">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-xs text-slate-400 uppercase tracking-widest">OR</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          <Tabs defaultValue="email">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="email"><Mail className="w-4 h-4 mr-1" /> Email</TabsTrigger>
              <TabsTrigger value="phone"><Phone className="w-4 h-4 mr-1" /> Mobile</TabsTrigger>
            </TabsList>
            <TabsContent value="email" className="mt-4">
              <form onSubmit={emailSubmit} className="space-y-3">
                {mode === 'register' && (
                  <div><Label className="mb-1 block">Your name</Label><Input name="name" required placeholder="Alex Smith" /></div>
                )}
                <div><Label className="mb-1 block">Email</Label><Input name="email" type="email" required placeholder="you@email.com" /></div>
                <div><Label className="mb-1 block">Password</Label><Input name="password" type="password" required minLength={8} placeholder="At least 8 characters" /></div>
                <Button
                  type="submit"
                  disabled={busy}
                  data-testid="email-submit"
                  className="w-full h-11 pl-btn-gold font-extrabold text-slate-900 hover:brightness-105"
                >
                  {busy ? 'Please wait…' : (mode === 'login' ? 'Log in →' : 'Create free account →')}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="phone" className="mt-4">
              <form onSubmit={(e) => { e.preventDefault(); toast({ title: 'SMS OTP disabled', description: 'Add Twilio credentials to activate.' }); }} className="space-y-3">
                <div><Label className="mb-1 block">Mobile number</Label><Input type="tel" required placeholder="07xxx xxx xxx" /></div>
                <Button type="submit" className="w-full h-11 pl-btn-purple text-white font-bold">Send OTP</Button>
                <p className="text-[11px] text-slate-500 text-center"><Shield className="w-3 h-3 inline mr-1" /> Twilio required – currently disabled.</p>
              </form>
            </TabsContent>
          </Tabs>

          <p className="text-[11px] text-slate-400 text-center mt-5">
            By continuing you agree to our <Link to="/terms" className="underline hover:text-[#6C2BFF]">Terms</Link> and <Link to="/privacy" className="underline hover:text-[#6C2BFF]">Privacy Policy</Link>. You confirm you&apos;re 18 or older.
          </p>
          <p className="text-xs text-slate-400 text-center mt-3">
            Staff? <Link to="/admin/login" className="text-[#6C2BFF] hover:text-[#4A15D9] font-semibold">Admin sign-in →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
