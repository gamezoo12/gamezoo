import { GAME_MAP } from '../../components/games';
import { GAME_CATALOG } from '../../lib/gameCatalog';

export const isWorldClientGame = (gameId) => Boolean(gameId && gameId !== 'number_sequence' && GAME_MAP[gameId]);

export function WorldClientGame({ gameId, label, onComplete, onSkip, busy }) {
  const name = GAME_CATALOG.find((g) => g.id === gameId)?.label || gameId;
  return (
    <div className="fwv3-overlay fwv3-play-overlay" data-testid={`world-client-game-${gameId}`}>
      <section className="fwv3-card fwv3-play-card" style={{ maxWidth: 720, width: '100%' }}>
        <div className="fwv3-mode-label">{label}</div>
        <h2 style={{ fontWeight: 900, fontSize: 20, margin: '6px 0 12px' }}>{name}</h2>
        <div style={{ background: '#fff', color: '#0f172a', borderRadius: 16, padding: 12, opacity: busy ? 0.6 : 1 }}>
          {GAME_MAP[gameId]({}, (result) => !busy && onComplete(result || {}))}
        </div>
        {onSkip && <button type="button" onClick={onSkip} className="fwv3-secondary" style={{ marginTop: 12 }} data-testid="world-client-game-skip">Skip practice</button>}
      </section>
    </div>
  );
}
