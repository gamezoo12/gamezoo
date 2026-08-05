import { useEffect, useState } from 'react';
import HeroBanner from '../components/home/HeroBanner';
import CompetitionSection from '../components/home/CompetitionSection';
import HowToPlaySection from '../components/home/HowToPlaySection';
import LeaderboardPreview from '../components/home/LeaderboardPreview';
import ReferAndEarnCard from '../components/home/ReferAndEarnCard';
import TrustBadges from '../components/home/TrustBadges';
import MobileHome from '../components/mobile/MobileHome';
import BonusPromoBanner from '../components/BonusPromoBanner';
import { contestsAPI } from '../lib/api';

export default function Home() {
  const [contests, setContests] = useState([]);
  useEffect(() => { contestsAPI.list().then(setContests).catch(() => {}); }, []);

  const mapped = contests.map(c => ({
    id: c.contest_id, slug: c.slug, title: c.title, subtitle: c.subtitle,
    category: c.category, tag: c.tag, price: c.price,
    ticketsSold: c.tickets_sold, ticketsTotal: c.tickets_total,
    prizeAmount: c.prize_amount, endDate: c.end_date, image: c.image, mobile_image: c.mobile_image,
    jackpot: c.jackpot, featured: c.featured, gameType: c.game_type,
  }));

  const featured = [...mapped]
    .sort((a, b) => (b.featured ? 2 : 0) + (b.jackpot ? 1 : 0) - ((a.featured ? 2 : 0) + (a.jackpot ? 1 : 0)))
    .slice(0, 4);

  return (
    <>
      {/* MOBILE-ONLY redesigned experience (below 768px). Wrapped in md:hidden
          so desktop markup below is untouched. Uses the same live APIs. */}
      <div className="md:hidden">
        <MobileHome />
      </div>

      {/* DESKTOP-ONLY (unchanged). hidden md:block keeps the original layout
          exactly as designed and shipped. */}
      <div className="hidden md:block">
        <HeroBanner contests={contests} />
        <div className="max-w-6xl mx-auto px-4 -mt-2 mb-6">
          <BonusPromoBanner />
        </div>
        {featured.length > 0 && (
          <CompetitionSection title="Featured Contests" subtitle="Handpicked for you" items={featured} viewAllHref="/competitions" />
        )}
        <HowToPlaySection compact />
        <LeaderboardPreview />
        <ReferAndEarnCard />
        <TrustBadges />
      </div>
    </>
  );
}
