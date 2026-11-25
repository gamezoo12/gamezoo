import { act } from 'react';
import { createRoot } from 'react-dom/client';
import FreeWorldAvatarPicker from './FreeWorldAvatarPicker';

jest.mock('./RiggedFreeWorldAvatar', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ avatarId, testId }) => React.createElement('div', { 'data-testid': testId, 'data-avatar-id': avatarId }),
  };
});
import { FREE_WORLD_AVATARS } from './FreeWorldAvatar';

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test('preserves the original 42 2D avatars and adds 16 Unity 3D avatars', () => {
  expect(FREE_WORLD_AVATARS).toHaveLength(58);
  expect(FREE_WORLD_AVATARS.filter((avatar) => !avatar.source)).toHaveLength(42);
  expect(FREE_WORLD_AVATARS.filter((avatar) => avatar.source === 'unity')).toHaveLength(16);
  expect(FREE_WORLD_AVATARS.filter((avatar) => !avatar.source && avatar.gender === 'Male')).toHaveLength(30);
  expect(FREE_WORLD_AVATARS.filter((avatar) => !avatar.source && avatar.gender === 'Female')).toHaveLength(10);
  expect(FREE_WORLD_AVATARS.map((avatar) => avatar.id)).toEqual(expect.arrayContaining(['legacy-classic', 'legacy-santa']));
  expect(FREE_WORLD_AVATARS.map((avatar) => avatar.id)).toEqual(expect.arrayContaining(['unity-male-08', 'unity-female-08']));
});

test('player can choose an existing 2D avatar while 3D options are paused', async () => {
  const onSelect = jest.fn();
  const offers = FREE_WORLD_AVATARS.map((avatar) => ({ avatar_id: avatar.id, released: true, price_type: 'free', price: 0 }));
  await act(async () => root.render(<FreeWorldAvatarPicker avatarId="male-01" offers={offers} onSelect={onSelect} />));
  await act(async () => document.querySelector('[data-testid="free-world-avatar-picker-open"]').click());

  expect(document.querySelectorAll('[data-testid^="free-world-avatar-option-"]')).toHaveLength(42);
  expect(document.querySelector('[data-testid="free-world-avatar-select-unity-female-08"]')).toBeNull();
  expect(document.querySelector('[data-testid^="free-world-avatar-download-"]')).toBeNull();
  expect(document.querySelector('[data-free-world-avatar-art="male-01"]')).not.toBeNull();
  await act(async () => document.querySelector('[data-testid="free-world-avatar-select-female-05"]').click());
  expect(onSelect).not.toHaveBeenCalled();
  expect(document.querySelector('[data-testid="free-world-avatar-picker"]')).not.toBeNull();
  await act(async () => document.querySelector('[data-testid="free-world-avatar-confirm"]').click());

  expect(onSelect).toHaveBeenCalledWith('female-05');
  expect(document.querySelector('[data-testid="free-world-avatar-picker"]')).toBeNull();
});

test('a saved Unity selection falls back to the default 2D preview while 3D is paused', async () => {
  const offers = FREE_WORLD_AVATARS.map((avatar) => ({ avatar_id: avatar.id, released: true, price_type: 'free', price: 0 }));
  await act(async () => root.render(<FreeWorldAvatarPicker avatarId="unity-female-08" offers={offers} onSelect={jest.fn()} />));
  await act(async () => document.querySelector('[data-testid="free-world-avatar-picker-open"]').click());
  expect(document.querySelector('[data-testid="free-world-avatar-select-unity-female-08"]')).toBeNull();
  expect(document.querySelector('[data-testid="avatar-picker-stage"] [data-free-world-avatar-art="male-01"]')).not.toBeNull();
});

test('paid avatars require the purchase action before they can be selected', async () => {
  const onSelect = jest.fn();
  const onPurchase = jest.fn().mockResolvedValue({ owned_avatar_ids: ['male-01', 'female-01'] });
  const offers = [
    { avatar_id: 'male-01', released: true, price_type: 'free', price: 0 },
    { avatar_id: 'female-01', released: true, price_type: 'bonus_tokens', price: 25 },
  ];
  await act(async () => root.render(<FreeWorldAvatarPicker avatarId="male-01" offers={offers} ownedAvatarIds={['male-01']} isAuthenticated onSelect={onSelect} onPurchase={onPurchase} />));
  await act(async () => document.querySelector('[data-testid="free-world-avatar-picker-open"]').click());

  const paidSelect = document.querySelector('[data-testid="free-world-avatar-select-female-01"]');
  expect(paidSelect.disabled).toBe(false);
  await act(async () => paidSelect.click());
  expect(document.querySelector('[data-testid="free-world-avatar-confirm"]').disabled).toBe(true);
  expect(document.querySelector('[data-testid="free-world-avatar-buy-female-01"]').textContent).toContain('25 Bonus Tokens');
  await act(async () => document.querySelector('[data-testid="free-world-avatar-buy-female-01"]').click());

  expect(onPurchase).toHaveBeenCalledWith('female-01');
  expect(onSelect).not.toHaveBeenCalled();
});

test('keeps current and previously selected avatars visible after withdrawal', async () => {
  await act(async () => root.render(<FreeWorldAvatarPicker avatarId="male-02" offers={[]} previousAvatarIds={['female-01']} onSelect={jest.fn()} />));
  await act(async () => document.querySelector('[data-testid="free-world-avatar-picker-open"]').click());
  expect(document.querySelector('[data-testid="free-world-avatar-select-male-02"]').disabled).toBe(false);
  expect(document.querySelector('[data-testid="free-world-avatar-select-female-01"]').disabled).toBe(false);
});