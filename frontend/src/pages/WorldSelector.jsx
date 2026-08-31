import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/worldSelector.css';

export default function WorldSelector() {
  const navigate = useNavigate();

  const enterPaid = () => {
    navigate('/');
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
    </main>
  );
}