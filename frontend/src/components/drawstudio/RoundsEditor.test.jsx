import { renderToStaticMarkup } from 'react-dom/server';
import { RoundsEditor } from './RoundsEditor';

test('offers Other prize with a description field in Draw Studio', () => {
  const rounds = [{
    name: 'Grand Prize', prize_amount: 800, num_winners: 1, reward_type: 'other',
    other_prize_description: 'Tablet', load_duration_s: 12, mix_duration_s: 15,
    reveal_duration_s: 10, allow_previous_winners: false,
  }];
  const html = renderToStaticMarkup(<RoundsEditor rounds={rounds} setRounds={() => {}} locked={false} results={[]} />);
  expect(html).toContain('Other prize');
  expect(html).toContain('Estimated other prize value in pounds');
  expect(html).toContain('e.g. tablet, car, mobile');
});
