const AVATARS = [
  { id: 'male-01', name: 'Trailblazer', gender: 'Male', skin: '#9a5c3c', hair: '#201512', shirt: '#168b64', pants: '#25354f', accent: '#f5c84c', hairStyle: 'curls', item: 'backpack' },
  { id: 'male-02', name: 'Explorer', gender: 'Male', skin: '#f0c49b', hair: '#70452c', shirt: '#b76f31', pants: '#344832', accent: '#f0c359', hairStyle: 'swept', item: 'backpack' },
  { id: 'male-03', name: 'Striker', gender: 'Male', skin: '#6f422e', hair: '#171717', shirt: '#d83e48', pants: '#242b42', accent: '#f5f0e2', hairStyle: 'short', item: 'headband' },
  { id: 'male-04', name: 'Gamer', gender: 'Male', skin: '#db9d78', hair: '#30201c', shirt: '#7048bd', pants: '#272840', accent: '#55dfdb', hairStyle: 'fringe', item: 'headphones' },
  { id: 'male-05', name: 'Astronaut', gender: 'Male', skin: '#d9a987', hair: '#36251e', shirt: '#e5e9f4', pants: '#34415e', accent: '#4bd8e8', hairStyle: 'short', item: 'space' },
  { id: 'male-06', name: 'Knight', gender: 'Male', skin: '#c88762', hair: '#493026', shirt: '#76889c', pants: '#384353', accent: '#f5c84c', hairStyle: 'short', item: 'helmet' },
  { id: 'male-07', name: 'Privateer', gender: 'Male', skin: '#e0b28a', hair: '#4c2b21', shirt: '#8e3040', pants: '#30354c', accent: '#f0cc69', hairStyle: 'long', item: 'bandana' },
  { id: 'male-08', name: 'Scientist', gender: 'Male', skin: '#f1c8a9', hair: '#d3b889', shirt: '#e8e9ee', pants: '#36465b', accent: '#55bcca', hairStyle: 'swept', item: 'glasses' },
  { id: 'male-09', name: 'Musician', gender: 'Male', skin: '#875239', hair: '#161313', shirt: '#e0b337', pants: '#342844', accent: '#e87555', hairStyle: 'curls', item: 'headphones' },
  { id: 'male-10', name: 'Snow Scout', gender: 'Male', skin: '#f0c49b', hair: '#876247', shirt: '#3e769d', pants: '#394257', accent: '#f6f1e7', hairStyle: 'fringe', item: 'beanie' },
  { id: 'male-11', name: 'Builder', gender: 'Male', skin: '#bd805d', hair: '#32231d', shirt: '#e97932', pants: '#334754', accent: '#f6cf46', hairStyle: 'short', item: 'hardhat' },
  { id: 'male-12', name: 'Royal', gender: 'Male', skin: '#815239', hair: '#1e1714', shirt: '#285d49', pants: '#252945', accent: '#f2ca55', hairStyle: 'swept', item: 'crown' },
  { id: 'male-13', name: 'Streetwear', gender: 'Male', skin: '#e3b18d', hair: '#32251f', shirt: '#306cbd', pants: '#252c3b', accent: '#ed5c72', hairStyle: 'fringe', item: 'cap' },
  { id: 'male-14', name: 'Martial Artist', gender: 'Male', skin: '#f0c49b', hair: '#1b1715', shirt: '#f0eee6', pants: '#d8dce2', accent: '#d74745', hairStyle: 'short', item: 'belt' },
  { id: 'male-15', name: 'Robo-Pilot', gender: 'Male', skin: '#aeb9ca', hair: '#576578', shirt: '#697d98', pants: '#303d52', accent: '#59e1d6', hairStyle: 'short', item: 'robot' },
  { id: 'female-01', name: 'Pathfinder', gender: 'Female', skin: '#a96846', hair: '#241815', shirt: '#d66c3f', pants: '#344633', accent: '#edcc56', hairStyle: 'braids', item: 'backpack' },
  { id: 'female-02', name: 'Champion', gender: 'Female', skin: '#f1c8a9', hair: '#9a5e3d', shirt: '#326fbd', pants: '#283b5d', accent: '#f1cb55', hairStyle: 'ponytail', item: 'headband' },
  { id: 'female-03', name: 'Pixel Pro', gender: 'Female', skin: '#774830', hair: '#171414', shirt: '#9b59c8', pants: '#303049', accent: '#55ded5', hairStyle: 'curls', item: 'headphones' },
  { id: 'female-04', name: 'Inventor', gender: 'Female', skin: '#e0b28a', hair: '#50372d', shirt: '#e7e9ef', pants: '#3d5267', accent: '#4ab8c5', hairStyle: 'bob', item: 'glasses' },
  { id: 'female-05', name: 'Crown Keeper', gender: 'Female', skin: '#c98762', hair: '#30201c', shirt: '#27704d', pants: '#332845', accent: '#f2ca55', hairStyle: 'long', item: 'crown' },
];

