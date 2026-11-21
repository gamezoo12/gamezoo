import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import CompetitionCard from '../components/CompetitionCard';
import { contestsAPI } from '../lib/api';
import { COMPETITION_SECTIONS, competitionSectionOf } from '../lib/competitionSections';
import { Sparkles } from 'lucide-react';
import useSeo from '../hooks/useSeo';

export default function Competitions() {
  useSeo({
    title: 'Skill Prize Competitions UK | Enter & Win | Prize League',
    description:
      'Browse live skill-based prize competitions in the UK on Prize League. Enter online competitions, play skill games and compete to win real prizes. 18+, free postal entry always available.',
    keywords:
      'skill-based prize competitions, online competitions UK, prize competitions UK, enter competitions to win, play games to win prizes UK',
    canonical: 'https://www.prizeleague.co.uk/competitions',
    robots: 'index, follow, max-image-preview:large',
    ogUrl: 'https://www.prizeleague.co.uk/competitions',
    ogImage: 'https://www.prizeleague.co.uk/og-image.png',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.prizeleague.co.uk/' },
          { '@type': 'ListItem', position: 2, name: 'Competitions', item: 'https://www.prizeleague.co.uk/competitions' },
        ],
      },
    ],
  });

  const [contests, setContests] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('section');
  const selectedSection = COMPETITION_SECTIONS.some(section => section.key === requestedSection)
    ? requestedSection
    : 'mega';

  const selectSection = section => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('section', section);
    setSearchParams(nextParams);
  };

  useEffect(() => {
    contestsAPI
      .list()
      .then(r => setContests(Array.isArray(r) ? r : (r?.contests || [])))
      .catch(() => setContests([]));
  }, []);

  const mapped = useMemo(
    () =>
      contests.map(c => ({
        id: c.contest_id,
        contest_id: c.contest_id,
        slug: c.slug,
        title: c.title,
        subtitle: c.subtitle,
        category: c.category,
        tag: c.tag,
        price: c.price,
        prizeAmount: c.prize_amount,
        ticketsSold: c.tickets_sold,
        ticketsTotal: c.tickets_total,
        endDate: c.end_date,
        image: c.image,
        jackpot: c.jackpot,
        featured: c.featured,
        gameType: c.game_type,
        engine_type: c.engine_type,
        hasTimeLimit: c.has_time_limit !== false,
        status: c.status,

        public_coming_soon: c.public_coming_soon === true,
        comingSoon: c.public_coming_soon === true,
      })),
    [contests]
  );

  const items = useMemo(
    () => mapped.filter(c => competitionSectionOf(c) === selectedSection),
    [mapped, selectedSection]
  );

  const sections = COMPETITION_SECTIONS.map(section => ({
    ...section,
    items: items.filter(contest => competitionSectionOf(contest) === section.key),
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4">
      <div className="grid grid-cols-4 overflow-hidden border-2 border-slate-900 bg-white shadow-sm mb-4" data-testid="competition-section-nav">
        {COMPETITION_SECTIONS.map(section => (
          <button
            key={section.key}
            type="button"
            onClick={() => selectSection(section.key)}
            className={`min-w-0 border-r border-slate-900 px-1 py-3 text-[10px] sm:text-sm font-black uppercase leading-tight transition last:border-r-0 ${selectedSection === section.key ? 'bg-slate-900 text-[#FFD54A]' : 'bg-white text-slate-900 hover:bg-amber-50'}`}
            data-testid={`competition-section-tab-${section.key}`}
          >
            {section.label}
          </button>
        ))}
      </div>

      {sections.filter(section => section.key === selectedSection).map(section => (
        <section key={section.key} className="mb-4" data-testid={`competition-section-${section.key}`}>
          {section.items.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {section.items.map(contest => <CompetitionCard key={contest.id} c={contest} />)}
            </div>
          ) : (
            <div className="border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">
              New {section.label.toLowerCase()} competitions are coming soon.
            </div>
          )}
        </section>
      ))}

      {items.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center">

          <Sparkles className="w-10 h-10 mx-auto text-[#6C2BFF]" />

          <h2 className="mt-4 font-display text-2xl font-extrabold text-slate-900">
            No matching competitions
          </h2>

          <p className="mt-2 text-slate-500">
            New Prize League competitions are being prepared.
          </p>

        </div>
      )}

    </div>
  );
}
