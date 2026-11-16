import { api, signupChallengeAPI, signupChallengeAdminAPI } from './api';

afterEach(() => jest.restoreAllMocks());

test('signup challenge player methods call the expected routes', async () => {
  const post = jest.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
  await signupChallengeAPI.start('request-123');
  expect(post).toHaveBeenLastCalledWith('/signup-challenge/attempts/start', { request_id: 'request-123' });
  await signupChallengeAPI.event('demo_start', { game: 'memory' });
  expect(post).toHaveBeenLastCalledWith('/signup-challenge/event', { type: 'demo_start', meta: { game: 'memory' } });
  await signupChallengeAPI.submit('attempt-1', { finished: true });
  expect(post).toHaveBeenLastCalledWith('/signup-challenge/attempts/attempt-1/submit', { finished: true });
});

test('signup challenge admin methods call the expected routes', async () => {
  const post = jest.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
  const get = jest.spyOn(api, 'get').mockResolvedValue({ data: { ok: true } });
  await signupChallengeAdminAPI.setStatus('challenge-1', 'published');
  expect(post).toHaveBeenLastCalledWith('/admin/signup-challenge/challenges/challenge-1/status', { status: 'published' });
  await signupChallengeAdminAPI.analytics('challenge-1', { source: 'email' });
  expect(get).toHaveBeenLastCalledWith('/admin/signup-challenge/challenges/challenge-1/analytics', { params: { source: 'email' } });
});