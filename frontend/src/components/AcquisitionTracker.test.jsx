import { act } from 'react';
import { createRoot } from 'react-dom/client';
import AcquisitionTracker from './AcquisitionTracker';
import { acquisitionAPI } from '../lib/api';

jest.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/competition/example', search: '?ref=friend123', key: 'test' }) }));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../lib/api', () => ({
  acquisitionAPI: { pageView: jest.fn(), engagement: jest.fn(), event: jest.fn(), track: jest.fn() },
  influencerAPI: { recordVisit: jest.fn() },
}));

test('captures referral from a contest link without analytics consent', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AcquisitionTracker />));
    expect(localStorage.getItem('pl_referral_code')).toBe('FRIEND123');
    expect(Number(localStorage.getItem('pl_referral_code_expires'))).toBeGreaterThan(Date.now());
    expect(acquisitionAPI.pageView).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});