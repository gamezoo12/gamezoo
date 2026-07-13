import { useEffect, useState } from 'react';
import HeroBanner from '../components/home/HeroBanner';
import WinnersTicker from '../components/home/WinnersTicker';
import StatsBar from '../components/home/StatsBar';
import CompetitionSection from '../components/home/CompetitionSection';
import HowItWorks from '../components/home/HowItWorks';
import TrustBadges from '../components/home/TrustBadges';
import ReferralPromo from '../components/home/ReferralPromo';
import { contestsAPI } from '../lib/api';

export default function Home() {
  const [contests, setContests] = useState([]);
  useEffect(() => { contestsAPI.list().then(setContests).catch(() => {}); }, []);
  const mapped = contests.map(c => ({
    id: c.contest_id, slug: c.slug, title: c.title, subtitle: c.subtitle,
    category: c.category, tag: c.tag, price: c.price,
    ticketsSold: c.tickets_sold, ticketsTotal: c.tickets_total,
    prizeAmount: c.prize_amount, endDate: c.end_date, image: c.image,
    jackpot: c.jackpot, featured: c.featured,
  }));
  const endingSoon = [...mapped].sort((a,b) => new Date(a.endDate) - new Date(b.endDate)).slice(0, 4);
  const newGames = mapped.filter(c => c.category === 'new-games').slice(0, 4);
  const jackpot = mapped.filter(c => c.jackpot).slice(0, 4);
  const instantWin = mapped.filter(c => c.category === 'instant-wins').slice(0, 4);
  const prizeDraws = mapped.filter(c => c.category === 'prize-draws').slice(0, 4);

  return (
    <>
      <HeroBanner />
      <WinnersTicker />
      <StatsBar />
      {endingSoon.length > 0 && <CompetitionSection title="Ending Soon…" subtitle="Don't miss out" items={endingSoon} viewAllHref="/competitions" />}
      {jackpot.length > 0 && <CompetitionSection title="Jackpot Contests…" subtitle="Bigger prizes" items={jackpot} accent="amber" viewAllHref="/competitions" />}
      <ReferralPromo />
      {instantWin.length > 0 && <CompetitionSection title="Instant Wins…" subtitle="Win right now" items={instantWin} accent="orange" viewAllHref="/competitions" />}
      {prizeDraws.length > 0 && <CompetitionSection title="Prize Draws…" subtitle="Live draws" items={prizeDraws} viewAllHref="/competitions" />}
      {newGames.length > 0 && <CompetitionSection title="New Games…" subtitle="Fresh drops" items={newGames} accent="orange" viewAllHref="/competitions" />}
      <div id="how-it-works"><HowItWorks /></div>
      <TrustBadges />
    </>
  );
}
