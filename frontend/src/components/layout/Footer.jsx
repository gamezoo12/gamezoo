import { Link } from 'react-router-dom';
import { Facebook, Instagram, Sparkles, Mail } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useToast } from '../../hooks/use-toast';

export default function Footer() {
  const { toast } = useToast();
  const subscribe = (e) => {
    e.preventDefault();
    toast({ title: 'Subscribed!', description: 'Welcome to Prize Paradise mailing list.' });
    e.currentTarget.reset();
  };

  return (
    <footer className="bg-slate-900 text-slate-300 pt-16 pb-8 mt-16">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 grid md:grid-cols-4 gap-10">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="font-display font-extrabold text-xl text-white">Prize<span className="text-teal-400">League</span></span>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">Skill-based prize contests. Solve a puzzle, buy a ticket, win real cash. Fully compliant with UK skill-competition law.</p>
          <div className="flex gap-3 mt-4">
            <a href="#" className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-teal-600 flex items-center justify-center transition-colors"><Facebook className="w-4 h-4" /></a>
            <a href="#" className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-teal-600 flex items-center justify-center transition-colors"><Instagram className="w-4 h-4" /></a>
          </div>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-3">Explore</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/competitions" className="hover:text-teal-400">Competitions</Link></li>
            <li><Link to="/winners" className="hover:text-teal-400">Our Winners</Link></li>
            <li><Link to="/draw-results" className="hover:text-teal-400">Draw Results</Link></li>
            <li><Link to="/stories" className="hover:text-teal-400">Stories</Link></li>
            <li><Link to="/faq" className="hover:text-teal-400">FAQs</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-3">Company</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/my-account" className="hover:text-teal-400">My Account</Link></li>
            <li><a href="/free-entry" className="hover:text-teal-400">Free Postal Entry</a></li>
            <li><a href="#" className="hover:text-teal-400">Terms & Conditions</a></li>
            <li><a href="#" className="hover:text-teal-400">Privacy Policy</a></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-3">Newsletter</h4>
          <p className="text-sm text-slate-400 mb-3">Exclusive offers & winner updates.</p>
          <form onSubmit={subscribe} className="flex gap-2">
            <Input type="email" required placeholder="you@email.com" className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500" />
            <Button type="submit" className="bg-teal-500 hover:bg-teal-600"><Mail className="w-4 h-4" /></Button>
          </form>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 mt-10 pt-6 border-t border-slate-800 flex flex-col md:flex-row justify-between gap-4 text-xs text-slate-500">
        <p>© {new Date().getFullYear()} Prize League. All rights reserved.</p>
        <p>18+ | Please play responsibly | UK residents only</p>
      </div>
    </footer>
  );
}
