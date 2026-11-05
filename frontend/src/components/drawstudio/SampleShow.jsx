import { Suspense, lazy } from 'react';

const DrawTheatre = lazy(() => import('./studio/DrawTheatre').then((m) => ({ default: m.DrawTheatre })));

const NAMES = ['Oliver G.', 'Amelia K.', 'Harry S.', 'Isla M.', 'Jack T.', 'Ava R.', 'Noah P.', 'Mia L.', 'Leo B.', 'Grace W.'];
const CONTEST = { contest_id: 'sample_show', title: 'Prize League Sample Draw' };
const ROUNDS = [
  { name: 'Runner-up Prize', prize_amount: 50, num_winners: 2, reward_type: 'winnings', load_duration_s: 5, mix_duration_s: 8, reveal_duration_s: 4, allow_previous_winners: false },
  { name: 'Grand Prize', prize_amount: 500, num_winners: 1, reward_type: 'winnings', load_duration_s: 4, mix_duration_s: 8, reveal_duration_s: 5, allow_previous_winners: false },
];
const TICKETS = Array.from({ length: 240 }, (_, i) => ({ ticket_number: 1001 + i, display_name: NAMES[i % NAMES.length] }));

// A rehearsal broadcast with made-up tickets so the host can hear the commentary end-to-end. Nothing is saved.
export function SampleShow({ commentary, audio, onClose }) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-[#050211] text-white" data-testid="sample-show-loading">Loading studio…</div>}>
      <DrawTheatre mode="preview" contest={CONTEST} rounds={ROUNDS} tickets={TICKETS} plan={null} audio={audio} voiceOverride={{ ...commentary, enabled: true }} onClose={onClose} />
    </Suspense>
  );
}
