import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Globe2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { countryAPI } from '../lib/api';

let cached = null;
export function useCountries() {
  const [list, setList] = useState(cached || []);
  useEffect(() => {
    if (cached) return;
    countryAPI.list().then((r) => { cached = r.countries; setList(r.countries); }).catch(() => {});
  }, []);
  return list;
}

export function useSignupRules(code) {
  const [rules, setRules] = useState(null);
  useEffect(() => {
    if (!code) { setRules(null); return; }
    let live = true;
    countryAPI.signupRules(code).then((r) => live && setRules(r)).catch(() => live && setRules(null));
    return () => { live = false; };
  }, [code]);
  return rules;
}

export default function CountrySelect({ value, onChange, testId = 'country-select', disabled }) {
  const countries = useCountries();
  const [open, setOpen] = useState(false);
  const current = countries.find((c) => c.code === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} data-testid={testId}
          className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm disabled:opacity-60">
          <Globe2 className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="flex-1 truncate">{current ? `${current.name} (${current.code})` : 'Select your country of residence'}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-[10300] w-[--radix-popover-trigger-width] min-w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country or code…" data-testid={`${testId}-search`} />
          <CommandList className="max-h-64">
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {countries.map((c) => (
                <CommandItem key={c.code} value={`${c.name} ${c.code}`} data-testid={`${testId}-option-${c.code}`}
                  onSelect={() => { onChange(c.code); setOpen(false); }}>
                  <Check className={`mr-2 h-4 w-4 ${value === c.code ? 'opacity-100' : 'opacity-0'}`} />
                  {c.name} <span className="ml-auto text-xs text-slate-400">{c.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
