import { PrizeRestrictionNotice } from '../components/CountryAccess';
import { useEffect, useState } from 'react';

import PromotionBanner from '../components/home/PromotionBanner';
import CompetitionSection from '../components/home/CompetitionSection';
import WinnersGallery from '../components/home/WinnersGallery';
import Reviews from '../components/home/Reviews';
import ReferAndEarnCard from '../components/home/ReferAndEarnCard';
import TrustBadges from '../components/home/TrustBadges';
import MobileHome from '../components/mobile/MobileHome';
import InstallPrompt from '../world/components/InstallPrompt';
import { contestsAPI } from '../lib/api';
import { COMPETITION_SECTIONS, competitionSectionOf } from '../lib/competitionSections';

export default function Home() {
  const [contests, setContests] = useState([]);
  const [activeSection, setActiveSection] = useState('mega');

  useEffect(() => {
    contestsAPI.list()
      .then(r => setContests(Array.isArray(r) ? r : (r?.contests || [])))
      .catch(() => setContests([]));
  }, []);

  const mapped = contests.map(c => ({
    id: c.contest_id,
    contest_id: c.contest_id,
    slug: c.slug,
    title: c.title,
    subtitle: c.subtitle,
    category: c.category,
    tag: c.tag,
    price: c.price,
    ticketsSold: c.tickets_sold,
    ticketsTotal: c.tickets_total,
    prizeAmount: c.prize_amount,
    endDate: c.end_date,
    image: c.image,
    jackpot: c.jackpot,
    featured: c.featured,
    gameType: c.game_type,
    engine_type: c.engine_type,
    hasTimeLimit: c.has_time_limit !== false,
    status: c.status,

    // Single source of truth for public Future status.
    public_coming_soon: c.public_coming_soon === true,
    comingSoon: c.public_coming_soon === true,
  }));

  const sortContests = list =>
    [...list].sort(
      (a, b) =>
        (b.featured ? 2 : 0) +
        (b.jackpot ? 1 : 0) -
        ((a.featured ? 2 : 0) + (a.jackpot ? 1 : 0))
    );

  const sectionContests = Object.fromEntries(
    COMPETITION_SECTIONS.map(section => [
      section.key,
      sortContests(mapped.filter(c => competitionSectionOf(c) === section.key)).slice(0, 10),
    ])
  );

  return (
    <>
      <PrizeRestrictionNotice className="mx-4 mt-3 md:mx-auto md:max-w-6xl" />
      {/* MOBILE */}
      <div className="md:hidden">
        <MobileHome />
      </div>

      {/* DESKTOP */}
      <div className="hidden md:block bg-white">

        {/* 1 - promotion */}
        <PromotionBanner />

        <WinnersGallery title="Recent Winners" />

        <div className="max-w-7xl mx-auto px-4 lg:px-8 pt-2" data-testid="paid-competition-nav">
          <div className="grid grid-cols-4 overflow-hidden border-2 border-slate-900 bg-white shadow-sm">
            {COMPETITION_SECTIONS.map(section => (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={`min-w-0 border-r border-slate-900 px-1 py-3 text-[11px] sm:text-sm font-black uppercase leading-tight transition last:border-r-0 ${activeSection === section.key ? 'bg-slate-900 text-[#FFD54A]' : 'bg-white text-slate-900 hover:bg-amber-50'}`}
                data-testid={`paid-competition-nav-${section.key}`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        {COMPETITION_SECTIONS.filter(section => section.key === activeSection).map(section => (
          <CompetitionSection
            key={section.key}
            title={section.label}
            subtitle={section.subtitle}
            items={sectionContests[section.key]}
            viewAllHref={`/competitions?section=${section.key}`}
            hideViewAll={sectionContests[section.key].length === 0}
            hideHeading
          />
        ))}

        {/* 4 - reviews */}
        <Reviews />

        {/* 5 */}
        <ReferAndEarnCard />

        {/* 6 */}
        <TrustBadges />

      </div>

      <InstallPrompt />
    </>
  );
}
