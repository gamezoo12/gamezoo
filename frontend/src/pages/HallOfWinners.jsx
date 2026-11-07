import WinnersHall from '../components/winners/WinnersHall';

export default function HallOfWinners() {
  return (
    <div className="min-h-screen bg-[#0b0716] px-3 py-6 sm:px-6" data-testid="hall-of-winners-page">
      <div className="mx-auto max-w-6xl">
        <WinnersHall />
      </div>
    </div>
  );
}
