import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import PromotionBanner from '../components/home/PromotionBanner';
import CompetitionSection from '../components/home/CompetitionSection';
import HowToPlaySection from '../components/home/HowToPlaySection';
import ReferAndEarnCard from '../components/home/ReferAndEarnCard';
import TrustBadges from '../components/home/TrustBadges';
import GamePreviewSection from '../components/home/GamePreviewSection';
import MobileHome from '../components/mobile/MobileHome';
import { contestsAPI } from '../lib/api';

export default function Home() {
  const [contests, setContests] = useState([]);

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

  // A contest automatically moves between these lists when
  // public_coming_soon changes in the backend/admin.
  const liveContests = sortContests(
    mapped.filter(c => c.public_coming_soon !== true)
  ).slice(0, 10);

  const futureContests = sortContests(
    mapped.filter(c => c.public_coming_soon === true)
  ).slice(0, 10);

  return (
    <>
      {/* MOBILE */}
      <div className="md:hidden">
        <MobileHome />
      </div>

      {/* DESKTOP */}
      <div className="hidden md:block bg-white">

        {/* 1 - promotion */}
        <PromotionBanner />

        {/* 2 - optional admin-controlled public game previews */}
        <GamePreviewSection />

        {/* 3 - LIVE CONTESTS */}
        {liveContests.length > 0 && (
          <>
            <CompetitionSection
              title="Live Contests"
              subtitle="Play our live skill contests"
              items={liveContests}
              viewAllHref="/competitions?view=live"
              hideViewAll
            />

            <div className="max-w-7xl mx-auto px-4 lg:px-8 pb-10 flex justify-center">
              <Link
                to="/competitions?view=live"
                className="inline-flex items-center justify-center min-w-[180px] h-12 px-7 rounded-full bg-[#6C2BFF] text-white font-extrabold shadow-lg hover:opacity-90 transition"
                data-testid="home-more-live-contests"
              >
                More Contests &gt;
              </Link>
            </div>
          </>
        )}

        {/* 4 - FUTURE CONTESTS */}
        {futureContests.length > 0 && (
          <>
            <CompetitionSection
              title="Future Contests"
              subtitle="Upcoming Prize League contests"
              items={futureContests}
              viewAllHref="/competitions?view=future"
              hideViewAll
            />

            <div className="max-w-7xl mx-auto px-4 lg:px-8 pb-10 flex justify-center">
              <Link
                to="/competitions?view=future"
                className="inline-flex items-center justify-center min-w-[180px] h-12 px-7 rounded-full bg-[#6C2BFF] text-white font-extrabold shadow-lg hover:opacity-90 transition"
                data-testid="home-more-future-contests"
              >
                More Contests &gt;
              </Link>
            </div>
          </>
        )}

        {/* 5 */}
        <HowToPlaySection compact />

        {/* 6 */}
        <ReferAndEarnCard />

        {/* 7 */}
        <TrustBadges />

      </div>
    </>
  );
}
