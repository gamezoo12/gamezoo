import HeroBanner from '../components/home/HeroBanner';
import StatsBar from '../components/home/StatsBar';
import CompetitionSection from '../components/home/CompetitionSection';
import HowItWorks from '../components/home/HowItWorks';
import SpinWheel from '../components/home/SpinWheel';
import TrustBadges from '../components/home/TrustBadges';
import { COMPETITIONS } from '../mock/mockData';

export default function Home() {
  const endingSoon = [...COMPETITIONS].sort((a,b) => new Date(a.endDate) - new Date(b.endDate)).slice(0, 4);
  const newGames = COMPETITIONS.filter(c => c.category === 'new-games').slice(0, 4);
  const jackpot = COMPETITIONS.filter(c => c.jackpot).slice(0, 4);
  const instantWin = COMPETITIONS.filter(c => c.category === 'instant-wins').slice(0, 4);
  const prizeDraws = COMPETITIONS.filter(c => c.category === 'prize-draws').slice(0, 4);

  return (
    <>
      <HeroBanner />
      <StatsBar />
      <CompetitionSection title="Ending Soon…" subtitle="Don't miss out" items={endingSoon} viewAllHref="/competitions?sort=ending" />
      <CompetitionSection title="Jackpot Contests…" subtitle="Bigger prizes" items={jackpot} accent="amber" viewAllHref="/competitions?filter=jackpot" />
      <SpinWheel />
      <CompetitionSection title="Instant Wins…" subtitle="Win right now" items={instantWin} accent="orange" viewAllHref="/competitions?filter=instant" />
      <CompetitionSection title="Prize Draws…" subtitle="Live draws" items={prizeDraws} viewAllHref="/competitions?filter=draws" />
      <CompetitionSection title="New Games…" subtitle="Fresh drops" items={newGames} accent="orange" viewAllHref="/competitions?filter=new" />
      <div id="how-it-works"><HowItWorks /></div>
      <TrustBadges />
    </>
  );
}
