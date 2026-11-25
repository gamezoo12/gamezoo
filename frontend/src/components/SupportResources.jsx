import { ExternalLink, LifeBuoy } from 'lucide-react';

const RESOURCES = [
  {
    name: 'National Debtline',
    detail: 'Free debt advice',
    href: 'https://www.nationaldebtline.org/',
    logo: 'https://www.google.com/s2/favicons?domain=nationaldebtline.org&sz=128',
  },
  {
    name: 'StepChange',
    detail: 'Debt support charity',
    href: 'https://www.stepchange.org/',
    logo: 'https://www.google.com/s2/favicons?domain=stepchange.org&sz=128',
  },
  {
    name: 'MoneyHelper',
    detail: 'Free money guidance',
    href: 'https://www.moneyhelper.org.uk/en',
    logo: 'https://www.google.com/s2/favicons?domain=moneyhelper.org.uk&sz=128',
  },
  {
    name: 'GamCare',
    detail: 'Confidential support',
    href: 'https://www.gamcare.org.uk/',
    logo: 'https://www.google.com/s2/favicons?domain=gamcare.org.uk&sz=128',
  },
];

import { useLocation } from 'react-router-dom';

export default function SupportResources() {
  const { pathname } = useLocation();
  const selectorPage = pathname === '/' || pathname === '/choose-world';
  return (
    <aside className={`border-t border-slate-200 bg-slate-50 ${selectorPage ? 'world-selector-support' : ''}`} aria-label="Free support services" data-testid="support-resources">
      <div className="mx-auto max-w-7xl px-4 py-5 lg:px-8">
        <div className="mb-3 flex items-center gap-2">
          <LifeBuoy className="h-4 w-4 text-emerald-700" />
          <h2 className="text-sm font-black uppercase text-slate-900">Free Support &amp; Advice</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RESOURCES.map(resource => (
            <a
              key={resource.name}
              href={resource.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 items-center gap-2 border border-slate-200 bg-white p-2 transition hover:border-emerald-400 hover:bg-emerald-50"
              data-testid={`support-resource-${resource.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <img src={resource.logo} alt={`${resource.name} logo`} className="h-8 w-8 shrink-0 object-contain" loading="lazy" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-black text-slate-900">{resource.name}</span>
                <span className="block truncate text-[10px] text-slate-500">{resource.detail}</span>
              </span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
}
