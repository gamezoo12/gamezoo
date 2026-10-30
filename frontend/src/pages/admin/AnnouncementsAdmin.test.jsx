import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AnnouncementsAdmin from './AnnouncementsAdmin';
import { announcementsAdminAPI } from '../../lib/api';

jest.mock('../../lib/api', () => ({ announcementsAdminAPI: {
  list: jest.fn(), audit: jest.fn(), badgeSettings: jest.fn(), generated: jest.fn(),
  saveBadgeSettings: jest.fn(), updateGenerated: jest.fn(),
} }));
global.IS_REACT_ACT_ENVIRONMENT = true;

it('saves badge settings and updates generated announcements', async () => {
  const api = announcementsAdminAPI;
  api.list.mockResolvedValue({ announcements: [] });
  api.audit.mockResolvedValue({ items: [] });
  api.badgeSettings.mockResolvedValue({ enabled: true, text: 'Offer', url: '/refer' });
  api.generated.mockResolvedValue({ items: [{ id: 'default:skill', text: 'Play games', sample: 'Play games', icon: '🎉' }] });
  api.saveBadgeSettings.mockResolvedValue({});
  api.updateGenerated.mockResolvedValue({});
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AnnouncementsAdmin />));
    expect(container.textContent).toContain('Promotion icon');
    expect(container.textContent).toContain('Play games');
    const save = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Save icon settings');
    await act(async () => save.click());
    expect(api.saveBadgeSettings).toHaveBeenCalledWith({ enabled: true, text: 'Offer', url: '/refer' });
    const generated = container.querySelector('[data-testid="generated-announcement-default:skill"]');
    const disable = Array.from(generated.querySelectorAll('button')).find(button => button.textContent === 'Disable');
    await act(async () => disable.click());
    expect(api.updateGenerated).toHaveBeenCalledWith('default:skill', expect.objectContaining({ enabled: false }));
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});