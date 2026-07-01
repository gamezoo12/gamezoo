import { useState, useEffect } from 'react';
import { COMPETITIONS } from '../../mock/mockData';
import { Button } from '../../components/ui/button';
import { Radio, Users, Play, Pause } from 'lucide-react';

export default function LiveDraw() {
  const [live, setLive] = useState(false);
  const [chat, setChat] = useState([
    { u: 'Denise E.', m: 'Come on lucky number 58!' },
    { u: 'Kyle B.', m: 'Fingers crossed 🍀' },
    { u: 'Rachel H.', m: 'Watching from Manchester!' },
  ]);
  const [ticket, setTicket] = useState('–');
  const [viewers, setViewers] = useState(384);
  const comp = COMPETITIONS.find(c => c.jackpot) || COMPETITIONS[0];

  useEffect(() => {
    if (!live) return;
    const i = setInterval(() => {
      setTicket(String(Math.floor(Math.random() * comp.ticketsSold) + 1));
      setViewers(v => v + Math.floor(Math.random() * 5) - 1);
    }, 700);
    return () => clearInterval(i);
  }, [live, comp.ticketsSold]);

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="aspect-video bg-black rounded-2xl overflow-hidden relative flex items-center justify-center">
          <img src={comp.image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/60" />
          <div className="relative text-center px-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-bold mb-3">
              <Radio className={`w-3 h-3 ${live ? 'animate-pulse' : ''}`} /> {live ? 'LIVE' : 'STANDBY'}
            </div>
            <div className="font-display text-3xl md:text-5xl font-extrabold text-white">{comp.title}</div>
            <div className="mt-6 text-white">
              <div className="text-xs uppercase tracking-widest text-white/70">Winning ticket</div>
              <div className="font-display text-6xl font-black mt-2 tracking-tight">{ticket}</div>
            </div>
          </div>
          <div className="absolute top-4 right-4 flex items-center gap-2 text-white text-sm bg-black/60 px-2.5 py-1 rounded-full">
            <Users className="w-3.5 h-3.5" /> {viewers}
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={() => setLive(!live)} className={`flex-1 h-12 ${live ? 'bg-slate-700 hover:bg-slate-600' : 'bg-rose-600 hover:bg-rose-700'}`}>
            {live ? <><Pause className="w-4 h-4 mr-2" /> Stop draw</> : <><Play className="w-4 h-4 mr-2" /> Start live draw</>}
          </Button>
          <Button variant="outline" className="h-12 bg-transparent border-slate-700 text-slate-200 hover:bg-slate-800" onClick={() => setTicket('–')}>Reset</Button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col">
        <h3 className="font-display font-bold text-white mb-3">Live chat</h3>
        <div className="flex-1 space-y-2 overflow-auto max-h-96">
          {chat.map((c, i) => (
            <div key={i} className="text-sm text-slate-200"><span className="text-teal-400 font-semibold">{c.u}:</span> {c.m}</div>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const m = f.get('m'); if (m) { setChat([...chat, { u: 'Host', m }]); e.currentTarget.reset(); } }} className="mt-3 flex gap-2">
          <input name="m" className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500" placeholder="Say something…" />
          <Button className="bg-orange-500 hover:bg-orange-600">Send</Button>
        </form>
      </div>
    </div>
  );
}
