import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { useToast } from '../hooks/use-toast';
import { Mail, Phone, Shield, Trophy, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../lib/api';
import PrizeLeagueLogo from '../components/layout/PrizeLeagueLogo';
import SignupWizard from '../components/auth/SignupWizard';

function GoogleIcon() {
 return (
 <svg viewBox="0 0 48 48" className="w-5 h-5"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
 );
}

// --- Phone tab (login-only for existing users): send OTP → verify → JWT ---
function PhoneLoginForm({ onLoggedIn }) {
 const [step, setStep] = useState('phone');
 const [phone, setPhone] = useState('');
 const [normalizedPhone, setNormalizedPhone] = useState('');
 const [code, setCode] = useState('');
 const [busy, setBusy] = useState(false);
 const { toast } = useToast();

 const send = async (e) => {
 e.preventDefault();
 setBusy(true);
 try {
 const r = await authAPI.otpSend(phone);
 setNormalizedPhone(r.phone || phone);
 setStep('code');
 toast({ title: 'Code sent', description: `We texted a code to ${r.phone || phone}` });
 } catch (err) {
 toast({ title: 'Could not send code', description: err?.response?.data?.detail || 'Try again.' });
 } finally { setBusy(false); }
 };

 const verify = async (e) => {
 e.preventDefault();
 setBusy(true);
 try {
 const r = await authAPI.otpLoginVerify(normalizedPhone, code);
 onLoggedIn(r);
 } catch (err) {
 toast({ title: 'Sign-in failed', description: err?.response?.data?.detail || 'Invalid code' });
 } finally { setBusy(false); }
 };

 if (step === 'phone') {
 return (
 <form onSubmit={send} className="space-y-3">
 <div><Label className="mb-1 block">Mobile number</Label>
 <Input data-testid="phone-login-input" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44 7700 900123" />
 <p className="text-[11px] text-slate-500 mt-1">Only for accounts that have completed OTP signup.</p>
 </div>
 <Button data-testid="phone-login-send" type="submit" disabled={busy || phone.length < 8} className="w-full h-11 pl-btn-purple text-white font-bold">
 {busy ? 'Sending…' : 'Send OTP'}
 </Button>
 <p className="text-[11px] text-slate-500 text-center"><Shield className="w-3 h-3 inline mr-1" /> Verified numbers only.</p>
 </form>
 );
 }
 return (
 <form onSubmit={verify} className="space-y-3">
 <div><Label className="mb-1 block">6-digit code</Label>
 <Input data-testid="phone-login-code" inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" className="text-center text-xl tracking-[0.4em] font-bold h-12" />
 <p className="text-[11px] text-slate-500 mt-1">Sent to {normalizedPhone}</p>
 </div>
 <Button data-testid="phone-login-verify" type="submit" disabled={busy || code.length !== 6} className="w-full h-11 pl-btn-gold text-slate-900 font-extrabold">
 {busy ? 'Verifying…' : 'Verify & sign in →'}
 </Button>
 <button type="button" onClick={() => { setStep('phone'); setCode(''); }} className="text-xs text-slate-500 hover:text-slate-900 block mx-auto">← Use a different number</button>
 </form>
 );
}

export default function Login() {
 const [mode, setMode] = useState('login');
 const [busy, setBusy] = useState(false);

 useEffect(() => {
   const params = new URLSearchParams(window.location.search);
   const requestedTab = params.get('tab');
   const referralCode = String(params.get('ref') || '').trim().toUpperCase();

   if (requestedTab === 'signup' || referralCode) {
     setMode('register');
   }

   if (referralCode) {
     localStorage.setItem('pl_referral_code', referralCode);
   }
 }, []);
 const nav = useNavigate();
 const { toast } = useToast();
 const { login, setGoogleUser } = useAuth();

 const emailSubmit = async (e) => {
 e.preventDefault();
 const fd = new FormData(e.currentTarget);
 setBusy(true);
 try {
 await login({ email: fd.get('email'), password: fd.get('password') });
 toast({ title: 'Welcome back!' });
 nav('/');
 } catch (err) {
 const raw = err?.response?.data?.detail;
 const detail = Array.isArray(raw) ? raw.map(e => e.msg).join('. ') : (raw || 'Please check your details and try again.');
 toast({ title: 'Sign in failed', description: detail });
 } finally { setBusy(false); }
 };

 const google = () => {
 // Use a DEDICATED /auth-callback route (not /my-account) so the redirect
 // is predictable across preview / production / custom domains and so the
 // Google OAuth handler sees a clean URL to hydrate the session token from.
 const redirectUrl = window.location.origin + '/auth-callback';
 window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
 };

 const onPhoneLoggedIn = (r) => {
 if (r?.token) localStorage.setItem('gz_token', r.token);
 if (r?.user) setGoogleUser(r.user);
 toast({ title: `Welcome back, ${r?.user?.name || 'friend'} 👋` });
 nav('/');
 };

 return (
 <div className="min-h-[calc(100vh-8rem)] grid lg:grid-cols-2 relative overflow-hidden bg-white" data-testid="login-page">
 {/* Left panel — premium purple/gold brand hero */}
 <div className="relative hidden lg:flex flex-col justify-between p-12 text-white pl-hero-bg overflow-hidden">
 <div className="absolute -top-20 -right-20 w-80 h-80 bg-[#FFD54A]/25 rounded-full blur-3xl pl-float" />
 <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-[#8B5CFF]/30 rounded-full blur-3xl pl-float" style={{ animationDelay: '1s' }} />
 <div className="relative">
 <Link to="/" className="inline-flex"><PrizeLeagueLogo size={44} /></Link>
 </div>
 <div className="relative space-y-6">
 <h2 className="font-display text-5xl font-extrabold leading-tight">
 Play. Compete.<br />
 <span className="pl-gold-text">Win amazing prizes.</span>
 </h2>
 <p className="text-white/80 text-lg max-w-md">Skill-based prize contests. Answer a puzzle, grab a ticket, climb the leaderboard.</p>
 <div className="space-y-3 pt-4">
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
 <div className="lg:hidden mb-6"><PrizeLeagueLogo size={40} emblemOnly /></div>

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
 {mode === 'login' ? 'Great to see you again.' : 'Create your account with mandatory mobile verification.'}
 </p>

 <Button onClick={google} variant="outline" className="w-full h-11 gap-2 border-slate-200 hover:bg-slate-50 hover:border-[#6C2BFF]/40 font-semibold" data-testid="google-signin">
 <GoogleIcon /> Continue with Google
 </Button>

 <div className="flex items-center gap-2 my-4">
 <div className="flex-1 h-px bg-slate-100" />
 <span className="text-xs text-slate-400 uppercase tracking-widest">OR</span>
 <div className="flex-1 h-px bg-slate-100" />
 </div>

 {mode === 'register' ? (
 <SignupWizard />
 ) : (
 <Tabs defaultValue="email">
 <TabsList className="grid grid-cols-2 w-full">
 <TabsTrigger value="email" data-testid="tab-email"><Mail className="w-4 h-4 mr-1" /> Email</TabsTrigger>
 <TabsTrigger value="phone" data-testid="tab-phone"><Phone className="w-4 h-4 mr-1" /> Mobile</TabsTrigger>
 </TabsList>
 <TabsContent value="email" className="mt-4">
 <form onSubmit={emailSubmit} className="space-y-3">
 <div><Label className="mb-1 block">Email</Label><Input name="email" type="email" required placeholder="you@email.com" data-testid="login-email" /></div>
 <div>
 <div className="flex items-center justify-between mb-1">
 <Label>Password</Label>
 <Link
 to="/forgot-password"
 className="text-xs font-semibold text-[#6C2BFF] hover:text-[#4A15D9]"
 data-testid="login-forgot-password-link"
 >
 Forgot password?
 </Link>
 </div>
 <Input name="password" type="password" required placeholder="Your password" data-testid="login-password" />
 </div>
 <Button
 type="submit"
 disabled={busy}
 data-testid="email-submit"
 className="w-full h-11 pl-btn-gold font-extrabold text-slate-900 hover:brightness-105"
 >
 {busy ? 'Please wait…' : 'Log in →'}
 </Button>
 </form>
 </TabsContent>
 <TabsContent value="phone" className="mt-4">
 <PhoneLoginForm onLoggedIn={onPhoneLoggedIn} />
 </TabsContent>
 </Tabs>
 )}

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