const EXTRA_NAMES = ['Navigator', 'Ranger', 'Captain', 'Ace', 'Pilot', 'Guardian', 'Sailor', 'Engineer', 'Performer', 'Alpine', 'Architect', 'Duke', 'Urban', 'Champion', 'Cyber', 'Scout', 'Sprinter', 'Coder', 'Researcher', 'Regent'];
const ACTION_PROPS = ['sword', 'guitar', 'microphone', 'shield', 'flute', 'hammer', 'bow', 'saxophone', 'staff', 'controller'];
const decorateAvatar = (avatar, index) => ({
  ...avatar,
  actionProp: ACTION_PROPS[index % ACTION_PROPS.length],
  actionStyle: index % 5,
});
const EXTRA_AVATARS = AVATARS.map((avatar, index) => ({
  ...avatar,
  id: index < 15 ? `male-${String(index + 16).padStart(2, '0')}` : `female-${String(index - 9).padStart(2, '0')}`,
  name: EXTRA_NAMES[index],
  shirt: ['#326a89', '#8e3841', '#b57c28', '#35714c', '#574d85'][index % 5],
  accent: ['#f4cb69', '#e4e9ef', '#80d2cd', '#f09475', '#b5c986'][index % 5],
  actionProp: ACTION_PROPS[(index + 3) % ACTION_PROPS.length],
  actionStyle: (index + 3) % 5,
}));
const LEGACY_AVATARS = [
  { id: 'legacy-classic', name: 'Classic PL', gender: 'Original', actionProp: 'controller', actionStyle: 0 },
  { id: 'legacy-santa', name: 'Santa', gender: 'Original', actionProp: 'staff', actionStyle: 1 },
];

const UNITY_MALE = ['Commoner', 'Blacksmith', 'Cook', 'Healer', 'King', 'Merchant', 'Noble', 'Priest'];
const UNITY_FEMALE = ['Commoner', 'Blacksmith', 'Cook', 'Healer', 'Merchant', 'Noble', 'Nun', 'Queen'];
const UNITY_PROPS = ['sword', 'hammer', 'flute', 'staff', 'sword', 'guitar', 'shield', 'saxophone'];
const UNITY_COLORS = ['#7a3d35', '#40676c', '#9c6736', '#557b50', '#a88a3a', '#53547a', '#8a4d38', '#467d79'];
const UNITY_AVATARS = [
  ...UNITY_MALE.map((name, index) => ({
    id: `unity-male-${String(index + 1).padStart(2, '0')}`,
    name: `Male ${name}`,
    gender: 'Male',
    source: 'unity',
    unityModel: name,
    skin: ['#9a654b', '#e4b28e', '#855339', '#c88762'][index % 4],
    hair: '#30201c',
    shirt: UNITY_COLORS[index],
    pants: '#383d4b',
    accent: ['#d6a64a', '#89bac5', '#d17b3d', '#a4bf73'][index % 4],
    hairStyle: ['short', 'swept', 'curls', 'fringe'][index % 4],
    item: index === 4 ? 'crown' : index === 1 ? 'hardhat' : 'backpack',
    actionProp: UNITY_PROPS[index],
    actionStyle: index % 5,
  })),
  ...UNITY_FEMALE.map((name, index) => ({
    id: `unity-female-${String(index + 1).padStart(2, '0')}`,
    name: `Female ${name}`,
    gender: 'Female',
    source: 'unity',
    unityModel: name,
    skin: ['#a96846', '#f0c49b', '#815239', '#c98762'][index % 4],
    hair: ['#241815', '#9a5e3d', '#171414', '#50372d'][index % 4],
    shirt: UNITY_COLORS[(index + 2) % UNITY_COLORS.length],
    pants: '#344633',
    accent: ['#edcc56', '#80d2cd', '#f09475', '#b5c986'][index % 4],
    hairStyle: ['braids', 'ponytail', 'curls', 'bob'][index % 4],
    item: index === 7 ? 'crown' : index === 1 ? 'headband' : 'backpack',
    actionProp: UNITY_PROPS[(index + 3) % UNITY_PROPS.length],
    actionStyle: index % 5,
  })),
];

