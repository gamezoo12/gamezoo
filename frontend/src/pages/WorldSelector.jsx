import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/worldSelector.css';
import { WelcomeBanner } from '../components/WelcomeBanner';
import { useAuth } from '../context/AuthContext';

export default function WorldSelector() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const country = user?.country_access?.country;
  const intl = !!country && country !== 'GB';

  // Prefetch the heavy world chunks while the user is choosing, so the map
  // opens instantly on click instead of downloading its chunk first.
  React.useEffect(() => {
    import('../world/PrizeLeagueWorld');
    import('./Home');
  }, []);

  const enterPaid = () => {
    navigate('/paid-leagues');
  };

  const enterFree = () => {
    navigate('/world');
  };

  return (
    <main className="world-selector-page">
      <div className="world-selector-artwork">

        <picture>
          <source
            media="(max-width: 767px)"
            srcSet="/world-selector/choose-world-mobile.webp"
          />

          <source
            media="(max-width: 1199px)"
            srcSet="/world-selector/choose-world-tablet.webp"
          />

          <img
            src="/world-selector/choose-world-desktop.webp"
            alt="Choose between Prize League Paid Leagues and Free World"
            className="world-selector-image"
            draggable="false"
          />
        </picture>

        {intl && (
          <div className="world-selector-intl-ribbon" data-testid="world-selector-intl-ribbon">
            <i>✦</i> Play free • Climb the leaderboards <i>✦</i>
          </div>
        )}

        <button
          type="button"
          className="world-selector-hit world-selector-paid"
          onClick={enterPaid}
          aria-label="Enter Paid Leagues"
          title="Enter Paid Leagues"
        />

        <button
          type="button"
          className="world-selector-hit world-selector-free"
          onClick={enterFree}
          aria-label="Enter Free World"
          title="Enter Free World"
        />

      </div>
      <WelcomeBanner />
    </main>
  );
}
