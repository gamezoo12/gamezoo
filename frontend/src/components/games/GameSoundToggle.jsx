import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { gameSoundEnabled, setGameSoundEnabled } from '../../lib/gameExperience';

export default function GameSoundToggle({ className = '' }) {
  const [enabled, setEnabled] = useState(gameSoundEnabled);
  useEffect(() => {
    const sync = () => setEnabled(gameSoundEnabled());
    window.addEventListener('pl-game-sound-change', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('pl-game-sound-change', sync); window.removeEventListener('storage', sync); };
  }, []);
  const toggle = () => {
    setGameSoundEnabled(!enabled);
    setEnabled(!enabled);
  };
  return <button type="button" onClick={toggle} aria-pressed={enabled} aria-label={enabled ? 'Turn game sounds off' : 'Turn game sounds on'} title={enabled ? 'Sound on' : 'Sound off'} data-testid="game-sound-toggle" className={`inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 ${className}`}>
    {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}{enabled ? 'Sound on' : 'Sound off'}
  </button>;
}
