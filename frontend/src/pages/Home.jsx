import { useEffect, useState } from 'react';
import HeroBanner from '../components/home/HeroBanner';
import CompetitionSection from '../components/home/CompetitionSection';
import HowToPlaySection from '../components/home/HowToPlaySection';
import LeaderboardPreview from '../components/home/LeaderboardPreview';
import ReferAndEarnCard from '../components/home/ReferAndEarnCard';
import TrustBadges from '../components/home/TrustBadges';
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
      <HeroBanner contests={contests} />
      {featured.length > 0 && (
        <CompetitionSection title="Featured Contests" subtitle="Handpicked for you" items={featured} viewAllHref="/competitions" />
      )}
      <HowToPlaySection compact />
      <LeaderboardPreview />
      <ReferAndEarnCard />
      <TrustBadges />
    </>
  );
}
