import { Link } from 'react-router-dom';
import { Facebook, Instagram, Twitter, Mail } from 'lucide-react';
import PrizeLeagueLogo from './PrizeLeagueLogo';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useToast } from '../../hooks/use-toast';

export default function Footer() {
  const { toast } = useToast();
  const subscribe = (e) => {
    e.preventDefault();
    toast({ title: 'Subscribed!', description: 'You will hear from Prize League soon.' });
    e.currentTarget.reset();
  };

  return (
    <footer className="pt-14 pb-8" style={{ background: '#0B0D1F', color: 'rgba(255,255,255,0.7)' }}>
      <div className="max-w-7xl mx-auto px-4 lg:px-8 grid md:grid-cols-4 gap-10">
        <div>
          <PrizeLeagueLogo size={44} stacked />
          <p className="text-sm mt-4 leading-relaxed max-w-xs">
            Prize League is a premium skill-based prize competition platform. Play, compete and win amazing prizes.
          </p>
          <div className="flex gap-3 mt-4">
            <a href="#" aria-label="Facebook" className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#6C2BFF] flex items-center justify-center transition-colors"><Facebook className="w-4 h-4" /></a>
            <a href="#" aria-label="Instagram" className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#6C2BFF] flex items-center justify-center transition-colors"><Instagram className="w-4 h-4" /></a>
            <a href="#" aria-label="Twitter" className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#6C2BFF] flex items-center justify-center transition-colors"><Twitter className="w-4 h-4" /></a>
          </div>
        </div>

        <div>
          <h4 className="text-white font-bold mb-3 text-sm uppercase tracking-widest">Explore</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/competitions" className="hover:text-[#FFD54A]">Contests</Link></li>
            <li><Link to="/leaderboard" className="hover:text-[#FFD54A]">Leaderboard</Link></li>
            <li><Link to="/winners" className="hover:text-[#FFD54A]">Winners</Link></li>
            <li><Link to="/how-it-works" className="hover:text-[#FFD54A]">How It Works</Link></li>
            <li><Link to="/faq" className="hover:text-[#FFD54A]">FAQs</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-bold mb-3 text-sm uppercase tracking-widest">Company</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/my-account" className="hover:text-[#FFD54A]">My Account</Link></li>
            <li><a href="/free-entry" className="hover:text-[#FFD54A]">Free Postal Entry</a></li>
            <li><Link to="/terms" className="hover:text-[#FFD54A]">Terms &amp; Conditions</Link></li>
            <li><Link to="/privacy" className="hover:text-[#FFD54A]">Privacy Policy</Link></li>
            <li><Link to="/responsible" className="hover:text-[#FFD54A]">Responsible Play</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-bold mb-3 text-sm uppercase tracking-widest">Newsletter</h4>
          <p className="text-sm mb-3">Get contest drops and winner announcements.</p>
          <form onSubmit={subscribe} className="flex gap-2">
            <Input type="email" required placeholder="you@email.com" className="bg-white/5 border-white/10 text-white placeholder:text-white/40" />
            <Button type="submit" className="pl-btn-gold text-slate-900 hover:opacity-90"><Mail className="w-4 h-4" /></Button>
          </form>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 mt-10 pt-6 border-t border-white/10 flex flex-col md:flex-row justify-between gap-4 text-xs text-white/50">
        <p>© {new Date().getFullYear()} Prize League. All rights reserved.</p>
        <p>18+ · Please play responsibly · UK residents only. Prize fulfilment is subject to winner verification and terms.</p>
      </div>
    </footer>
  );
}
