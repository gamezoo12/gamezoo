import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { referralAPI } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Gift, Users, ArrowRight, Copy, Check } from 'lucide-react';
import { Button } from '../ui/button';

export default function ReferralPromo() {
  const { user } = useAuth();
  const [code, setCode] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    referralAPI.me().then(r => setCode(r?.code)).catch(() => {});
  }, [user]);

  const shareUrl = code
    ? `${window.location.origin}/login?tab=signup&ref=${encodeURIComponent(code)}`
    : `${window.location.origin}/login?tab=signup`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
        if (process.env.NODE_ENV !== 'production') console.warn('[referral] clipboard failed', err);
    }
  };

  return (
    <section className="py-14" data-testid="referral-promo">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-900 to-fuchsia-900 p-8 lg:p-12 text-white">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="relative grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/20 text-xs font-semibold uppercase tracking-wider">
                <Gift className="w-3.5 h-3.5 text-amber-300" /> Refer &amp; Earn
              </div>
              <h2 className="mt-4 font-display text-3xl lg:text-4xl font-extrabold leading-tight">
                Invite a friend and <span className="text-amber-300">earn</span> <span className="bg-gradient-to-r from-amber-200 to-orange-300 bg-clip-text text-transparent">5 tokens</span>
              </h2>
              <p className="mt-3 text-white/80 text-base max-w-lg">
                Share your unique referral link. Your friend must sign up with your code, top up £10 or more in one verified payment and enter at least one contest. Once qualified, you automatically receive 5 referral reward tokens.
              </p>
              <ul className="mt-5 space-y-2 text-sm text-white/80">
                <li className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs">1</span> Share your link</li>
                <li className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs">2</span> Friend signs up with your referral code</li>
                <li className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs">3</span> Friend tops up £10+ and enters at least one contest</li>
                <li className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs">4</span> You receive 5 referral reward tokens 🪙</li>
              </ul>
            </div>

            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-6">
              {user ? (
                <>
                  <div className="text-xs uppercase tracking-widest text-white/70">Your invite link</div>
                  <div className="mt-2 bg-black/30 rounded-xl px-4 py-3 font-mono text-sm text-amber-200 overflow-hidden text-ellipsis whitespace-nowrap">
                    {shareUrl}
                  </div>
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={copyLink}
                      data-testid="referral-copy-btn"
                      className="flex-1 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white shadow-lg"
                    >
                      {copied ? <><Check className="w-4 h-4 mr-1" /> Copied!</> : <><Copy className="w-4 h-4 mr-1" /> Copy link</>}
                    </Button>
                    <Link to="/my-account?tab=referrals" className="flex-1">
                      <Button variant="outline" className="w-full border-white/30 text-white bg-white/10 hover:bg-white/20 hover:text-white">
                        <Users className="w-4 h-4 mr-1" /> View stats
                      </Button>
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-display font-bold">Ready to invite friends?</div>
                  <p className="text-white/80 text-sm mt-1">Sign up to get your personal invite link and start earning referral reward tokens.</p>
                  <Link to="/login?tab=signup" className="mt-4 inline-block">
                    <Button className="bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white shadow-lg">
                      Sign up free <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