export const isUnityFreeWorldAvatar = (avatarId) => String(avatarId || '').startsWith('unity-');
export const UNITY_3D_AVATARS_ENABLED = false;
export const getRenderableFreeWorldAvatarId = (avatarId) => (
  !UNITY_3D_AVATARS_ENABLED && isUnityFreeWorldAvatar(avatarId)
    ? DEFAULT_FREE_WORLD_AVATAR
    : avatarId || DEFAULT_FREE_WORLD_AVATAR
);
export const FREE_WORLD_AVATARS = [...AVATARS.map(decorateAvatar), ...EXTRA_AVATARS, ...LEGACY_AVATARS, ...UNITY_AVATARS];
export const DEFAULT_FREE_WORLD_AVATAR = AVATARS[0].id;
export const getFreeWorldAvatarData = (avatarId) => FREE_WORLD_AVATARS.find((item) => item.id === avatarId) || FREE_WORLD_AVATARS[0];

function Hair({ style, color }) {
  const paths = {
    curls: 'M19 18c-2-8 4-14 13-14s15 6 13 14l-4 3H21z M20 9l-5 3 4 5m25-8 5 4-5 5',
    swept: 'M18 18C16 9 23 4 33 4c8 0 13 5 13 13-7-1-12-5-15-9-2 5-7 8-13 10z',
    short: 'M19 19c-2-8 2-14 12-15 10-1 15 5 14 14l-5 3H22z',
    fringe: 'M18 19c-2-9 4-15 14-15 9 0 14 6 13 15l-6-2-4-7-5 8-4-7-4 9z',
    long: 'M18 20c-2-10 4-16 14-16s16 7 14 17l-2 18h-6l1-20c-4-2-9-2-14 0l1 20h-6z',
    braids: 'M19 19c-2-10 4-15 13-15s15 6 13 16l-5-3-3-8-5 6-5-6-4 10z M19 20l-3 23h5l4-20m20-3 3 23h-5l-4-20',
    ponytail: 'M19 19c-2-10 4-15 13-15s15 6 13 16l-6-3-3-8-5 6-5-6-4 10z M43 15c10 2 9 12 6 17',
    bob: 'M18 19c-2-10 4-15 14-15s16 6 14 17l-2 10h-6l1-18c-5-3-10-3-14 0l1 18h-6z',
  };
  return <path d={paths[style] || paths.short} fill={color} stroke="#171923" strokeWidth="1.7" strokeLinejoin="round" />;
}

