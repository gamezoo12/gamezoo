import { Check } from 'lucide-react';

// AI host picker: solo = one host, duo = exactly two hosts who banter together.
export function HostPicker({ hosts, mode, host, duo, onMode, onHost, onDuo }) {
  const picked = (id) => (mode === 'duo' ? duo.includes(id) : host === id);
  const toggle = (id) => {
    if (mode === 'solo') return onHost(id);
    if (duo.includes(id)) return undefined;
    return onDuo([duo[1], id]);
  };
  return (
    <div data-testid="draw-host-picker">
      <div className="inline-flex rounded-xl bg-black/30 p-1">
        {[['duo', 'Two hosts together'], ['solo', 'One host']].map(([m, label]) => (
          <button key={m} type="button" onClick={() => onMode(m)} className={`h-9 rounded-lg px-3 text-xs font-black transition-colors ${mode === m ? 'bg-amber-400 text-[#1a1033]' : 'text-white/70'}`} data-testid={`draw-host-mode-${m}`}>{label}</button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-indigo-200/60">{mode === 'duo' ? 'Tap two hosts. They take turns, react to each other and hype every stage.' : 'Tap the host who presents the whole draw.'}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
        {hosts.map((h) => (
          <button key={h.id} type="button" onClick={() => toggle(h.id)} data-testid={`draw-host-${h.id}`}
            className={`relative overflow-hidden rounded-xl border-2 text-left transition-transform hover:-translate-y-0.5 ${picked(h.id) ? 'border-amber-400' : 'border-white/10'}`}>
            <img src={`/hosts/${h.id}.jpg`} alt={h.name} className="aspect-square w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2">
              <span className="block text-sm font-black text-white">{h.name}</span>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-200">{h.gender}</span>
            </span>
            {picked(h.id) && <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-[#1a1033]"><Check className="h-4 w-4" /></span>}
          </button>
        ))}
      </div>
    </div>
  );
}
