import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { GAME_MAP } from './index';
import { GAME_CATALOG } from '../../lib/gameCatalog';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('GC preview game registry', () => {
  it('has exactly 30 unique catalog games, each with a registered component', () => {
    const ids = GAME_CATALOG.map((g) => g.id);
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
    ids.forEach((id) => expect(typeof GAME_MAP[id]).toBe('function'));
  });

  it.each(GAME_CATALOG.map((g) => [g.id]))('%s mounts and renders content with no errors', async (id) => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(GAME_MAP[id]({}, () => {})); });
    expect(el.innerHTML.length).toBeGreaterThan(20);
    expect(errors.mock.calls.filter((c) => /Uncaught|Error:/.test(String(c[0])))).toHaveLength(0);
    await act(async () => { root.unmount(); });
    errors.mockRestore();
  });
});