function Accessory({ item, accent, hair, back = false }) {
  if (item === 'backpack') return back ? <path d="M13 44v20h7V46m31-2v20h-7V46" fill={accent} stroke="#202332" strokeWidth="2" /> : null;
  if (back) return null;
  if (item === 'headphones') return <><path d="M17 18a15 15 0 0 1 30 0" fill="none" stroke={accent} strokeWidth="4" /><rect x="15" y="17" width="6" height="12" rx="3" fill={accent} /><rect x="43" y="17" width="6" height="12" rx="3" fill={accent} /></>;
  if (item === 'space') return <><ellipse cx="32" cy="19" rx="19" ry="21" fill="none" stroke={accent} strokeWidth="3" /><path d="M18 24q14 11 28 0" fill="none" stroke="#8edee9" strokeWidth="2" /></>;
  if (item === 'helmet') return <path d="M17 18a15 15 0 0 1 30 0v7H17z" fill={accent} stroke="#263247" strokeWidth="2" />;
  if (item === 'bandana') return <path d="M18 15q14-7 28 0l-2 7q-13-5-24 0z" fill={accent} stroke="#252234" strokeWidth="1.5" />;
  if (item === 'glasses') return <path d="M18 20h11l1 6H20zM35 20h11l-2 6H35zM30 22h5" fill="none" stroke={accent} strokeWidth="2" />;
  if (item === 'beanie') return <><path d="M18 17a14 14 0 0 1 28 0v5H18z" fill={accent} stroke="#252234" strokeWidth="1.5" /><path d="M17 21h30" stroke="#fff" strokeWidth="3" /></>;
  if (item === 'hardhat') return <><path d="M17 18a15 15 0 0 1 30 0v4H17z" fill={accent} stroke="#342d22" strokeWidth="1.5" /><path d="M32 6v14" stroke="#fff4b7" strokeWidth="2" /></>;
  if (item === 'crown') return <path d="m18 18 4 4 5-9 5 8 6-8 4 9v5H18z" fill={accent} stroke="#624600" strokeWidth="1.5" />;
  if (item === 'cap') return <><path d="M18 17q14-15 28 0v5H18z" fill={accent} stroke="#202332" strokeWidth="1.5" /><path d="M32 21q14 0 19 5H31" fill={accent} stroke="#202332" strokeWidth="1.5" /></>;
  if (item === 'headband') return <path d="M18 17q14 7 28 0" fill="none" stroke={accent} strokeWidth="4" />;
  if (item === 'belt') return <path d="M20 59h24" stroke={accent} strokeWidth="4" />;
  if (item === 'robot') return <><path d="M19 19a13 13 0 0 1 26 0v4H19z" fill={hair} stroke="#28374b" strokeWidth="2" /><path d="M23 18h4m10 0h4" stroke={accent} strokeWidth="3" strokeLinecap="round" /></>;
  return null;
}

function ActionProp({ type, accent }) {
  if (type === 'sword') return <g fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="m47 55 9-22 3 2-8 22" stroke="#e9f4ff" strokeWidth="3" /><path d="m45 54 7 3m-2-8 4 2" stroke={accent} strokeWidth="3" /></g>;
  if (type === 'shield') return <path d="M8 43 18 39l9 4v11q-3 8-10 11-7-3-9-11z" fill={accent} stroke="#202332" strokeWidth="2" />;
  if (type === 'hammer') return <g stroke="#202332" strokeWidth="2" strokeLinecap="round"><path d="m51 39-10 23" stroke="#75543a" strokeWidth="4" /><path d="m43 34 15 6-4 9-15-6z" fill={accent} /></g>;
  if (type === 'bow') return <g fill="none" strokeLinecap="round"><path d="M12 34q17 13 0 29" stroke={accent} strokeWidth="3" /><path d="M12 34v29m1-14 14-1" stroke="#e8edf5" strokeWidth="1.5" /></g>;
  if (type === 'guitar') return <g stroke="#202332" strokeWidth="1.5"><path d="M45 48q-7-4-9 3l-2 5q-1 5 5 6l5-2q7-2 4-9z" fill={accent} /><path d="m42 49 12-15 3 2-12 15" fill="#8b593b" /><circle cx="40" cy="55" r="2" fill="#fff" /></g>;
  if (type === 'microphone') return <g fill="none" strokeLinecap="round"><path d="m49 48 5 14m-8 2 7-3" stroke="#c5d5e8" strokeWidth="3" /><rect x="46" y="39" width="7" height="12" rx="3.5" fill={accent} stroke="#202332" strokeWidth="1.5" /></g>;
  if (type === 'flute') return <g strokeLinecap="round"><path d="m38 42 21 3" stroke="#f2d077" strokeWidth="4" /><path d="m43 41 1 4m5-3 1 4m5-3 1 4" stroke="#765c2e" strokeWidth="1" /></g>;
  if (type === 'saxophone') return <path d="M47 40v17q0 8 7 7 5-1 3-5m-10-12h6m-6 5h6" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" />;
  if (type === 'staff') return <g fill="none" strokeLinecap="round"><path d="m49 65 4-31" stroke="#8b593b" strokeWidth="4" /><path d="M48 33q5-7 10 0-5 8-10 0" fill={accent} stroke="#fff2ad" strokeWidth="1.5" /></g>;
  if (type === 'controller') return <g stroke="#202332" strokeWidth="1.5"><path d="M40 52q4-6 8 0h8q4-6 7 0l2 9q0 4-4 3l-5-5h-9l-5 5q-4 1-4-3z" fill={accent} /><path d="M46 53v5m-2.5-2.5h5m8-1h.1m3 3h.1" stroke="#fff" strokeWidth="2" /></g>;
  return null;
}

