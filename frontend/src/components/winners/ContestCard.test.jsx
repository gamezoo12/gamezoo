import { renderToStaticMarkup } from 'react-dom/server';
import { ContestCard } from './ContestCard';

jest.mock('../../lib/api', () => ({ paidWinnersAPI: { mediaUrl: jest.fn() } }));

test.each([
  [50, 25, true, true],
  [0, 25, false, true],
  [50, 0, true, false],
])('renders contest prize amounts: cash %s, bonus %s', (cash, bonus, hasCash, hasBonus) => {
  const contest = { contest_id: 'contest-1', title: 'Contest', kind: 'draw', prize_amount: cash, prize_bonus_tokens: bonus };
  const html = renderToStaticMarkup(<ContestCard c={contest} tab="winners" index={0} onOpen={() => {}} />);
  const container = document.createElement('div');
  container.innerHTML = html;

  expect(container.textContent.includes('£50.00')).toBe(hasCash);
  expect(container.textContent.includes('25 Winning Bonus Tokens')).toBe(hasBonus);
});