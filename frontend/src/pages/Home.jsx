import HeroBanner from '../components/home/HeroBanner';
import StatsBar from '../components/home/StatsBar';
import CompetitionSection from '../components/home/CompetitionSection';
import HowItWorks from '../components/home/HowItWorks';
import SpinWheel from '../components/home/SpinWheel';
import WinnersGallery from '../components/home/WinnersGallery';
import Stories from '../components/home/Stories';
import Reviews from '../components/home/Reviews';
import TrustBadges from '../components/home/TrustBadges';
import { COMPETITIONS } from '../mock/mockData';

export default function Home() {
  const endingSoon = [...COMPETITIONS].sort((a,b) => new Date(a.endDate) - new Date(b.endDate)).slice(0, 4);
  const newGames = COMPETITIONS.slice(4, 8);
  const jackpot = COMPETITIONS.filter((c) => c.jackpot);
  const instantWin = COMPETITIONS.filter((c) => c.category === 'instant-wins');
  const prizeDraws = COMPETITIONS.filter((c) => c.category === 'prize-draws');

  return (
    <>
      <HeroBanner />
      <StatsBar />
      <CompetitionSection title="Ending Soon…" subtitle="Don't miss out" items={endingSoon} viewAllHref="/competitions?sort=ending" />
      <CompetitionSection title="New Games…" subtitle="Fresh drops" items={newGames} accent="orange" viewAllHref="/competitions?filter=new" />
      <SpinWheel />
      <CompetitionSection title="Jackpot Prizes…" subtitle="The big ones" items={jackpot} accent="amber" viewAllHref="/competitions?filter=jackpot" />
      <CompetitionSection title="Instant Win Competitions…" subtitle="Win right now" items={instantWin} accent="orange" viewAllHref="/competitions?filter=instant" />
      <CompetitionSection title="Prize Draw Competitions…" subtitle="Live draws" items={prizeDraws} viewAllHref="/competitions?filter=draws" />
      <HowItWorks />
      <TrustBadges />
      <WinnersGallery />
      <Reviews />
      <Stories />
    </>
  );
}
