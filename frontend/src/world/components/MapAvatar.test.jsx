import { act } from 'react';
import { createRoot } from 'react-dom/client';
import MapAvatar from './MapAvatar';

jest.mock('./RiggedFreeWorldAvatar', () => {
  const React = require('react');
  const propsByAvatar = { 'male-01': 'sword', 'male-02': 'guitar', 'female-01': 'sword', 'unity-male-01': 'sword' };
  return {
    __esModule: true,
    default: ({ avatarId, action, className, testId }) => React.createElement('div', {
      className,
      'data-testid': testId,
      'data-action-prop': action ? propsByAvatar[avatarId] : undefined,
    }),
  };
});

let container;
let root;

beforeEach(() => {
  jest.useFakeTimers();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

test('cycles actions on taps and opens the picker after a three second hold', () => {
  const onChoose = jest.fn();
  act(() => root.render(<MapAvatar avatarId="male-02" onChoose={onChoose} />));
  const button = container.querySelector('button');
  act(() => button.click());
  expect(container.querySelector('.pl-map-avatar-action-1')).not.toBeNull();
  expect(container.querySelector('[data-action-prop="guitar"]')).not.toBeNull();
  act(() => button.click());
  expect(container.querySelector('.pl-map-avatar-action-2')).not.toBeNull();
  act(() => button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
  act(() => jest.advanceTimersByTime(2999));
  expect(onChoose).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1));
  expect(onChoose).toHaveBeenCalledTimes(1);
  act(() => button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
  act(() => button.click());
  expect(container.querySelector('.pl-map-avatar-action-2')).not.toBeNull();
});

test('cancels a hold when the pointer leaves', () => {
  const onChoose = jest.fn();
  act(() => root.render(<MapAvatar avatarId="male-01" onChoose={onChoose} />));
  const button = container.querySelector('button');
  act(() => button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
  act(() => button.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })));
  act(() => jest.advanceTimersByTime(3000));
  expect(onChoose).not.toHaveBeenCalled();
});

test('switching avatars clears the previous action prop', () => {
  act(() => root.render(<MapAvatar avatarId="male-02" />));
  act(() => container.querySelector('button').click());
  expect(container.querySelector('[data-action-prop="guitar"]')).not.toBeNull();
  act(() => root.render(<MapAvatar avatarId="female-01" />));
  expect(container.querySelector('[data-action-prop]')).toBeNull();
});

test('a hold without a following click does not swallow the next tap', () => {
  act(() => root.render(<MapAvatar avatarId="male-02" onChoose={jest.fn()} />));
  const button = container.querySelector('button');
  act(() => button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
  act(() => jest.advanceTimersByTime(3000));
  act(() => button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
  act(() => jest.advanceTimersByTime(0));
  act(() => button.click());
  expect(container.querySelector('[data-action-prop="guitar"]')).not.toBeNull();
});

test('Unity IDs fall back to the default 2D renderer while 3D is paused', () => {
  act(() => root.render(<MapAvatar avatarId="unity-male-01" />));
  expect(container.querySelector('[data-testid="map-avatar-3d"]')).toBeNull();
  expect(container.querySelector('[data-free-world-avatar-art="male-01"]')).not.toBeNull();
  act(() => root.render(<MapAvatar avatarId="male-01" />));
  expect(container.querySelector('[data-free-world-avatar-art="male-01"]')).not.toBeNull();
});