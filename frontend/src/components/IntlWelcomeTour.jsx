import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Gamepad2, Globe2, Infinity as InfinityIcon, Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';

const STEPS = [
  { Icon: Globe2, title: 'Welcome to Prize League!', body: 'Great to have you here. While prize competitions are for eligible UK residents, there is plenty you can enjoy for free from your country.' },
  { Icon: Gamepad2, title: 'Free World levels', body: 'Travel the Free World map and beat skill games level by level: memory, puzzles, speed and word games. No tokens needed for the early levels.' },
  { Icon: InfinityIcon, title: 'Unlimited Games', body: 'Open Challenges / Unlimited Games for non-stop practice. Play as many rounds as you like and sharpen your skills.' },
  { Icon: Trophy, title: 'Climb the leaderboards', body: 'Your fastest times appear on the leaderboards so you can see how you rank against players everywhere.' },
];
const KEY = (id) => `pl_intl_tour_done_${id}`;

export default function IntlWelcomeTour() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [closed, setClosed] = useState(false);
  const access = user?.country_access;
  const intl = !!access?.country && access.country !== 'GB' && access.permissions?.allow_free_games !== false;
  const done = (() => { try { return !!user && localStorage.getItem(KEY(user.user_id)) === '1'; } catch { return true; } })();
  const show = intl && !done && !closed && !!user?.terms_accepted_at && !pathname.startsWith('/admin');
  const finish = (go) => {
    try { localStorage.setItem(KEY(user.user_id), '1'); } catch { /* storage unavailable */ }
    setClosed(true);
    if (go) nav('/world');
  };
  const { Icon, title, body } = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <Dialog open={show} onOpenChange={(o) => !o && finish(false)}>
      <DialogContent className="max-w-md" data-testid="intl-welcome-tour">
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#6C2BFF]/10"><Icon className="h-8 w-8 text-[#6C2BFF]" /></span>
          <DialogTitle className="text-xl font-extrabold" data-testid="intl-tour-title">{title}</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-slate-600">{body}</DialogDescription>
          <div className="mt-4 flex gap-1.5">{STEPS.map((_, i) => <span key={i} className={`h-1.5 w-6 rounded-full ${i <= step ? 'bg-[#6C2BFF]' : 'bg-slate-200'}`} />)}</div>
        </div>
        <div className="mt-2 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => finish(false)} data-testid="intl-tour-skip">Skip</Button>
          {last
            ? <Button className="flex-1 bg-[#6C2BFF] text-white" onClick={() => finish(true)} data-testid="intl-tour-play">Play free games</Button>
            : <Button className="flex-1 bg-[#6C2BFF] text-white" onClick={() => setStep(step + 1)} data-testid="intl-tour-next">Next</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
