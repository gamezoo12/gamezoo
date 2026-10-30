import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PromotionPopup from './PromotionPopup';

const mockNavigate = jest.fn();
const mockGet = jest.fn();
const mockPost = jest.fn(() => Promise.resolve());
let mockUser = { user_id: 'player' };

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/' }),
  useNavigate: () => mockNavigate,
}));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../lib/api', () => ({ api: { get: (...args) => mockGet(...args), post: (...args) => mockPost(...args) } }));

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('promotion popup configuration', () => {
  let container;
  let root;
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockNavigate.mockClear();
    mockPost.mockReset();
    mockPost.mockResolvedValue({});
    mockUser = { user_id: 'player' };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('shows configured offers and routes the Top Up button to the existing wallet', async () => {
    mockGet.mockResolvedValue({ data: { is_live: true, promotion_id: 'test-promo', name: 'Test Promotion',
      signup_offer_text: 'Signup Bonus: 5 free Tokens', topup_offer_text: 'Top-Up Offer: Top up £20 and get 40 Tokens',
      show_join: false, show_refer: true, show_topup: true, topup_url: '/my-account/wallet?topup=1' } });
    await act(async () => root.render(<PromotionPopup />));
    expect(container.textContent).toContain('Signup Bonus: 5 free Tokens');
    expect(container.textContent).toContain('Top-Up Offer: Top up £20 and get 40 Tokens');
    expect(container.textContent).not.toContain('JOIN PROMOTION');
    expect(container.textContent).toContain('REFER A FRIEND');
    const topup = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'TOP UP');
    await act(async () => topup.click());
    expect(mockNavigate).toHaveBeenCalledWith('/my-account/wallet?topup=1');
    expect(mockPost).toHaveBeenCalledWith('/promotion/event', expect.objectContaining({ event: 'topup_click' }));
  });

  it('sends guests to signup with the configured top-up destination', async () => {
    mockUser = null;
    mockGet.mockResolvedValue({ data: { is_live: true, promotion_id: 'test-guest', name: 'Guest Promotion',
      show_join: false, show_refer: false, show_topup: true, topup_url: '/my-account/wallet?topup=1' } });
    await act(async () => root.render(<PromotionPopup />));
    const topup = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'TOP UP');
    await act(async () => topup.click());
    expect(mockNavigate).toHaveBeenCalledWith('/login?tab=signup&promo=topup&next=%2Fmy-account%2Fwallet%3Ftopup%3D1');
  });

  it('shows only the artwork, Top Up and Refer for an Offer Promotion', async () => {
    mockGet.mockResolvedValue({ data: { is_live: true, promotion_id: 'test-offer', name: 'Hidden title',
      promotion_type: 'offer', mobile_image_url: '/test-image.png', description: 'Hidden description',
      signup_offer_text: 'Hidden signup text', topup_offer_text: 'Hidden offer text',
      show_join: true, show_refer: true, show_topup: true } });
    await act(async () => root.render(<PromotionPopup />));
    expect(container.querySelector('img').getAttribute('src')).toBe('/test-image.png');
    expect(container.textContent).not.toContain('Hidden title');
    expect(container.textContent).not.toContain('Hidden description');
    expect(container.textContent).not.toContain('Hidden signup text');
    expect(container.textContent).not.toContain('JOIN PROMOTION');
    expect(container.textContent).toContain('TOP UP');
    expect(container.textContent).toContain('REFER A FRIEND');
  });
});