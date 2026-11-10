import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';

export function TokenRulesButton({ rewards }) {
  const top = [1, 2, 3, 4, 5].map((r) => `#${r}: ${rewards?.[String(r)] ?? 0}`).join(' · ');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 rounded-full bg-[var(--fw-accent-soft)] px-2.5 py-1 text-[11px] font-black text-[var(--fw-accent-strong)]" data-testid="lb-level-token-rules-btn">
          <Info size={12} /> How to earn tokens
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-[10200] w-80 text-sm" data-testid="lb-level-token-rules">
        <p className="mb-2 font-black text-slate-900">Earning Bonus Tokens on a level</p>
        <ol className="list-decimal space-y-1.5 pl-4 text-slate-700">
          <li>Play the level while it is <b>Open</b>. Only successful, verified runs count.</li>
          <li>Your <b>fastest time</b> is your score — replay to beat your best.</li>
          <li>When the level closes, the <b>Top 5 fastest</b> win Bonus Tokens ({top}).</li>
          <li>Tokens are held until the Champion round and paid only if you also finish in the <b>Champion Top 5</b> of this GC; otherwise they are forfeited.</li>
        </ol>
      </PopoverContent>
    </Popover>
  );
}
