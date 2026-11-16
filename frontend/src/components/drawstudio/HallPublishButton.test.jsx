import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { drawStudioAPI } from '../../lib/api';
import { HallPublishButton } from './HallPublishButton';

jest.mock('../../lib/api', () => ({ drawStudioAPI: { announceAll: jest.fn(), publishHall: jest.fn() } }));

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  drawStudioAPI.announceAll.mockResolvedValue({ announcement_id: 'announcement-1' });
  drawStudioAPI.publishHall.mockResolvedValue({ ok: true });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('completed draw can be announced and published from the main screen', async () => {
  const onDone = jest.fn();
  await act(async () => root.render(<HallPublishButton plan={{ plan_id: 'plan-1', status: 'completed' }} onDone={onDone} />));
  expect(container.textContent).toContain('Publish winners');
  await act(async () => container.querySelector('button').click());
  expect(drawStudioAPI.announceAll).toHaveBeenCalledWith('plan-1');
  expect(drawStudioAPI.publishHall).toHaveBeenCalledWith('plan-1');
  expect(onDone).toHaveBeenCalled();
  expect(container.querySelector('button').disabled).toBe(true);
});

test('Hall visibility alone does not prevent announcing unpublished winners', async () => {
  await act(async () => root.render(<HallPublishButton plan={{ plan_id: 'plan-1', status: 'completed', hall_published: true }} />));
  expect(container.querySelector('button').disabled).toBe(false);
  await act(async () => container.querySelector('button').click());
  expect(drawStudioAPI.announceAll).toHaveBeenCalledWith('plan-1');
  expect(drawStudioAPI.publishHall).toHaveBeenCalledWith('plan-1');
});

test('completed promotion announces winners without calling the Paid World Hall endpoint', async () => {
  const onDone = jest.fn();
  await act(async () => root.render(<HallPublishButton plan={{ plan_id: 'promo-1', status: 'completed', contest_kind: 'promotion' }} onDone={onDone} />));
  await act(async () => container.querySelector('button').click());
  expect(drawStudioAPI.announceAll).toHaveBeenCalledWith('promo-1');
  expect(drawStudioAPI.publishHall).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledWith({ promotion: true });
});

test('an unfinished draw has no publish action', async () => {
  await act(async () => root.render(<HallPublishButton plan={{ plan_id: 'plan-1', status: 'in_progress' }} />));
  expect(container.querySelector('button')).toBeNull();
});

test('an announced draw publishes without re-announcing', async () => {
  await act(async () => root.render(<HallPublishButton plan={{ plan_id: 'plan-1', status: 'completed', announcement_id: 'ann-1' }} />));
  await act(async () => container.querySelector('button').click());
  expect(drawStudioAPI.announceAll).not.toHaveBeenCalled();
  expect(drawStudioAPI.publishHall).toHaveBeenCalledWith('plan-1');
});

test('announcement failure is shown and does not publish to the Hall', async () => {
  const onError = jest.fn();
  drawStudioAPI.announceAll.mockRejectedValue({ response: { data: { detail: 'Please complete every round' } } });
  await act(async () => root.render(<HallPublishButton plan={{ plan_id: 'plan-1', status: 'completed' }} onError={onError} />));
  await act(async () => container.querySelector('button').click());
  expect(onError).toHaveBeenCalledWith('Please complete every round');
  expect(drawStudioAPI.publishHall).not.toHaveBeenCalled();
  expect(container.querySelector('button').disabled).toBe(false);
});