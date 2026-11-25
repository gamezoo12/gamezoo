import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import WorldSelector from './WorldSelector';

const mockGet = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../components/WelcomeBanner', () => ({ WelcomeBanner: () => null }));
jest.mock('../lib/api', () => ({ api: { get: (...args) => mockGet(...args) } }));
jest.mock('../world/PrizeLeagueWorld', () => ({ __esModule: true, default: () => null }));
jest.mock('./Home', () => ({ __esModule: true, default: () => null }));

global.IS_REACT_ACT_ENVIRONMENT = true;

it('applies saved tablet and desktop spacing without reloading', async () => {
  let resolveRequest;
  mockGet.mockImplementation(() => new Promise(resolve => { resolveRequest = resolve; }));
  localStorage.setItem('pl-world-selection-design', JSON.stringify({ paid_desktop: '/test.png' }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<WorldSelector />));
    await act(async () => window.dispatchEvent(new CustomEvent('pl-world-selection-design-updated', {
      detail: { paid_desktop: '/test.png', header_gap_tablet: 80, header_gap_desktop: 120, title_gap_tablet: 60, title_gap_desktop: 90 },
    })));
    const page = container.querySelector('.world-selector-page');
    expect(page.style.getPropertyValue('--world-header-gap-tablet')).toBe('80px');
    expect(page.style.getPropertyValue('--world-header-gap-desktop')).toBe('120px');
    expect(page.style.getPropertyValue('--world-title-gap-tablet')).toBe('60px');
    expect(page.style.getPropertyValue('--world-title-gap-desktop')).toBe('90px');
    await act(async () => resolveRequest({ data: { paid_desktop: '/old.png', header_gap_desktop: 10 } }));
    expect(page.style.getPropertyValue('--world-header-gap-desktop')).toBe('120px');
  } finally {
    await act(async () => root.unmount());
    localStorage.removeItem('pl-world-selection-design');
    container.remove();
  }
});