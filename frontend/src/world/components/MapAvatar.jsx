import { useEffect, useRef, useState } from 'react';
import RiggedFreeWorldAvatar from './RiggedFreeWorldAvatar';
import FreeWorldAvatar, { FREE_WORLD_AVATARS, getRenderableFreeWorldAvatarId, isUnityFreeWorldAvatar, UNITY_3D_AVATARS_ENABLED } from './FreeWorldAvatar';

export default function MapAvatar({ avatarId, onChoose, walking = false }) {
  const [action, setAction] = useState(0);
  const renderedAvatarId = getRenderableFreeWorldAvatarId(avatarId);
  const avatarIndex = Math.max(0, FREE_WORLD_AVATARS.findIndex((avatar) => avatar.id === renderedAvatarId));
  const avatarStyle = FREE_WORLD_AVATARS[avatarIndex]?.actionStyle || 0;
  const tilt = 8 + ((avatarIndex * 7) % 20);
  const lift = 7 + ((avatarIndex * 3) % 9);
  const timer = useRef(null);
  const held = useRef(false);
  const cancel = () => { clearTimeout(timer.current); timer.current = null; };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    setAction(0);
    held.current = false;
    cancel();
  }, [avatarId]);
  const release = () => {
    cancel();
    if (held.current) timer.current = setTimeout(() => { held.current = false; timer.current = null; }, 0);
  };

  return (
    <button type="button" className="pl-map-avatar-control" aria-label="Your avatar" title="Tap for an action; hold to change avatar"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        held.current = false;
        cancel();
        timer.current = setTimeout(() => { held.current = true; onChoose?.(); }, 3000);
      }}
      onPointerUp={release} onPointerCancel={release} onPointerLeave={release}
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => { if (!held.current) setAction((current) => current + 1); held.current = false; }}>
      {UNITY_3D_AVATARS_ENABLED && isUnityFreeWorldAvatar(renderedAvatarId)
        ? <RiggedFreeWorldAvatar avatarId={renderedAvatarId} action={action} walking={walking} view="map" className={`pl-map-avatar-art ${action ? `pl-map-avatar-action-${(action - 1 + avatarStyle) % 5}` : ''}`} style={{ '--avatar-action-tilt': `${tilt}deg`, '--avatar-action-lift': `${lift}px` }} testId="map-avatar-3d" />
        : <FreeWorldAvatar avatarId={renderedAvatarId} action={action} className={`pl-map-avatar-art ${action ? `pl-map-avatar-action-${(action - 1 + avatarStyle) % 5}` : ''}`} style={{ '--avatar-action-tilt': `${tilt}deg`, '--avatar-action-lift': `${lift}px` }} />}
    </button>
  );
}