export default function FreeWorldAvatar({ avatarId = DEFAULT_FREE_WORLD_AVATAR, className = '', title, action = 0, style }) {
  if (avatarId === 'legacy-classic') return <svg viewBox="0 0 64 92" data-free-world-avatar-art={avatarId} data-action-prop={action ? 'controller' : undefined} className={className} style={style} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'}><circle cx="32" cy="21" r="13" fill="#ffd23a" stroke="#6b3d00" strokeWidth="3" /><rect x="15" y="35" width="34" height="39" rx="15" fill="#12b3c9" stroke="#ffd54a" strokeWidth="3" /><path d="M24 72v14m16-14v14" stroke="#fff" strokeWidth="7" strokeLinecap="round" /><text x="32" y="59" textAnchor="middle" fill="#052e37" fontSize="12" fontWeight="bold">PL</text>{action > 0 && <ActionProp type="controller" accent="#ffd54a" />}</svg>;
  if (avatarId === 'legacy-santa') return <svg viewBox="0 0 64 92" data-free-world-avatar-art={avatarId} data-action-prop={action ? 'staff' : undefined} className={className} style={style} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'}><path d="M23 70v16m18-16v16" stroke="#222" strokeWidth="9" strokeLinecap="round" /><rect x="13" y="34" width="38" height="42" rx="15" fill="#c52530" /><path d="M15 59h34" stroke="#20202a" strokeWidth="6" /><circle cx="32" cy="23" r="13" fill="#f2bf9e" /><path d="M19 24q13 13 26 0-2 22-13 22T19 24" fill="#fff" /><path d="M18 16q3-16 17-11l12 12" fill="#c52530" stroke="#c52530" strokeWidth="4" /><path d="M18 17h28" stroke="#fff" strokeWidth="6" strokeLinecap="round" /><circle cx="27" cy="21" r="1.5" /><circle cx="37" cy="21" r="1.5" />{action > 0 && <ActionProp type="staff" accent="#ffd54a" />}</svg>;
  const avatar = FREE_WORLD_AVATARS.find((item) => item.id === avatarId) || AVATARS[0];
  return (
    <svg viewBox="0 0 64 92" data-free-world-avatar-art={avatar.id} data-action-prop={action ? avatar.actionProp : undefined} data-avatar-action={action || undefined} className={className} style={style} role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : 'true'}>
      <Accessory item={avatar.item} accent={avatar.accent} hair={avatar.hair} back />
      <path d="M22 42 13 64m29-22 9 22" fill="none" stroke={avatar.shirt} strokeWidth="8" strokeLinecap="round" />
      <path d="M27 67 24 86m13-19 4 19" fill="none" stroke={avatar.pants} strokeWidth="7" strokeLinecap="round" />
      <path d="M19 41q13-8 26 0l-2 28H21z" fill={avatar.shirt} stroke="#202332" strokeWidth="2" />
      <path d="M25 43h14l-2 12H27z" fill={avatar.accent} opacity=".8" />
      <path d="M27 31h10v12H27z" fill={avatar.skin} />
      <ellipse cx="32" cy="20" rx="13" ry="15" fill={avatar.skin} stroke="#202332" strokeWidth="1.7" />
      <Hair style={avatar.hairStyle} color={avatar.hair} />
      <circle cx="27" cy="22" r="1.4" fill="#202332" /><circle cx="37" cy="22" r="1.4" fill="#202332" />
      <path d="M29 28q3 2 6 0" fill="none" stroke="#7c3d37" strokeWidth="1.3" strokeLinecap="round" />
      <Accessory item={avatar.item} accent={avatar.accent} hair={avatar.hair} />
      {action > 0 && <ActionProp type={avatar.actionProp} accent={avatar.accent} />}
      <path d="M20 87h9m8 0h9" stroke="#24283a" strokeWidth="4" strokeLinecap="round" />
      <path d="M18 42q14 7 28 0" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".42" />
    </svg>
  );
}