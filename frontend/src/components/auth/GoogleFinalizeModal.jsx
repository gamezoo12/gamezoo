import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Phone, ShieldCheck, ArrowLeft, ArrowRight, Calendar, ScrollText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { authAPI, api } from '../../lib/api';
import { useToast } from '../../hooks/use-toast';

/**
 * Mandatory finalization wizard shown to Google users after OAuth.
 *  1) DOB (required, 18+)
 *  2) Phone → send OTP
 *  3) 6-digit code
 *  4) Accept T&Cs
 *
 * NO skip button.  Closing the dialog is disabled — user must complete or
 * abandon by leaving the page entirely (which will re-trigger the modal next
 * time they land on the app while unverified).
 */
export default function GoogleFinalizeModal({ open, onComplete }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [data, setData] = useState({
    dob: '', phone: '', normalizedPhone: '', code: '', address: '', accept_terms: false,
  });
  const { toast } = useToast();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));

  const submitDob = (e) => {
    e.preventDefault();
    if (!data.dob) return toast({ title: 'Enter your date of birth' });
    const today = new Date(); const dobDate = new Date(data.dob);
    const age = today.getFullYear() - dobDate.getFullYear() - (
      (today.getMonth() < dobDate.getMonth() || (today.getMonth() === dobDate.getMonth() && today.getDate() < dobDate.getDate())) ? 1 : 0
    );
    if (Number.isNaN(age) || age < 18) return toast({ title: 'You must be 18 or older' });
    setStep(2);
  };

  const sendOtp = async () => {
    if (data.phone.length < 8) return toast({ title: 'Enter a valid mobile number' });
    setBusy(true);
    try {
      const r = await authAPI.otpSend(data.phone);
      setData((d) => ({ ...d, normalizedPhone: r.phone || data.phone }));
      setStep(3);
      setCooldown(30);
      toast({ title: 'Code sent', description: `We texted a code to ${r.phone || data.phone}` });
    } catch (err) {
      toast({ title: 'Could not send code', description: err?.response?.data?.detail || 'Try again.' });
    } finally { setBusy(false); }
  };

  const advanceCode = (e) => {
    e.preventDefault();
    if (data.code.length !== 6) return toast({ title: 'Enter the 6-digit code' });
    setStep(4);
  };

  const finish = async () => {
    if (!data.accept_terms) return toast({ title: 'Please accept the Terms & Privacy Policy' });
    setBusy(true);
    try {
      const r = await api.post('/auth/google/finalize', {
        phone: data.normalizedPhone || data.phone,
        otp_code: data.code,
        accept_terms: true,
        dob: data.dob,
        address: data.address || null,
      }).then(x => x.data);
      toast({ title: 'You&apos;re all set 🎉', description: `Welcome, ${r?.user?.name?.split(' ')[0] || 'friend'}!` });
      onComplete?.(r?.user);
    } catch (err) {
      const raw = err?.response?.data?.detail;
      const detail = Array.isArray(raw) ? raw.map(e => e.msg).join('. ') : (raw || 'Please try again.');
      if (/code/i.test(detail)) setStep(3);
      toast({ title: 'Verification failed', description: detail });
    } finally { setBusy(false); }
  };

  const Progress = () => (
    <div className="flex items-center gap-2 mb-4">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className={`h-1.5 rounded-full flex-1 transition-colors ${n <= step ? 'bg-[#6C2BFF]' : 'bg-slate-200'}`} />
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={() => { /* mandatory: cannot dismiss */ }}>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        data-testid="google-finalize-modal"
      >
        <Progress />

        {step === 1 && (
          <form onSubmit={submitDob} className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#FFD54A]/20 flex items-center justify-center"><Calendar className="w-6 h-6 text-[#6C2BFF]" /></div>
            <h3 className="font-display font-extrabold text-2xl text-slate-900">Almost there!</h3>
            <p className="text-sm text-slate-500">We need a couple of things before you can play.</p>
            <div>
              <Label className="mb-1 block">Date of birth <span className="text-slate-400 text-xs font-normal">(18+ only)</span></Label>
              <Input data-testid="gf-dob" type="date" required value={data.dob} onChange={e => set('dob', e.target.value)} max={new Date().toISOString().slice(0, 10)} autoFocus />
            </div>
            <Button data-testid="gf-step1-next" type="submit" className="w-full h-11 pl-btn-gold text-slate-900 font-extrabold">
              Continue <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <button type="button" onClick={() => setStep(1)} className="text-slate-500 hover:text-slate-900 text-sm flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back</button>
            <div className="w-12 h-12 rounded-full bg-[#6C2BFF]/10 flex items-center justify-center"><Phone className="w-6 h-6 text-[#6C2BFF]" /></div>
            <h3 className="font-display font-extrabold text-2xl text-slate-900">Verify your mobile</h3>
            <p className="text-sm text-slate-500">Required to receive winner notifications and secure your account.</p>
            <div>
              <Label className="mb-1 block">Mobile number</Label>
              <Input data-testid="gf-phone" type="tel" required value={data.phone} onChange={e => set('phone', e.target.value)} placeholder="+44 7700 900123" autoFocus />
              <p className="text-[11px] text-slate-500 mt-1">International format e.g. +447700900123</p>
            </div>
            <Button data-testid="gf-send-otp" onClick={sendOtp} disabled={busy || data.phone.length < 8} className="w-full h-11 pl-btn-purple text-white font-bold">
              {busy ? 'Sending…' : 'Send verification code'}
            </Button>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={advanceCode} className="space-y-3">
            <button type="button" onClick={() => setStep(2)} className="text-slate-500 hover:text-slate-900 text-sm flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back</button>
            <div className="w-12 h-12 rounded-full bg-[#6C2BFF]/10 flex items-center justify-center"><ShieldCheck className="w-6 h-6 text-[#6C2BFF]" /></div>
            <h3 className="font-display font-extrabold text-2xl text-slate-900">Enter the code</h3>
            <p className="text-sm text-slate-500">Sent to {data.normalizedPhone}</p>
            <Input
              data-testid="gf-otp"
              inputMode="numeric"
              maxLength={6}
              required
              autoFocus
              value={data.code}
              onChange={e => set('code', e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-2xl tracking-[0.5em] font-bold h-14"
              placeholder="123456"
            />
            <Button data-testid="gf-verify" type="submit" disabled={data.code.length !== 6} className="w-full h-11 pl-btn-gold text-slate-900 font-extrabold">
              Continue <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <button type="button" onClick={sendOtp} disabled={busy || cooldown > 0} className="block mx-auto text-[#6C2BFF] disabled:text-slate-400 text-sm font-semibold" data-testid="gf-resend">
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </form>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <button type="button" onClick={() => setStep(3)} className="text-slate-500 hover:text-slate-900 text-sm flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back</button>
            <div className="w-12 h-12 rounded-full bg-[#FFD54A]/20 flex items-center justify-center"><ScrollText className="w-6 h-6 text-[#6C2BFF]" /></div>
            <h3 className="font-display font-extrabold text-2xl text-slate-900">One last thing</h3>
            <p className="text-sm text-slate-500">Confirm you agree to our terms — required to finish signup.</p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 max-h-40 overflow-auto">
              By ticking the box you agree to Prize League&apos;s{' '}
              <Link to="/terms" target="_blank" className="text-[#6C2BFF] underline">Terms &amp; Conditions</Link>,{' '}
              <Link to="/privacy" target="_blank" className="text-[#6C2BFF] underline">Privacy Policy</Link>, and confirm you&apos;re 18+, a UK resident,
              and play responsibly. Prizes are subject to KYC. Free postal entry is always available.
            </div>
            <label className="flex items-start gap-3 cursor-pointer select-none py-2">
              <Checkbox data-testid="gf-accept-terms" checked={data.accept_terms} onCheckedChange={(v) => set('accept_terms', !!v)} className="mt-0.5" />
              <span className="text-sm text-slate-700">I&apos;ve read and accept the Terms &amp; Privacy Policy. I&apos;m 18 or older.</span>
            </label>
            <Button data-testid="gf-finish" onClick={finish} disabled={busy || !data.accept_terms} className="w-full h-11 pl-btn-gold text-slate-900 font-extrabold">
              {busy ? 'Finalizing…' : 'Finish signup →'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
