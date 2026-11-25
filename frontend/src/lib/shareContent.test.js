import { referralAPI } from './api';
import { referralCodeFor, renderShareImages, sharedUrl } from './shareContent';
import { BRAND } from './brand';
import { renderScorecard } from '../components/signupChallenge/scorecard';

jest.mock('./api', () => ({ referralAPI: { me: jest.fn() } }));

test('shared links retain their destination and add the personal referral code', () => {
  const url = new URL(sharedUrl('/competition/weekly-draw?view=live', 'FRIEND123'));
  expect(url.pathname).toBe('/competition/weekly-draw');
  expect(url.searchParams.get('view')).toBe('live');
  expect(url.searchParams.get('ref')).toBe('FRIEND123');
});

test('signup challenge share links retain their sc code and add referral attribution', () => {
  const url = new URL(sharedUrl('/?sc=CHALLENGE123', 'FRIEND123'));
  expect(url.pathname).toBe('/');
  expect(url.searchParams.get('sc')).toBe('CHALLENGE123');
  expect(url.searchParams.get('ref')).toBe('FRIEND123');
});

test('share links reject external destinations', () => {
  expect(() => sharedUrl('https://example.com/', 'FRIEND123')).toThrow();
});

test('signed-in users reuse their normal referral code and guests share without one', async () => {
  referralAPI.me.mockResolvedValue({ code: 'PLAYER123' });
  expect(await referralCodeFor({ user_id: 'player-1' })).toBe('PLAYER123');
  expect(await referralCodeFor({ user_id: 'player-1' })).toBe('PLAYER123');
  expect(referralAPI.me).toHaveBeenCalledTimes(1);
  expect(await referralCodeFor(null)).toBe('');
});

test('share artwork is branded, 4K, link-free, and respects its row limit', async () => {
  const paintedText = [];
  const gradient = { addColorStop: jest.fn() };
  const context = {
    beginPath: jest.fn(), roundRect: jest.fn(), fill: jest.fn(), stroke: jest.fn(), fillRect: jest.fn(),
    drawImage: jest.fn(), save: jest.fn(), clip: jest.fn(), restore: jest.fn(), scale: jest.fn(), strokeRect: jest.fn(),
    createLinearGradient: jest.fn(() => gradient), createRadialGradient: jest.fn(() => gradient),
    measureText: jest.fn((text) => ({ width: String(text).length * 10 })),
    fillText: jest.fn((text) => paintedText.push(String(text))),
  };
  const canvas = document.createElement('canvas');
  const originalCreateElement = document.createElement.bind(document);
  const createElement = jest.spyOn(document, 'createElement').mockImplementation((tagName) => (
    tagName === 'canvas' ? canvas : originalCreateElement(tagName)
  ));
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  const toBlob = jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['image'])));
  const OriginalImage = global.Image;
  global.Image = class {
    set src(value) { this.onload?.(); }
  };

  try {
    const rows = Array.from({ length: 7 }, (_, index) => ({ rank: index + 1, name: `Player ${index + 1}`, result: `${index + 1}s` }));
    const images = await renderShareImages({
      title: 'Championship 12 leaderboard', subtitle: 'Top 5 official standings', rows, maxRows: 5,
    });

    expect(images).toHaveLength(1);
    expect(canvas.width).toBe(3840);
    expect(canvas.height).toBe(2160);
    expect(paintedText).toContain('PRIZE');
    expect(paintedText).toContain('LEAGUE');
    expect(paintedText).toContain('Player 5');
    expect(paintedText).not.toContain('Player 6');
    expect(paintedText).not.toContain('Player 7');
    expect(paintedText.some((text) => /https?:\/\//i.test(text))).toBe(false);
    expect(paintedText).not.toContain(BRAND.logoUrl);

    paintedText.length = 0;
    await renderScorecard({
      title: 'Challenge', prize: 'Weekly prize', name: 'Player', game: 'Game',
      url: 'https://www.prizeleague.co.uk/?sc=CODE&ref=REF', best: '10.2s', attempts: [],
    }, 'story');
    expect(paintedText.some((text) => /https?:\/\//i.test(text))).toBe(false);
    expect(paintedText).toContain('PRIZE LEAGUE');
  } finally {
    global.Image = OriginalImage;
    createElement.mockRestore();
    getContext.mockRestore();
    toBlob.mockRestore();
  }
});