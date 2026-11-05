import { useEffect, useState } from 'react';
import { Music, Music2, Volume2, VolumeX } from 'lucide-react';
import { gameSoundEnabled, playGameSound, setGameSoundEnabled } from '../../lib/gameExperience';
import { musicEnabled, setMusicEnabled, startMusic, stopMusic } from '../../lib/music';

const useFlag = (get, evt) => { const [on, setOn] = useState(get()); useEffect(() => { const h = () => setOn(get()); window.addEventListener(evt, h); return () => window.removeEventListener(evt, h); }, [get, evt]); return on; };
const cls = (on) => `flex h-8 w-8 shrink-0 items-center justify-center rounded-full backdrop-blur transition-colors ${on ? 'bg-black/50 text-white' : 'bg-rose-500/80 text-white'}`;

// Sound effects + background music switches, shown in every game.
export function MusicToggle() {
  const music = useFlag(musicEnabled, 'pl-game-music-change');
  return <button type="button" onClick={() => setMusicEnabled(!music)} className={cls(music)} aria-label={music ? 'Turn music off' : 'Turn music on'} data-testid="music-toggle">{music ? <Music className="h-4 w-4" /> : <Music2 className="h-4 w-4 opacity-60" />}</button>;
}
// Plays the world's music loop while mounted.
export function GameMusic({ world = 0 }) {
  useEffect(() => { startMusic(world); return () => stopMusic(); }, [world]);
  return null;
}
export function SoundControls() {
  const sound = useFlag(gameSoundEnabled, 'pl-game-sound-change');
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => { setGameSoundEnabled(!sound); if (!sound) setTimeout(() => playGameSound('chime'), 0); }} className={cls(sound)} aria-label={sound ? 'Mute sound effects' : 'Turn sound effects on'} data-testid="party-sound-toggle">{sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
      <MusicToggle />
    </div>
  );
}
