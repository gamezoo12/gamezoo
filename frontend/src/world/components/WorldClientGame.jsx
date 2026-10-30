import { Clock3 } from 'lucide-react';
import { GAME_MAP } from '../../components/games';
import { GAME_CATALOG } from '../../lib/gameCatalog';
import { gameExperienceFor, playGameSound } from '../../lib/gameExperience';
import GameSoundToggle from '../../components/games/GameSoundToggle';

export const isWorldClientGame = (gameId) => Boolean(gameId && gameId !== 'number_sequence' && GAME_MAP[gameId]);

export function WorldClientGame({ gameId, config = {}, label, onComplete, onSkip, busy, timerText, timerCaption, practice = false }) {
  const name = GAME_CATALOG.find((g) => g.id === gameId)?.label || gameId;
  const guide = gameExperienceFor(gameId);
  const finish = (result) => {
    if (practice) playGameSound(result?.solved ? 'success' : 'failure');
    onComplete(result || {});
  };
  return (
    <div className="fwv3-overlay fwv3-play-overlay" data-testid={`world-client-game-${gameId}`}>
      <section className="fwv3-card fwv3-play-card" style={{ maxWidth: 760, width: '100%' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="fwv3-mode-label">{label}</div>
          <GameSoundToggle className="py-1 text-xs" />
        </div>
        <h2 style={{ fontWeight: 900, fontSize: 20, margin: '6px 0' }}>{name}</h2>
        {guide && <p className="mb-2 text-sm text-slate-600">{guide.objective}</p>}
        <div className="fwv3-timer" data-testid={practice ? 'world-client-practice-stopwatch' : 'world-client-stopwatch'}>
          <Clock3 />
          <strong>{timerText}</strong>
        </div>
        <div className="fwv3-timer-caption">{timerCaption}</div>
        <div onPointerDownCapture={() => playGameSound('tap')} style={{ background: '#fff', color: '#0f172a', borderRadius: 16, padding: 12, opacity: busy ? 0.6 : 1 }}>
          {GAME_MAP[gameId](config, (result) => !busy && finish(result))}
        </div>
        {onSkip && <button type="button" onClick={onSkip} className="fwv3-secondary" style={{ marginTop: 12 }} data-testid="world-client-game-skip">Skip practice</button>}
      </section>
    </div>
  );
}
