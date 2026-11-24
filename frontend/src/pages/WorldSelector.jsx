import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/worldSelector.css';
import { WelcomeBanner } from '../components/WelcomeBanner';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { resolveMediaUrl } from '../lib/media';
import { Coins, Gamepad2 } from 'lucide-react';

export default function WorldSelector() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const country = user?.country_access?.country;
  const intl = !!country && country !== 'GB';
  const [selectionImages, setSelectionImages] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('pl-world-selection-design') || 'null'); }
    catch { return null; }
  });

  React.useEffect(() => {
    api.get('/world/public/selection-images').then(response => {
      setSelectionImages(response.data);
      try { localStorage.setItem('pl-world-selection-design', JSON.stringify(response.data)); } catch {}
    }).catch(() => {});
  }, []);

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

  const customWorldImages = Boolean(selectionImages && ['paid', 'free'].some(world =>
    ['mobile', 'tablet', 'desktop'].some(device => Boolean(selectionImages[`${world}_${device}`]))
  ));

  const design = selectionImages || {};
  const pageBackground = design.background_type === 'image' && design.background_image
    ? `url("${resolveMediaUrl(design.background_image)}") center / cover no-repeat, ${design.background_color || '#020611'}`
    : design.background_type === 'solid'
      ? (design.background_color || '#020611')
      : `linear-gradient(135deg, ${design.background_color || '#020611'}, ${design.background_color_2 || '#172033'})`;

  return (
    <main className="world-selector-page" style={customWorldImages ? { background: pageBackground } : undefined}>
      {customWorldImages ? (
        <section className="world-selector-holder-section" data-testid="custom-world-selector">
          <header className={`world-selector-holder-header ${design.fade_direction && design.fade_direction !== 'none' ? `world-title-fade-${design.fade_direction}` : ''}`} style={{ color: design.text_color || '#ffffff', textAlign: design.text_align || 'center' }}>
            <h1 style={{ fontFamily: design.font_family || 'Georgia, serif', fontSize: Number(design.font_size || 48), fontWeight: Number(design.font_weight || 800), fontStyle: design.font_italic ? 'italic' : 'normal', textDecoration: [design.font_underline ? 'underline' : '', design.font_strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none', lineHeight: Number(design.line_height || 1.05), letterSpacing: Number(design.letter_spacing || 0), textTransform: design.heading_case || 'none', opacity: Number(design.text_opacity ?? 100) / 100, display: 'inline-block', padding: `${Number(design.text_padding_y || 0)}px ${Number(design.text_padding_x || 0)}px`, border: design.text_border ? `${Number(design.text_border_width || 1)}px solid ${design.text_border_color || '#fff'}` : undefined, borderRadius: design.text_border ? Number(design.text_border_radius || 0) : undefined, backgroundColor: design.text_highlight ? design.text_highlight_color || '#facc15' : undefined, color: design.text_gradient ? 'transparent' : undefined, backgroundImage: design.text_gradient ? `linear-gradient(90deg, ${design.text_color || '#fff'}, ${design.text_gradient_color || '#facc15'})` : undefined, WebkitBackgroundClip: design.text_gradient ? 'text' : undefined, textShadow: design.text_shadow === false ? 'none' : `0 2px ${Number(design.text_shadow_blur || 8)}px ${design.text_shadow_color || '#000000'}`, WebkitTextStroke: design.text_outline ? `${Number(design.text_outline_width || 1)}px ${design.text_outline_color || '#000000'}` : undefined }}>{design.heading || 'Choose your world'}</h1>
            {design.subheading && <span className="world-selector-subheading" style={{ color: design.accent_color || '#facc15', fontFamily: design.sub_font_family || design.font_family || 'Georgia, serif', fontSize: Number(design.sub_font_size || 22), fontWeight: Number(design.sub_font_weight || 700), fontStyle: design.sub_font_italic ? 'italic' : 'normal', textDecoration: design.sub_font_underline ? 'underline' : 'none', lineHeight: Number(design.sub_line_height || 1.2), letterSpacing: Number(design.sub_letter_spacing || 0) }}>{design.subheading}</span>}
          </header>
          <div className="world-selector-custom-grid">
            {['paid', 'free'].map(world => {
              const paid = world === 'paid';
              const Icon = paid ? Coins : Gamepad2;
              const image = selectionImages[`${world}_desktop`] || selectionImages[`${world}_tablet`] || selectionImages[`${world}_mobile`];
              return (
                <button key={world} type="button" onClick={paid ? enterPaid : enterFree} className={`world-selector-holder world-selector-holder-${world}`} aria-label={paid ? 'Enter Paid Leagues' : 'Enter Free World'}>
                  <div className="world-selector-holder-image">
                    {image ? (
                      <picture>
                        <source media="(max-width: 767px)" srcSet={resolveMediaUrl(selectionImages[`${world}_mobile`] || image)} />
                        <source media="(max-width: 1199px)" srcSet={resolveMediaUrl(selectionImages[`${world}_tablet`] || image)} />
                        <img src={resolveMediaUrl(image)} alt={paid ? 'Paid Leagues artwork' : 'Free World artwork'} draggable="false" />
                      </picture>
                    ) : <div className="world-selector-empty-holder"><Icon /></div>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="world-selector-artwork">
          <picture>
            <source media="(max-width: 767px)" srcSet="/world-selector/choose-world-mobile.webp" />
            <source media="(max-width: 1199px)" srcSet="/world-selector/choose-world-tablet.webp" />
            <img src="/world-selector/choose-world-desktop.webp" alt="Choose between Prize League Paid Leagues and Free World" className="world-selector-image" draggable="false" />
          </picture>
          {intl && <div className="world-selector-intl-ribbon" data-testid="world-selector-intl-ribbon"><i>✦</i> Play free • Climb the leaderboards <i>✦</i></div>}
          <button type="button" className="world-selector-hit world-selector-paid" onClick={enterPaid} aria-label="Enter Paid Leagues" title="Enter Paid Leagues" />
          <button type="button" className="world-selector-hit world-selector-free" onClick={enterFree} aria-label="Enter Free World" title="Enter Free World" />
        </div>
      )}
      <WelcomeBanner />
    </main>
  );
}
