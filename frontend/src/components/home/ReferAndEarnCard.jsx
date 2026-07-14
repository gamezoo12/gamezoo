import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, Copy, Check, Share2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { referralAPI } from '../../lib/api';

/**
 * Premium homepage Refer & Earn card.
 * Logged in → shows unique referral code + copy/share.
 * Logged out → shows Sign up CTA.
 */
export default function ReferAndEarnCard() {
  const { user } = useAuth();
  const [ref, setRef] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    referralAPI.me().then(r => setRef(r)).catch(() => {});
  }, [user]);

  const link = ref?.code ? `${window.location.origin}/?ref=${ref.code}` : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  const share = async () => {
    if (!navigator.share) { copyLink(); return; }
    try {
      await navigator.share({
        title: 'Prize League — join with my link',
        text: 'Try Prize League — skill-based contests with amazing prizes.',
        url: link,
      });
    } catch { /* user cancelled */ }
  };

  return (
    <section className="py-12 md:py-16" data-testid="refer-earn-card">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div
          className="relative rounded-3xl overflow-hidden shadow-2xl"
          style={{ background: 'linear-gradient(135deg, #161433 0%, #241a5f 55%, #6C2BFF 130%)' }}
        >
          {/* decorative blobs */}
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-[#FFD54A]/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-[#8B5CFF]/30 blur-3xl" />

          <div className="relative grid md:grid-cols-[1.2fr,1fr] gap-8 p-6 md:p-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#FFD54A] font-bold">
                <Gift className="w-4 h-4" /> Refer &amp; Earn
              </div>
              <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold text-white leading-tight">
                Invite your friends and <span className="pl-gold-text">earn exciting rewards</span>
              </h2>
              <p className="mt-3 text-white/70 max-w-lg">
                Share your unique code. When a friend signs up and enters their first contest,
                you both get a bonus ticket (or £5 wallet credit).
              </p>

              {user ? (
                ref ? (
                  <div className="mt-6 space-y-3 max-w-md">
                    <div className="flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-3">
                      <span className="text-xs uppercase text-white/60 tracking-widest mr-2">Your code</span>
                      <span className="font-display text-lg font-extrabold text-white tracking-widest flex-1">{ref.code}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={copyLink}
                        data-testid="refer-copy"
                        className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-full bg-white text-[#0B0D1F] font-bold text-sm hover:bg-white/90"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copied!' : 'Copy link'}
                      </button>
                      <button
                        onClick={share}
                        data-testid="refer-share"
                        className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-full pl-btn-purple font-bold text-sm"
                      >
                        <Share2 className="w-4 h-4" /> Share
                      </button>
                    </div>
                    <Link to="/my-account?tab=referrals" className="text-sm text-white/70 hover:text-white inline-flex items-center gap-1" data-testid="refer-learn-more">
                      Learn more about Refer &amp; Earn <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                ) : (
                  <div className="mt-6 text-white/70 text-sm">Loading your referral code…</div>
                )
              ) : (
                <div className="mt-6 flex gap-3 flex-wrap">
                  <Link to="/login?tab=signup" data-testid="refer-signup">
                    <button className="pl-btn-gold px-6 py-3 rounded-full font-extrabold">Sign up to get your code</button>
                  </Link>
                  <Link to="/login">
                    <button className="px-6 py-3 rounded-full border border-white/20 text-white font-bold hover:bg-white/10">Log in</button>
                  </Link>
                </div>
              )}
            </div>

            {/* Gift illustration (icon block) */}
            <div className="hidden md:flex items-center justify-center">
              <div className="relative w-64 h-64 rounded-full bg-white/5 border border-white/10 flex items-center justify-center pl-float">
                <div className="absolute inset-6 rounded-full bg-gradient-to-br from-[#FFD54A]/30 to-[#6C2BFF]/30 blur-xl" />
                <Gift className="relative w-32 h-32 text-[#FFD54A]" strokeWidth={1.3} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
