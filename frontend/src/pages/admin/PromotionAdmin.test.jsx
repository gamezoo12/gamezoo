import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PromotionAdmin from './PromotionAdmin';

const mockGet = jest.fn();
jest.mock('../../lib/api', () => ({
  api: { get: (...args) => mockGet(...args), put: jest.fn(), post: jest.fn() },
  uploadsAPI: { image: jest.fn() },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

it('shows controls for the selected promotion type', async () => {
  const config = { promotion_type: 'offer', promotion_id: 'test', name: 'Promotion', active: false,
    show_join: false, show_refer: true, show_topup: true, join_url: '/my-account/promotions',
    refer_url: '/refer', topup_url: '/my-account/wallet?topup=1', winner_count: 1,
    prize_total_gbp: 0, prize_per_winner_gbp: 0 };
  mockGet.mockImplementation((path) => Promise.resolve({ data: path.endsWith('/config') ? config
    : path.endsWith('/participants') || path.endsWith('/history') ? { items: [] }
      : path.endsWith('/manual-winner') ? { winner: null } : {} }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<PromotionAdmin />));
    const type = container.querySelector('[data-testid="promotion-type"]');
    expect(type.value).toBe('offer');
    expect(container.querySelector('[data-testid="promotion-manual-winner"]')).toBeNull();
    expect(container.textContent).not.toContain('Draw history');
    expect(container.textContent).not.toContain('Total prize £');
    expect(container.textContent).toContain('Top Up');
    expect(container.textContent).toContain('Refer');
    await act(async () => { type.value = 'prize_draw'; type.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.querySelector('[data-testid="promotion-manual-winner"]')).not.toBeNull();
    expect(container.textContent).toContain('Draw history');
    expect(container.textContent).toContain('Total prize £');
    await act(async () => { type.value = 'referral'; type.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.querySelector('[data-testid="promotion-manual-winner"]')).toBeNull();
    expect(container.textContent).toContain('Referral reward settings');
    expect(container.textContent).not.toContain('Total prize £');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});