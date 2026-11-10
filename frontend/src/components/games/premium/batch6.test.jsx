import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { GAMES_V3 } from './batch6';

jest.mock('../../../lib/gameExperience', () => ({ playGameSound: () => {} }));
global.IS_REACT_ACT_ENVIRONMENT = true;

test.each(Object.keys(GAMES_V3))('%s renders at easy and hard levels', (id) => {
  [1, 5, 10].forEach((difficulty) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => root.render(GAMES_V3[id]({ difficulty }, () => {})));
    expect(el.querySelector('[data-testid^="premium-"]')).toBeTruthy();
    act(() => root.unmount());
    el.remove();
  });
});
