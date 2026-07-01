import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { useToast } from '../hooks/use-toast';
import { Sparkles } from 'lucide-react';

export default function Login() {
  const [mode, setMode] = useState('login');
  const nav = useNavigate();
  const { toast } = useToast();

  const submit = (e) => {
    e.preventDefault();
    toast({ title: mode === 'login' ? 'Welcome back!' : 'Account created!', description: 'You’ve been signed in successfully.' });
    setTimeout(() => nav('/my-account'), 500);
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-12 bg-gradient-to-b from-teal-50 to-white">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-100 shadow-xl p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white"><Sparkles className="w-5 h-5" /></div>
          <span className="font-display font-extrabold text-xl">Prize Paradise</span>
        </div>
        <h1 className="font-display text-2xl font-bold text-slate-900">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
        <p className="text-sm text-slate-500 mb-6">{mode === 'login' ? 'Continue winning big.' : 'Get 10 free spins on sign up.'}</p>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <div><Label className="mb-1 block">Full name</Label><Input required placeholder="Jane Doe" /></div>
          )}
          <div><Label className="mb-1 block">Email</Label><Input type="email" required placeholder="you@email.com" /></div>
          <div><Label className="mb-1 block">Password</Label><Input type="password" required placeholder="••••••••" /></div>
          <Button type="submit" className="w-full h-11 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-semibold">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-sm text-slate-600 text-center">
          {mode === 'login' ? "Don't have an account?" : 'Already registered?'}{' '}
          <button className="text-teal-600 font-semibold" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Sign up free' : 'Sign in'}
          </button>
        </p>

        <Link to="/" className="block mt-4 text-center text-xs text-slate-400 hover:text-slate-600">← Back to home</Link>
      </div>
    </div>
  );
}
