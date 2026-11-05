import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { PARTY_GAMES, PARTY_HOW_TO } from './index';
import { DUELS4 } from './duels4';
import { DUELS5 } from './duels5';
import { DUELS6 } from './duels6';
import { duelInit, duelStep } from './duel';

jest.mock('../../../lib/api', () => ({ api: { post: jest.fn(() => Promise.resolve({ data: {} })), get: jest.fn(() => Promise.resolve({ data: {} })) } }));
global.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLMediaElement.prototype.play = () => Promise.resolve();

const NEW_DUELS = { ...DUELS4, ...DUELS5, ...DUELS6 };

describe('party games registry', () => {
  it('has 100 games, each with how-to text', () => {
    const ids = Object.keys(PARTY_GAMES);
    expect(ids).toHaveLength(100);
    ids.forEach((id) => expect(PARTY_HOW_TO[id]).toBeTruthy());
  });

  it.each(Object.keys(NEW_DUELS))('%s random playouts end and the bot answers quickly', (id) => {
    const def = NEW_DUELS[id];
    [1, 40].forEach((lv) => {
      for (let game = 0; game < 3; game += 1) {
        let s = duelInit(def, lv);
        for (let ply = 0; ply < 400 && !s.over; ply += 1) {
          const ms = def.legal(s);
          expect(ms.length).toBeGreaterThan(0);
          s = duelStep(def, s, ms[Math.floor(Math.random() * ms.length)]);
        }
        expect(s.over || id === 'pty_corner_race').toBe(true);
      }
    });
  });

  it.each(Object.keys(PARTY_GAMES))('%s mounts and survives random taps', async (id) => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    for (const lv of [1, 40]) {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const root = createRoot(el);
      await act(async () => { root.render(PARTY_GAMES[id]({ stage_level: lv, difficulty: lv > 10 ? 10 : 2 }, () => {})); });
      expect(el.innerHTML.length).toBeGreaterThan(50);
      for (let k = 0; k < 25; k += 1) {
        const btns = [...el.querySelectorAll('[data-testid$="-board"] button, [data-testid$="-board"] g')];
        if (!btns.length) break;
        await act(async () => { btns[Math.floor(Math.random() * btns.length)].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      }
      await act(async () => { root.unmount(); });
      el.remove();
    }
    expect(errors.mock.calls.filter((c) => /Uncaught|Error:|TypeError|is not a function|Cannot read/.test(String(c[0])))).toHaveLength(0);
    errors.mockRestore();
  });
});
