import useProfileImage from '../lib/useProfileImage';
import FreeWorldAvatar from '../world/components/FreeWorldAvatar';

export default function UserAvatar({ user, size = 'h-8 w-8', className = '', testId }) {
  const image = useProfileImage(user?.profile_image_url);
  const name = user?.name || user?.email || 'User';
  if (image) {
    return <img src={image} alt={`${name}'s profile`} draggable="false" onContextMenu={(event) => event.preventDefault()} className={`${size} shrink-0 rounded-full object-cover select-none ${className}`} data-testid={testId} />;
  }
  if (user?.free_world_avatar_id) {
    return <span className={`${size} shrink-0 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden ${className}`} aria-label={`${name}'s profile`} data-testid={testId}><FreeWorldAvatar avatarId={user.free_world_avatar_id} className="h-full w-full" /></span>;
  }
  return (
    <span className={`${size} shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-indigo-700 text-white text-xs font-bold flex items-center justify-center select-none ${className}`} aria-label={`${name}'s profile`} data-testid={testId}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}