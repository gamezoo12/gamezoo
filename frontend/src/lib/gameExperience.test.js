import { GAME_CATALOG } from './gameCatalog';
import { GAME_EXPERIENCE, pickResultQuote, RESULT_QUOTES } from './gameExperience';

describe('registered game experience metadata', () => {
  it('covers each of the 30 player games with specific guide content', () => {
    const ids = GAME_CATALOG.map((game) => game.id).sort();
    expect(Object.keys(GAME_EXPERIENCE).sort()).toEqual(ids);
    for (const guide of Object.values(GAME_EXPERIENCE)) {
      expect(guide.objective.length).toBeGreaterThan(15);
      expect(guide.controls.length).toBeGreaterThan(15);
      expect(guide.win.length).toBeGreaterThan(10);
      expect(guide.mistakes.length).toBeGreaterThan(10);
      expect(guide.timer).toMatch(/server/);
    }
  });

  it('reuses the established success and retry quote pools', () => {
    expect(pickResultQuote(true)).toEqual(expect.stringContaining(''));
    expect(RESULT_QUOTES.success).toContain(pickResultQuote(true));
    expect(RESULT_QUOTES.retry).toContain(pickResultQuote(false));
  });
});
