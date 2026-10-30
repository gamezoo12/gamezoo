import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PromotionFloatingBadge from './PromotionFloatingBadge';

const mockNavigate = jest.fn();
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/' }), useNavigate: () => mockNavigate }));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { user_id: 'player' } }) }));
jest.mock('../lib/api', () => ({ api: { get: (...args) => mockGet(...args), post: (...args) => mockPost(...args) } }));
global.IS_REACT_ACT_ENVIRONMENT = true;

it('refreshes badge settings and routes internal and external destinations', async () => {
  jest.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  mockNavigate.mockClear();
  mockPost.mockResolvedValue({});
  let settings = { enabled: true, text: 'Open offer', url: '/refer' };
  mockGet.mockImplementation((path) => Promise.resolve({ data: path === '/promotion/config'
    ? { is_live: true, name: 'Promotion' } : settings }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const originalOpen = window.open;
  window.open = jest.fn();
  try {
    await act(async () => root.render(<PromotionFloatingBadge />));
    expect(container.textContent).toContain('Open offer');
    const badge = container.querySelector('[aria-label="Open promotion"]');
    await act(async () => badge.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(mockNavigate).toHaveBeenCalledWith('/refer');

    settings = { enabled: true, text: 'External offer', url: 'https://example.com/offer' };
    await act(async () => { jest.advanceTimersByTime(60000); });
    expect(container.textContent).toContain('External offer');
    await act(async () => badge.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(window.open).toHaveBeenCalledWith('https://example.com/offer', '_blank', 'noopener,noreferrer');

    settings = { ...settings, enabled: false };
    await act(async () => { jest.advanceTimersByTime(60000); });
    expect(container.querySelector('[aria-label="Open promotion"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.open = originalOpen;
    jest.useRealTimers();
  }
});