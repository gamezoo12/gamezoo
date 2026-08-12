import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { useToast } from '../../hooks/use-toast';
import { authAPI } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  Phone,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  User,
  Mail,
  Lock,
  Calendar,
  ScrollText,
} from 'lucide-react';

/**
 * Mandatory five-step email/password signup:
 *
 * 1 — Account details
 * 2 — Email verification code
 * 3 — Required mobile number
 * 4 — Phone verification code
 * 5 — Terms & account creation
 *
 * Twilio Verify codes are authoritatively checked by /auth/register
 * immediately before the account is inserted.
 */
export default function SignupWizard() {
  const nav = useNavigate();
  const { toast } = useToast();
  const { refresh } = useAuth();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const [emailCooldown, setEmailCooldown] = useState(0);
  const [phoneCooldown, setPhoneCooldown] = useState(0);

  const [data, setData] = useState({
    name: '',
    email: '',
    normalizedEmail: '',
    emailCode: '',
    dob: '',
    password: '',
    phone: '',
    normalizedPhone: '',
    phoneCode: '',
    address: '',
    referralCode: '',
    accept_terms: false,
  });

  // Preserve referral / influencer acquisition code during signup.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const queryCode = String(
      params.get('ref') || ''
    ).trim().toUpperCase();

    if (queryCode) {
      localStorage.setItem(
        'pl_referral_code',
        queryCode
      );

      setData((current) => ({
        ...current,
        referralCode: queryCode,
      }));

      return;
    }

    const savedCode = String(
      localStorage.getItem('pl_referral_code') || ''
    ).trim().toUpperCase();

    if (savedCode) {
      setData((current) => ({
        ...current,
        referralCode: savedCode,
      }));
    }
  }, []);


  useEffect(() => {
    if (emailCooldown <= 0) return undefined;

    const timer = setInterval(() => {
      setEmailCooldown((current) =>
        Math.max(0, current - 1)
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [emailCooldown]);


  useEffect(() => {
    if (phoneCooldown <= 0) return undefined;

    const timer = setInterval(() => {
      setPhoneCooldown((current) =>
        Math.max(0, current - 1)
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [phoneCooldown]);


  const set = (key, value) => {
    setData((current) => ({
      ...current,
      [key]: value,
    }));
  };


  const validateBasics = () => {
    if (
      !data.name.trim() ||
      !data.email.trim() ||
      !data.dob ||
      !data.password
    ) {
      toast({
        title: 'Please fill in all fields',
      });

      return false;
    }

    if (data.password.length < 8) {
      toast({
        title: 'Password must be 8+ characters',
      });

      return false;
    }

    const today = new Date();
    const dobDate = new Date(data.dob);

    const age =
      today.getFullYear() -
      dobDate.getFullYear() -
      (
        today.getMonth() < dobDate.getMonth() ||
        (
          today.getMonth() === dobDate.getMonth() &&
          today.getDate() < dobDate.getDate()
        )
          ? 1
          : 0
      );

    if (Number.isNaN(age) || age < 18) {
      toast({
        title: 'You must be 18 or older',
      });

      return false;
    }

    return true;
  };


  // Step 1 -> automatically send first email verification code.
  const submitBasics = async (event) => {
    event.preventDefault();

    if (!validateBasics()) return;

    setBusy(true);

    try {
      const result = await authAPI.emailOtpSend(
        data.email.trim()
      );

      setData((current) => ({
        ...current,
        normalizedEmail:
          result?.email ||
          current.email.trim().toLowerCase(),
        emailCode: '',
      }));

      setEmailCooldown(30);
      setStep(2);

      toast({
        title: 'Email code sent',
        description:
          `Check ${result?.email || data.email.trim()} for your verification code.`,
      });
    } catch (error) {
      toast({
        title: 'Could not send email code',
        description:
          error?.response?.data?.detail ||
          'Check your email address and try again.',
      });
    } finally {
      setBusy(false);
    }
  };


  const resendEmailCode = async () => {
    if (emailCooldown > 0 || busy) return;

    setBusy(true);

    try {
      const result = await authAPI.emailOtpSend(
        data.normalizedEmail || data.email
      );

      setEmailCooldown(30);

      toast({
        title: 'Email code sent again',
        description:
          `Check ${result?.email || data.email}.`,
      });
    } catch (error) {
      toast({
        title: 'Could not resend code',
        description:
          error?.response?.data?.detail ||
          'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };


  // We retain the code for the authoritative backend verification at
  // registration time. Do not consume the Twilio code here.
  const advanceAfterEmailCode = (event) => {
    event.preventDefault();

    if (data.emailCode.length !== 6) {
      return toast({
        title: 'Enter the 6-digit email code',
      });
    }

    setStep(3);
  };


  const sendPhoneOtp = async () => {
    if (data.phone.trim().length < 8) {
      return toast({
        title: 'Enter a valid mobile number',
      });
    }

    setBusy(true);

    try {
      const result = await authAPI.otpSend(
        data.phone
      );

      setData((current) => ({
        ...current,
        normalizedPhone:
          result?.phone || current.phone,
        phoneCode: '',
      }));

      setPhoneCooldown(30);
      setStep(4);

      toast({
        title: 'SMS code sent',
        description:
          `We sent a code to ${result?.phone || data.phone}.`,
      });
    } catch (error) {
      toast({
        title: 'Could not send SMS code',
        description:
          error?.response?.data?.detail ||
          'Check the number and try again.',
      });
    } finally {
      setBusy(false);
    }
  };


  const resendPhoneCode = async () => {
    if (phoneCooldown > 0 || busy) return;

    await sendPhoneOtp();
  };


  // Same security model as email: retain the code for the backend.
  const advanceAfterPhoneCode = (event) => {
    event.preventDefault();

    if (data.phoneCode.length !== 6) {
      return toast({
        title: 'Enter the 6-digit SMS code',
      });
    }

    setStep(5);
  };


  const finish = async () => {
    if (!data.accept_terms) {
      return toast({
        title:
          'Please accept the Terms & Privacy Policy',
      });
    }

    if (
      !data.normalizedEmail ||
      data.emailCode.length !== 6
    ) {
      setStep(2);

      return toast({
        title: 'Email verification is required',
      });
    }

    if (
      !data.normalizedPhone ||
      data.phoneCode.length !== 6
    ) {
      setStep(3);

      return toast({
        title: 'Phone verification is required',
      });
    }

    setBusy(true);

    try {
      const payload = {
        email: data.normalizedEmail,
        email_otp_code: data.emailCode,
        password: data.password,
        name: data.name,
        phone: data.normalizedPhone,
        otp_code: data.phoneCode,
        accept_terms: true,
        dob: data.dob,
        address: data.address || null,
        referral_code:
          data.referralCode.trim()
            ? data.referralCode
                .trim()
                .toUpperCase()
            : null,
      };

      const result = await authAPI.register(
        payload
      );

      if (result?.token) {
        localStorage.setItem(
          'gz_token',
          result.token
        );
      }

      localStorage.removeItem(
        'pl_referral_code'
      );

      await refresh?.();

      toast({
        title:
          `Welcome to Prize League, ${
            data.name.split(' ')[0]
          }! 🎉`,
        description:
          'Your verified account is ready.',
      });

      const params =
        new URLSearchParams(
          window.location.search
        );

      const requestedNext = String(
        params.get('next') || ''
      ).trim();

      const safeNext =
        requestedNext.startsWith('/') &&
        !requestedNext.startsWith('//')
          ? requestedNext
          : '/';

      nav(safeNext, {
        replace: true,
      });
    } catch (error) {
      const raw =
        error?.response?.data?.detail;

      const detail = Array.isArray(raw)
        ? raw.map((item) => item.msg).join('. ')
        : (
          raw ||
          'Please try again.'
        );

      if (
        /email verification/i.test(detail)
      ) {
        setStep(2);
      } else if (
        /phone verification/i.test(detail)
      ) {
        setStep(4);
      }

      toast({
        title: 'Signup failed',
        description: detail,
      });
    } finally {
      setBusy(false);
    }
  };


  const Progress = () => (
    <div
      className="flex items-center gap-2 mb-6"
      data-testid="signup-progress"
    >
      {[1, 2, 3, 4, 5].map((number) => (
        <div
          key={number}
          className={
            `h-1.5 rounded-full flex-1 transition-colors ${
              number <= step
                ? 'bg-[#6C2BFF]'
                : 'bg-slate-200'
            }`
          }
        />
      ))}
    </div>
  );


  return (
    <div
      className="space-y-4"
      data-testid="signup-wizard"
    >
      <Progress />

      {/* STEP 1 — DETAILS */}
      {step === 1 && (
        <form
          onSubmit={submitBasics}
          className="space-y-3"
        >
          <div>
            <Label className="mb-1 block">
              Full name
            </Label>

            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />

              <Input
                data-testid="signup-name"
                className="pl-9"
                required
                value={data.name}
                onChange={(event) =>
                  set(
                    'name',
                    event.target.value
                  )
                }
                placeholder="Alex Smith"
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 block">
              Email
            </Label>

            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />

              <Input
                data-testid="signup-email"
                className="pl-9"
                type="email"
                required
                value={data.email}
                onChange={(event) => {
                  setData((current) => ({
                    ...current,
                    email: event.target.value,
                    normalizedEmail: '',
                    emailCode: '',
                  }));
                }}
                placeholder="you@email.com"
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 block">
              Date of birth{' '}
              <span className="text-slate-400 text-xs font-normal">
                (18+ only)
              </span>
            </Label>

            <div className="relative">
              <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />

              <Input
                data-testid="signup-dob"
                className="pl-9"
                type="date"
                required
                value={data.dob}
                onChange={(event) =>
                  set(
                    'dob',
                    event.target.value
                  )
                }
                max={
                  new Date()
                    .toISOString()
                    .slice(0, 10)
                }
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 block">
              Password{' '}
              <span className="text-slate-400 text-xs font-normal">
                (8+ characters)
              </span>
            </Label>

            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />

              <Input
                data-testid="signup-password"
                className="pl-9"
                type="password"
                required
                minLength={8}
                value={data.password}
                onChange={(event) =>
                  set(
                    'password',
                    event.target.value
                  )
                }
                placeholder="At least 8 characters"
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 block">
              Referral code
              <span className="text-slate-400 text-xs font-normal">
                {' '}(optional)
              </span>
            </Label>

            <Input
              data-testid="signup-referral-code"
              value={data.referralCode}
              onChange={(event) =>
                set(
                  'referralCode',
                  event.target.value
                    .toUpperCase()
                    .replace(
                      /[^A-Z0-9]/g,
                      ''
                    )
                    .slice(0, 32)
                )
              }
              placeholder="Enter referral code"
              autoCapitalize="characters"
              autoComplete="off"
            />

            <p className="text-[11px] text-slate-500 mt-1">
              Have a friend&apos;s invite code?
              Enter it here before creating
              your account.
            </p>
          </div>

          <div className="rounded-xl border border-[#FFD54A]/50 bg-[#FFD54A]/10 px-3 py-2.5">
            <p className="text-xs text-slate-700">
              <strong>
                New member offer:
              </strong>{' '}
              top up £10 or more in one
              verified payment after signup to
              receive{' '}
              <strong>
                5 bonus tokens
              </strong>.
            </p>
          </div>

          <Button
            data-testid="signup-step1-next"
            type="submit"
            disabled={busy}
            className="w-full h-11 pl-btn-gold text-slate-900 font-extrabold"
          >
            {busy
              ? 'Sending verification code…'
              : 'Continue'}

            {!busy && (
              <ArrowRight className="w-4 h-4 ml-1" />
            )}
          </Button>
        </form>
      )}


      {/* STEP 2 — EMAIL OTP */}
      {step === 2 && (
        <form
          onSubmit={advanceAfterEmailCode}
          className="space-y-3"
        >
          <button
            type="button"
            onClick={() => setStep(1)}
            className="text-slate-500 hover:text-slate-900 text-sm flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </button>

          <div className="w-12 h-12 rounded-full bg-[#6C2BFF]/10 flex items-center justify-center">
            <Mail className="w-6 h-6 text-[#6C2BFF]" />
          </div>

          <h3 className="font-display font-extrabold text-2xl text-slate-900">
            Verify your email
          </h3>

          <p className="text-sm text-slate-500">
            We sent a 6-digit verification
            code to{' '}
            <strong>
              {data.normalizedEmail ||
                data.email}
            </strong>.
          </p>

          <Input
            data-testid="signup-email-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            value={data.emailCode}
            onChange={(event) =>
              set(
                'emailCode',
                event.target.value
                  .replace(/\D/g, '')
                  .slice(0, 6)
              )
            }
            className="text-center text-2xl tracking-[0.5em] font-bold h-14"
            placeholder="123456"
          />

          <Button
            data-testid="signup-email-verify-next"
            type="submit"
            disabled={
              data.emailCode.length !== 6
            }
            className="w-full h-11 pl-btn-gold text-slate-900 font-extrabold"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>

          <button
            type="button"
            onClick={resendEmailCode}
            disabled={
              busy ||
              emailCooldown > 0
            }
            className="block mx-auto text-[#6C2BFF] disabled:text-slate-400 text-sm font-semibold"
            data-testid="signup-email-resend"
          >
            {emailCooldown > 0
              ? `Resend in ${emailCooldown}s`
              : 'Resend email code'}
          </button>
        </form>
      )}


      {/* STEP 3 — REQUIRED PHONE */}
      {step === 3 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setStep(2)}
            className="text-slate-500 hover:text-slate-900 text-sm flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </button>

          <div className="w-12 h-12 rounded-full bg-[#6C2BFF]/10 flex items-center justify-center">
            <Phone className="w-6 h-6 text-[#6C2BFF]" />
          </div>

          <h3 className="font-display font-extrabold text-2xl text-slate-900">
            Verify your mobile
          </h3>

          <p className="text-sm text-slate-500">
            A verified mobile number is
            required to create a Prize League
            account.
          </p>

          <div>
            <Label className="mb-1 block">
              Mobile number
            </Label>

            <Input
              data-testid="signup-phone"
              type="tel"
              value={data.phone}
              onChange={(event) => {
                setData((current) => ({
                  ...current,
                  phone: event.target.value,
                  normalizedPhone: '',
                  phoneCode: '',
                }));
              }}
              placeholder="+44 7700 900123"
              autoFocus
            />

            <p className="text-[11px] text-slate-500 mt-1">
              International format e.g.
              +447700900123
            </p>
          </div>

          <Button
            data-testid="signup-send-otp"
            onClick={sendPhoneOtp}
            disabled={
              busy ||
              data.phone.trim().length < 8
            }
            className="w-full h-11 pl-btn-purple text-white font-bold"
          >
            {busy
              ? 'Sending…'
              : 'Send verification code'}
          </Button>

          <p className="text-[10px] text-slate-400 text-center">
            Mobile verification is required
            and cannot be skipped.
          </p>
        </div>
      )}


      {/* STEP 4 — PHONE OTP */}
      {step === 4 && (
        <form
          onSubmit={advanceAfterPhoneCode}
          className="space-y-3"
        >
          <button
            type="button"
            onClick={() => setStep(3)}
            className="text-slate-500 hover:text-slate-900 text-sm flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </button>

          <div className="w-12 h-12 rounded-full bg-[#6C2BFF]/10 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-[#6C2BFF]" />
          </div>

          <h3 className="font-display font-extrabold text-2xl text-slate-900">
            Enter your SMS code
          </h3>

          <p className="text-sm text-slate-500">
            Sent to{' '}
            <strong>
              {data.normalizedPhone}
            </strong>
          </p>

          <Input
            data-testid="signup-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            value={data.phoneCode}
            onChange={(event) =>
              set(
                'phoneCode',
                event.target.value
                  .replace(/\D/g, '')
                  .slice(0, 6)
              )
            }
            className="text-center text-2xl tracking-[0.5em] font-bold h-14"
            placeholder="123456"
          />

          <Button
            data-testid="signup-verify-code"
            type="submit"
            disabled={
              data.phoneCode.length !== 6
            }
            className="w-full h-11 pl-btn-gold text-slate-900 font-extrabold"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>

          <button
            type="button"
            onClick={resendPhoneCode}
            disabled={
              busy ||
              phoneCooldown > 0
            }
            className="block mx-auto text-[#6C2BFF] disabled:text-slate-400 text-sm font-semibold"
            data-testid="signup-resend"
          >
            {phoneCooldown > 0
              ? `Resend in ${phoneCooldown}s`
              : 'Resend SMS code'}
          </button>
        </form>
      )}


      {/* STEP 5 — TERMS */}
      {step === 5 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setStep(4)}
            className="text-slate-500 hover:text-slate-900 text-sm flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </button>

          <div className="w-12 h-12 rounded-full bg-[#FFD54A]/20 flex items-center justify-center">
            <ScrollText className="w-6 h-6 text-[#6C2BFF]" />
          </div>

          <h3 className="font-display font-extrabold text-2xl text-slate-900">
            One last thing
          </h3>

          <p className="text-sm text-slate-500">
            Confirm you agree to our terms —
            we can&apos;t finish signup without
            it.
          </p>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 max-h-40 overflow-auto">
            By ticking the box you agree to
            Prize League&apos;s{' '}

            <Link
              to="/terms"
              target="_blank"
              className="text-[#6C2BFF] underline"
            >
              Terms &amp; Conditions
            </Link>
            ,{' '}

            <Link
              to="/privacy"
              target="_blank"
              className="text-[#6C2BFF] underline"
            >
              Privacy Policy
            </Link>

            , and confirm you&apos;re 18+, a UK
            resident, and play responsibly.
            Prizes are subject to KYC. Free
            postal entry is always available.
          </div>

          <label
            className="flex items-start gap-3 cursor-pointer select-none py-2"
            data-testid="signup-terms-label"
          >
            <Checkbox
              data-testid="signup-accept-terms"
              checked={data.accept_terms}
              onCheckedChange={(value) =>
                set(
                  'accept_terms',
                  !!value
                )
              }
              className="mt-0.5"
            />

            <span className="text-sm text-slate-700">
              I&apos;ve read and accept the
              Terms &amp; Privacy Policy.
              I&apos;m 18 or older.
            </span>
          </label>

          <Button
            data-testid="signup-finish"
            onClick={finish}
            disabled={
              busy ||
              !data.accept_terms
            }
            className="w-full h-11 pl-btn-gold text-slate-900 font-extrabold"
          >
            {busy
              ? 'Verifying & creating account…'
              : 'Create my account →'}
          </Button>
        </div>
      )}
    </div>
  );
}
