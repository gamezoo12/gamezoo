import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import AnnouncementTicker from './AnnouncementTicker';
import { londonToUtcIso, utcIsoToLondonLocal } from '../../pages/admin/AnnouncementsAdmin';
import { api } from '../../lib/api';

jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
  MemoryRouter: ({ children }) => children,
}));

jest.mock('../../lib/api', () => ({
  api: { get: () => Promise.resolve({ data: { announcements: [
    { id: 'a1', text: 'Big Friday draw', icon: '🎉', link: '/winners' },
    { id: 'a2', text: 'Partner offer', icon: null, link: 'https://example.com/x' },
    { id: 'a3', text: 'Plain notice', icon: '📢', link: null },
  ] } }) },
  contestsAPI: { championWinners: () => Promise.resolve({ winners: [{ rank: 1, user_name: 'Sam', prize_amount: 100, currency: 'GBP' }] }) },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const render = async (mode) => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<MemoryRouter><AnnouncementTicker mode={mode} /></MemoryRouter>); });
  return el;
};

describe('AnnouncementTicker', () => {
  it('shows managed announcements with working internal and external links', async () => {
    const el = await render('promo');
    expect(el.textContent).toContain('Big Friday draw');
    expect(el.textContent).toContain('Plain notice');
    expect(el.textContent).not.toContain('Play Skill-Based Games');
    expect(el.querySelector('a[href="/winners"]')).not.toBeNull();
    const ext = el.querySelector('a[href="https://example.com/x"]');
    expect(ext.getAttribute('target')).toBe('_blank');
    expect(ext.getAttribute('rel')).toContain('noopener');
  });

  it('keeps genuine winner announcements next to managed ones', async () => {
    const el = await render('winners');
    expect(el.textContent).toContain('Big Friday draw');
    expect(el.textContent).toContain('Sam won £100');
    expect(el.querySelectorAll('[data-testid="announcement-ticker"]')).toHaveLength(1);
  });

  it('hides unpublished winners and shows the remaining server-managed fallback', async () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue({ data: {
      announcements: [], fallbacks: [{ id: 'default:skill', text: 'Updated default', icon: '🎉' }],
      ticker_overrides: { 'champion-winner:null:1': { published: false } },
    } });
    try {
      const el = await render('winners');
      expect(el.textContent).not.toContain('Sam won £100');
      expect(el.textContent).toContain('Updated default');
    } finally { get.mockRestore(); }
  });
});

describe('Europe/London helpers', () => {
  it('round-trips BST and GMT wall times to UTC', () => {
    expect(londonToUtcIso('2026-07-01T12:00')).toBe('2026-07-01T11:00:00.000Z');
    expect(londonToUtcIso('2026-12-01T12:00')).toBe('2026-12-01T12:00:00.000Z');
    expect(utcIsoToLondonLocal('2026-07-01T11:00:00.000Z')).toBe('2026-07-01T12:00');
  });
});
