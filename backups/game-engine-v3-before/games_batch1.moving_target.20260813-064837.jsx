/* eslint-disable react-hooks/exhaustive-deps */

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import GameShell from './GameShell';

import {
  accuracyFromCorrect,
  accuracyFromErrors,
  clamp,
  createResult,
  createRandomSource,
  difficultyProfile,
  now,
  randomInt,
  randomItem,
  shuffle,
} from './gameUtils';


/* ============================================================
   SHARED HELPERS
   ============================================================ */

const DIFFICULTY_BADGE = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
};

function DifficultyBadge({ difficulty }) {
  return (
    <span className="inline-flex px-2.5 py-1 rounded-full bg-[#6C2BFF]/10 text-[#6C2BFF] text-xs font-extrabold uppercase tracking-wider">
      {DIFFICULTY_BADGE[difficulty] || 'Medium'}
    </span>
  );
}

function ChoiceButton({ children, onClick, disabled = false, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      className="min-h-[3.25rem] px-4 py-3 rounded-xl border-2 border-slate-200 bg-white hover:border-[#6C2BFF] hover:bg-[#6C2BFF]/5 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-slate-800 transition"
    >
      {children}
    </button>
  );
}


/* ============================================================
   1. RAPID EQUATION
   Fresh arithmetic every round.
   ============================================================ */

function makeArithmeticQuestion(maxNumber, allowDivision = false, rng = Math.random) {
  const operators = allowDivision
    ? ['+', '-', '×', '÷']
    : ['+', '-', '×'];

  const op = randomItem(operators, rng);

  let a = randomInt(2, maxNumber);
  let b = randomInt(2, maxNumber);

  let answer;

  if (op === '+') {
    answer = a + b;
  } else if (op === '-') {
    if (b > a) [a, b] = [b, a];
    answer = a - b;
  } else if (op === '×') {
    const limit = Math.max(5, Math.floor(Math.sqrt(maxNumber * 2)));
    a = randomInt(2, limit);
    b = randomInt(2, limit);
    answer = a * b;
  } else {
    b = randomInt(2, Math.max(3, Math.floor(maxNumber / 4)));
    answer = randomInt(2, Math.max(4, Math.floor(maxNumber / 3)));
    a = b * answer;
  }

  return {
    text: `${a} ${op} ${b}`,
    answer,
  };
}

export function RapidEquation({ config, onComplete }) {
  const rngRef = useRef(null);

  if (!rngRef.current) {
    rngRef.current = createRandomSource(
      config,
      'rapid_equation'
    );
  }

  const rng = rngRef.current;

  const profile = difficultyProfile(config, {
    easy:   { total: 8,  max: 15,  division: false },
    medium: { total: 10, max: 30,  division: false },
    hard:   { total: 12, max: 60,  division: true },
    expert: { total: 15, max: 120, division: true },
  });

  const [question, setQuestion] = useState(() =>
    makeArithmeticQuestion(profile.max, profile.division, rng)
  );

  const [answer, setAnswer] = useState('');
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [evidenceAnswers, setEvidenceAnswers] = useState([]);
  const [startedAt] = useState(now);

  const submit = () => {
    if (answer === '') return;

    const isCorrect =
      Number(answer) === Number(question.answer);

    const submittedAnswer = Number(answer);
    const nextEvidenceAnswers = [
      ...evidenceAnswers,
      submittedAnswer,
    ];

    const nextCorrect = correct + (isCorrect ? 1 : 0);
    const nextRound = round + 1;

    if (nextRound >= profile.total) {
      onComplete(
        createResult({
          solved: true,
          accuracy: accuracyFromCorrect(
            nextCorrect,
            profile.total
          ),
          startedAt,
          evidence: {
            answers: nextEvidenceAnswers,
          },
        })
      );
      return;
    }

    setCorrect(nextCorrect);
    setEvidenceAnswers(nextEvidenceAnswers);
    setRound(nextRound);
    setAnswer('');
    setQuestion(
      makeArithmeticQuestion(
        profile.max,
        profile.division,
        rng
      )
    );
  };

  return (
    <GameShell
      title="Rapid Equation"
      instruction="Solve the generated equations as accurately and quickly as possible."
      progress={`Question ${round + 1} / ${profile.total}`}
      footer="Every round uses newly generated numbers and operators."
    >
      <div className="flex justify-center mb-4">
        <DifficultyBadge difficulty={profile.difficulty} />
      </div>

      <div
        className="text-center text-5xl md:text-6xl font-black text-slate-900 my-7"
        data-testid="rapid-equation-question"
      >
        {question.text} = ?
      </div>

      <div className="flex gap-2 max-w-sm mx-auto">
        <input
          autoFocus
          type="number"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          className="flex-1 min-w-0 rounded-xl border-2 border-slate-200 px-4 py-3 text-xl font-bold text-center outline-none focus:border-[#6C2BFF]"
          data-testid="rapid-equation-answer"
        />

        <button
          onClick={submit}
          className="px-5 rounded-xl bg-[#6C2BFF] text-white font-extrabold"
        >
          Enter
        </button>
      </div>

      <div className="text-center text-xs text-slate-400 mt-3">
        Correct: {correct}
      </div>
    </GameShell>
  );
}


/* ============================================================
   2. MISSING OPERATOR
   Determine which operator makes the equation true.
   ============================================================ */

function makeOperatorQuestion(maxNumber, includeDivision, rng = Math.random) {
  const operators = includeDivision
    ? ['+', '-', '×', '÷']
    : ['+', '-', '×'];

  const operator = randomItem(operators, rng);

  let a = randomInt(2, maxNumber);
  let b = randomInt(2, maxNumber);
  let answer;

  if (operator === '+') {
    answer = a + b;
  } else if (operator === '-') {
    if (b > a) [a, b] = [b, a];
    answer = a - b;
  } else if (operator === '×') {
    a = randomInt(2, Math.max(4, Math.floor(maxNumber / 3)));
    b = randomInt(2, Math.max(4, Math.floor(maxNumber / 3)));
    answer = a * b;
  } else {
    b = randomInt(2, 10);
    answer = randomInt(2, Math.max(3, Math.floor(maxNumber / 3)));
    a = b * answer;
  }

  return {
    a,
    b,
    answer,
    operator,
    options: shuffle(operators, rng),
  };
}

export function MissingOperator({ config, onComplete }) {
  const rngRef = useRef(null);

  if (!rngRef.current) {
    rngRef.current = createRandomSource(
      config,
      'missing_operator'
    );
  }

  const rng = rngRef.current;

  const profile = difficultyProfile(config, {
    easy:   { total: 6,  max: 15, division: false },
    medium: { total: 8,  max: 30, division: false },
    hard:   { total: 10, max: 60, division: true },
    expert: { total: 12, max: 100, division: true },
  });

  const [question, setQuestion] = useState(() =>
    makeOperatorQuestion(profile.max, profile.division, rng)
  );

  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [evidenceAnswers, setEvidenceAnswers] = useState([]);
  const [startedAt] = useState(now);

  const pick = (operator) => {
    const good = operator === question.operator;

    const nextEvidenceAnswers = [
      ...evidenceAnswers,
      operator,
    ];

    const nextCorrect = correct + (good ? 1 : 0);
    const nextRound = round + 1;

    if (nextRound >= profile.total) {
      onComplete(
        createResult({
          solved: true,
          accuracy: accuracyFromCorrect(
            nextCorrect,
            profile.total
          ),
          startedAt,
          evidence: {
            answers: nextEvidenceAnswers,
          },
        })
      );
      return;
    }

    setCorrect(nextCorrect);
    setEvidenceAnswers(nextEvidenceAnswers);
    setRound(nextRound);
    setQuestion(
      makeOperatorQuestion(
        profile.max,
        profile.division,
        rng
      )
    );
  };

  return (
    <GameShell
      title="Missing Operator"
      instruction="Choose the operator that makes the equation correct."
      progress={`Round ${round + 1} / ${profile.total}`}
    >
      <div className="flex justify-center mb-4">
        <DifficultyBadge difficulty={profile.difficulty} />
      </div>

      <div className="text-center font-black text-4xl my-7">
        {question.a}
        <span className="text-[#6C2BFF] mx-4">?</span>
        {question.b}
        <span className="mx-4">=</span>
        {question.answer}
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
        {question.options.map((operator) => (
          <ChoiceButton
            key={operator}
            onClick={() => pick(operator)}
            testid={`missing-op-${operator}`}
          >
            <span className="text-2xl">{operator}</span>
          </ChoiceButton>
        ))}
      </div>
    </GameShell>
  );
}


/* ============================================================
   3. NUMBER GRID HUNT
   Locate changing targets inside a randomized grid.
   ============================================================ */

export function NumberGridHunt({ config, onComplete }) {
  const rngRef = useRef(null);

  if (!rngRef.current) {
    rngRef.current = createRandomSource(
      config,
      'number_grid_hunt'
    );
  }

  const rng = rngRef.current;

  const profile = difficultyProfile(config, {
    easy:   { size: 4, total: 8 },
    medium: { size: 5, total: 12 },
    hard:   { size: 6, total: 16 },
    expert: { size: 7, total: 20 },
  });

  const max = profile.size * profile.size;

  const [numbers] = useState(() =>
    shuffle(
      Array.from({ length: max }, (_, i) => i + 1),
      rng
    )
  );

  const targets = useMemo(
    () =>
      shuffle(
      Array.from({ length: max }, (_, i) => i + 1),
      rng
    )
        .slice(0, profile.total),
    []
  );

  const [round, setRound] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [evidenceTaps, setEvidenceTaps] = useState([]);
  const [startedAt] = useState(now);

  const target = targets[round];

  const tap = (value) => {
    const nextEvidenceTaps = [...evidenceTaps, value];

    if (value !== target) {
      setEvidenceTaps(nextEvidenceTaps);
      setMistakes((value2) => value2 + 1);
      return;
    }

    const nextRound = round + 1;

    if (nextRound >= targets.length) {
      onComplete(
        createResult({
          solved: true,
          accuracy: accuracyFromErrors(
            mistakes,
            profile.difficulty === 'expert'
              ? 0.035
              : 0.05
          ),
          startedAt,
          evidence: {
            taps: nextEvidenceTaps,
          },
        })
      );
      return;
    }

    setEvidenceTaps(nextEvidenceTaps);
    setRound(nextRound);
  };

  return (
    <GameShell
      title="Number Grid Hunt"
      instruction="Find each requested number in the grid as fast as possible."
      progress={`Target ${round + 1} / ${targets.length}`}
    >
      <div className="flex items-center justify-between mb-5">
        <DifficultyBadge difficulty={profile.difficulty} />

        <div className="text-sm text-slate-500">
          Mistakes: <b>{mistakes}</b>
        </div>
      </div>

      <div className="text-center mb-5">
        <div className="text-xs uppercase tracking-widest text-slate-400">
          Find
        </div>

        <div
          className="text-5xl font-black text-[#6C2BFF]"
          data-testid="grid-hunt-target"
        >
          {target}
        </div>
      </div>

      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns:
            `repeat(${profile.size}, minmax(0, 1fr))`,
        }}
      >
        {numbers.map((number) => (
          <button
            key={number}
            onClick={() => tap(number)}
            className="aspect-square rounded-xl border border-slate-200 bg-slate-50 hover:bg-[#6C2BFF] hover:text-white font-black transition"
          >
            {number}
          </button>
        ))}
      </div>
    </GameShell>
  );
}


/* ============================================================
   4. EQUATION BALANCE
   Choose the missing value.
   ============================================================ */

function generateBalance(max, rng = Math.random) {
  const a = randomInt(2, max, rng);
  const b = randomInt(2, max, rng);
  const c = randomInt(2, max, rng);

  const target = a + b + c;

  const answer = target - a - b;

  const distractors = new Set([answer]);

  while (distractors.size < 4) {
    distractors.add(
      Math.max(1, answer + randomInt(-8, 8, rng))
    );
  }

  return {
    a,
    b,
    target,
    answer,
    options: shuffle([...distractors], rng),
  };
}

export function EquationBalance({ config, onComplete }) {
  const rngRef = useRef(null);

  if (!rngRef.current) {
    rngRef.current = createRandomSource(
      config,
      'equation_balance'
    );
  }

  const rng = rngRef.current;

  const profile = difficultyProfile(config, {
    easy:   { total: 6, max: 12 },
    medium: { total: 8, max: 25 },
    hard:   { total: 10, max: 50 },
    expert: { total: 12, max: 100 },
  });

  const [question, setQuestion] = useState(() =>
    generateBalance(profile.max, rng)
  );

  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [evidenceAnswers, setEvidenceAnswers] = useState([]);
  const [startedAt] = useState(now);

  const pick = (value) => {
    const good = value === question.answer;

    const nextEvidenceAnswers = [
      ...evidenceAnswers,
      Number(value),
    ];

    const nextCorrect = correct + (good ? 1 : 0);
    const nextRound = round + 1;

    if (nextRound >= profile.total) {
      onComplete(
        createResult({
          solved: true,
          accuracy: accuracyFromCorrect(
            nextCorrect,
            profile.total
          ),
          startedAt,
          evidence: {
            answers: nextEvidenceAnswers,
          },
        })
      );

      return;
    }

    setCorrect(nextCorrect);
    setEvidenceAnswers(nextEvidenceAnswers);
    setRound(nextRound);
    setQuestion(generateBalance(profile.max, rng));
  };

  return (
    <GameShell
      title="Equation Balance"
      instruction="Select the missing number that completes the equation."
      progress={`Puzzle ${round + 1} / ${profile.total}`}
    >
      <div className="flex justify-center mb-5">
        <DifficultyBadge difficulty={profile.difficulty} />
      </div>

      <div className="text-center text-3xl md:text-4xl font-black my-7">
        {question.a} + {question.b} +
        <span className="mx-2 text-[#6C2BFF]">?</span>
        = {question.target}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {question.options.map((value) => (
          <ChoiceButton
            key={value}
            onClick={() => pick(value)}
          >
            {value}
          </ChoiceButton>
        ))}
      </div>
    </GameShell>
  );
}


/* ============================================================
   5. MEMORY GRID
   Fresh highlighted pattern every game.
   ============================================================ */

export function MemoryGrid({ config, onComplete }) {
  const rngRef = useRef(null);

  if (!rngRef.current) {
    rngRef.current = createRandomSource(
      config,
      'memory_grid'
    );
  }

  const rng = rngRef.current;

  const profile = difficultyProfile(config, {
    easy: {
      size: 4,
      active: 4,
      previewMs: 2200,
    },
    medium: {
      size: 4,
      active: 6,
      previewMs: 1700,
    },
    hard: {
      size: 5,
      active: 8,
      previewMs: 1400,
    },
    expert: {
      size: 6,
      active: 11,
      previewMs: 1100,
    },
  });

  const totalCells = profile.size * profile.size;

  const targetCells = useMemo(
    () =>
      new Set(
        shuffle(
          Array.from(
            { length: totalCells },
            (_, index) => index
          )
        ,
          rng
        ).slice(0, profile.active)
      ),
    []
  );

  const [showing, setShowing] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [errors, setErrors] = useState(0);
  const [evidenceSelections, setEvidenceSelections] = useState([]);
  const [startedAt] = useState(now);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setShowing(false),
      profile.previewMs
    );

    return () => window.clearTimeout(timer);
  }, []);

  const pick = (index) => {
    if (showing || selected.has(index)) return;

    const next = new Set(selected);
    next.add(index);

    const nextEvidenceSelections = [
      ...evidenceSelections,
      index,
    ];

    const isCorrect = targetCells.has(index);

    if (!isCorrect) {
      setErrors((value) => value + 1);
    }

    setSelected(next);
    setEvidenceSelections(nextEvidenceSelections);

    const correctSelected =
      [...next].filter((cell) => targetCells.has(cell)).length;

    if (correctSelected >= targetCells.size) {
      onComplete(
        createResult({
          solved: true,
          accuracy: accuracyFromErrors(
            errors + (isCorrect ? 0 : 1),
            0.1
          ),
          startedAt,
          evidence: {
            selections: nextEvidenceSelections,
          },
        })
      );
    }
  };

  return (
    <GameShell
      title="Memory Grid"
      instruction={
        showing
          ? 'Memorise the highlighted cells.'
          : 'Select every cell that was highlighted.'
      }
    >
      <div className="flex items-center justify-between mb-5">
        <DifficultyBadge difficulty={profile.difficulty} />

        <div className="text-xs font-bold text-slate-500">
          {showing ? 'MEMORISE' : 'RECALL'}
        </div>
      </div>

      <div
        className="grid gap-2 max-w-md mx-auto"
        style={{
          gridTemplateColumns:
            `repeat(${profile.size}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: totalCells }).map((_, index) => {
          const highlighted =
            showing && targetCells.has(index);

          const chosen = selected.has(index);

          return (
            <button
              key={index}
              disabled={showing}
              onClick={() => pick(index)}
              className={`aspect-square rounded-xl border-2 transition ${
                highlighted
                  ? 'bg-[#6C2BFF] border-[#6C2BFF]'
                  : chosen
                    ? targetCells.has(index)
                      ? 'bg-emerald-100 border-emerald-400'
                      : 'bg-rose-100 border-rose-400'
                    : 'bg-slate-50 border-slate-200'
              }`}
            />
          );
        })}
      </div>
    </GameShell>
  );
}


/* ============================================================
   6. DIRECTION RUSH
   Spatial/inhibitory-control challenge.
   ============================================================ */

const DIRECTIONS = [
  { id: 'up', icon: '↑', opposite: 'down' },
  { id: 'down', icon: '↓', opposite: 'up' },
  { id: 'left', icon: '←', opposite: 'right' },
  { id: 'right', icon: '→', opposite: 'left' },
];

function makeDirectionRound(hardMode, rng = Math.random) {
  const shown = randomItem(DIRECTIONS, rng);
  const opposite = hardMode && rng() < 0.55;

  return {
    shown,
    instruction: opposite ? 'OPPOSITE' : 'SAME',
    answer: opposite ? shown.opposite : shown.id,
  };
}

export function DirectionRush({ config, onComplete }) {
  const rngRef = useRef(null);

  if (!rngRef.current) {
    rngRef.current = createRandomSource(
      config,
      'direction_rush'
    );
  }

  const rng = rngRef.current;

  const profile = difficultyProfile(config, {
    easy:   { total: 8, opposite: false },
    medium: { total: 10, opposite: true },
    hard:   { total: 14, opposite: true },
    expert: { total: 18, opposite: true },
  });

  const [question, setQuestion] = useState(() =>
    makeDirectionRound(profile.opposite, rng)
  );

  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [evidenceAnswers, setEvidenceAnswers] = useState([]);
  const [startedAt] = useState(now);

  const pick = (direction) => {
    const good = direction === question.answer;
    const nextCorrect = correct + (good ? 1 : 0);
    const nextRound = round + 1;
    const nextEvidenceAnswers = [
      ...evidenceAnswers,
      direction,
    ];

    if (nextRound >= profile.total) {
      onComplete(
        createResult({
          solved: true,
          accuracy: accuracyFromCorrect(
            nextCorrect,
            profile.total
          ),
          startedAt,
          evidence: {
            answers: nextEvidenceAnswers,
          },
        })
      );

      return;
    }

    setEvidenceAnswers(nextEvidenceAnswers);
    setCorrect(nextCorrect);
    setRound(nextRound);
    setQuestion(
      makeDirectionRound(profile.opposite, rng)
    );
  };

  return (
    <GameShell
      title="Direction Rush"
      instruction="Follow the instruction: tap the SAME direction or its OPPOSITE."
      progress={`Round ${round + 1} / ${profile.total}`}
    >
      <div className="flex justify-center">
        <DifficultyBadge difficulty={profile.difficulty} />
      </div>

      <div className="text-center mt-6">
        <div className="text-sm font-black tracking-[0.3em] text-orange-500">
          {question.instruction}
        </div>

        <div className="text-8xl md:text-9xl font-black my-5">
          {question.shown.icon}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
        <div />

        <ChoiceButton onClick={() => pick('up')}>↑</ChoiceButton>

        <div />

        <ChoiceButton onClick={() => pick('left')}>←</ChoiceButton>

        <ChoiceButton onClick={() => pick('down')}>↓</ChoiceButton>

        <ChoiceButton onClick={() => pick('right')}>→</ChoiceButton>
      </div>
    </GameShell>
  );
}


/* ============================================================
   7. SHAPE SEQUENCE
   Procedurally generated visual sequence.
   ============================================================ */

const SHAPES = ['●', '■', '▲', '◆', '★', '⬟'];

function makeShapeSequence(difficulty, rng = Math.random) {
  const a = randomItem(SHAPES, rng);

  let b = randomItem(SHAPES, rng);

  while (b === a) b = randomItem(SHAPES, rng);

  let sequence;
  let answer;

  if (difficulty === 'easy') {
    sequence = [a, b, a, b, a];
    answer = b;
  } else if (difficulty === 'medium') {
    sequence = [a, a, b, a, a, b];
    answer = a;
  } else {
    let c = randomItem(SHAPES, rng);

    while (c === a || c === b) {
      c = randomItem(SHAPES, rng);
    }

    if (difficulty === 'hard') {
      sequence = [a, b, c, a, b];
      answer = c;
    } else {
      sequence = [a, b, b, c, c, c, a, b, b];
      answer = c;
    }
  }

  return {
    sequence,
    answer,
    options: shuffle(
      Array.from(new Set([answer, ...shuffle(SHAPES, rng)]))
        .slice(0, 4),
      rng
    ),
  };
}

export function ShapeSequence({ config, onComplete }) {
  const rngRef = useRef(null);

  if (!rngRef.current) {
    rngRef.current = createRandomSource(
      config,
      'shape_sequence'
    );
  }

  const rng = rngRef.current;

  const profile = difficultyProfile(config, {
    easy:   { total: 6 },
    medium: { total: 8 },
    hard:   { total: 10 },
    expert: { total: 12 },
  });

  const [question, setQuestion] = useState(() =>
    makeShapeSequence(profile.difficulty, rng)
  );

  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [evidenceAnswers, setEvidenceAnswers] = useState([]);
  const [startedAt] = useState(now);

  const pick = (shape) => {
    const good = shape === question.answer;
    const nextCorrect = correct + (good ? 1 : 0);
    const nextRound = round + 1;
    const nextEvidenceAnswers = [
      ...evidenceAnswers,
      shape,
    ];

    if (nextRound >= profile.total) {
      onComplete(
        createResult({
          solved: true,
          accuracy: accuracyFromCorrect(
            nextCorrect,
            profile.total
          ),
          startedAt,
          evidence: {
            answers: nextEvidenceAnswers,
          },
        })
      );

      return;
    }

    setEvidenceAnswers(nextEvidenceAnswers);
    setCorrect(nextCorrect);
    setRound(nextRound);
    setQuestion(
      makeShapeSequence(profile.difficulty, rng)
    );
  };

  return (
    <GameShell
      title="Shape Sequence"
      instruction="Work out which shape comes next."
      progress={`Pattern ${round + 1} / ${profile.total}`}
    >
      <div className="flex justify-center mb-5">
        <DifficultyBadge difficulty={profile.difficulty} />
      </div>

      <div className="flex justify-center flex-wrap items-center gap-3 text-4xl md:text-5xl my-7">
        {question.sequence.map((shape, index) => (
          <span key={index}>{shape}</span>
        ))}

        <span className="text-orange-500 font-black">?</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {question.options.map((shape) => (
          <ChoiceButton
            key={shape}
            onClick={() => pick(shape)}
          >
            <span className="text-4xl">{shape}</span>
          </ChoiceButton>
        ))}
      </div>
    </GameShell>
  );
}


/* ============================================================
   8. QUICK COMPARE
   Compare two fresh arithmetic expressions.
   ============================================================ */

function makeExpression(max, rng = Math.random) {
  const a = randomInt(1, max, rng);
  const b = randomInt(1, max, rng);
  const op = randomItem(['+', '-', '×'], rng);

  if (op === '+') {
    return {
      text: `${a} + ${b}`,
      value: a + b,
    };
  }

  if (op === '-') {
    const high = Math.max(a, b);
    const low = Math.min(a, b);

    return {
      text: `${high} − ${low}`,
      value: high - low,
    };
  }

  const x = randomInt(2, Math.max(3, Math.floor(max / 4)), rng);
  const y = randomInt(2, Math.max(3, Math.floor(max / 4)), rng);

  return {
    text: `${x} × ${y}`,
    value: x * y,
  };
}

function makeComparison(max, rng = Math.random) {
  let left = makeExpression(max, rng);
  let right = makeExpression(max, rng);

  let guard = 0;

  while (left.value === right.value && guard < 10) {
    right = makeExpression(max, rng);
    guard += 1;
  }

  return {
    left,
    right,
    answer:
      left.value === right.value
        ? '='
        : left.value > right.value
          ? '>'
          : '<',
  };
}

export function QuickCompare({ config, onComplete }) {
  const rngRef = useRef(null);

  if (!rngRef.current) {
    rngRef.current = createRandomSource(
      config,
      'quick_compare'
    );
  }

  const rng = rngRef.current;

  const profile = difficultyProfile(config, {
    easy:   { total: 8, max: 15 },
    medium: { total: 12, max: 30 },
    hard:   { total: 16, max: 60 },
    expert: { total: 20, max: 120 },
  });

  const [question, setQuestion] = useState(() =>
    makeComparison(profile.max, rng)
  );

  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [evidenceAnswers, setEvidenceAnswers] = useState([]);
  const [startedAt] = useState(now);

  const pick = (choice) => {
    const good = choice === question.answer;

    const nextEvidenceAnswers = [
      ...evidenceAnswers,
      choice,
    ];

    const nextCorrect = correct + (good ? 1 : 0);
    const nextRound = round + 1;

    if (nextRound >= profile.total) {
      onComplete(
        createResult({
          solved: true,
          accuracy: accuracyFromCorrect(
            nextCorrect,
            profile.total
          ),
          startedAt,
          evidence: {
            answers: nextEvidenceAnswers,
          },
        })
      );

      return;
    }

    setCorrect(nextCorrect);
    setEvidenceAnswers(nextEvidenceAnswers);
    setRound(nextRound);
    setQuestion(makeComparison(profile.max, rng));
  };

  return (
    <GameShell
      title="Quick Compare"
      instruction="Compare the values of the two expressions."
      progress={`Round ${round + 1} / ${profile.total}`}
    >
      <div className="flex justify-center mb-6">
        <DifficultyBadge difficulty={profile.difficulty} />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center my-7">
        <div className="rounded-xl bg-slate-100 p-5 font-black text-2xl">
          {question.left.text}
        </div>

        <div className="font-black text-slate-300 text-2xl">
          ?
        </div>

        <div className="rounded-xl bg-slate-100 p-5 font-black text-2xl">
          {question.right.text}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {['<', '=', '>'].map((symbol) => (
          <ChoiceButton
            key={symbol}
            onClick={() => pick(symbol)}
          >
            <span className="text-3xl">{symbol}</span>
          </ChoiceButton>
        ))}
      </div>
    </GameShell>
  );
}


/* ============================================================
   9. LOGIC CODE BREAKER
   Mastermind-style deduction game.
   ============================================================ */

function createCode(length, rng = Math.random) {
  const digits = shuffle(
    Array.from(
      { length: 10 },
      (_, index) => String(index)
    ),
    rng
  );

  return digits.slice(0, length).join('');
}

function evaluateCode(secret, guess) {
  let exact = 0;
  let misplaced = 0;

  const secretUsed = Array(secret.length).fill(false);
  const guessUsed = Array(secret.length).fill(false);

  for (let i = 0; i < secret.length; i += 1) {
    if (secret[i] === guess[i]) {
      exact += 1;
      secretUsed[i] = true;
      guessUsed[i] = true;
    }
  }

  for (let i = 0; i < guess.length; i += 1) {
    if (guessUsed[i]) continue;

    for (let j = 0; j < secret.length; j += 1) {
      if (secretUsed[j]) continue;

      if (guess[i] === secret[j]) {
        misplaced += 1;
        secretUsed[j] = true;
        break;
      }
    }
  }

  return { exact, misplaced };
}

export function LogicCodeBreaker({ config, onComplete }) {
  const rngRef = useRef(null);

  if (!rngRef.current) {
    rngRef.current = createRandomSource(
      config,
      'logic_code_breaker'
    );
  }

  const rng = rngRef.current;

  const profile = difficultyProfile(config, {
    easy:   { length: 3, maxGuesses: 9 },
    medium: { length: 3, maxGuesses: 7 },
    hard:   { length: 4, maxGuesses: 8 },
    expert: { length: 4, maxGuesses: 6 },
  });

  const [secret] = useState(() =>
    createCode(profile.length, rng)
  );

  const [guess, setGuess] = useState('');
  const [history, setHistory] = useState([]);
  const [startedAt] = useState(now);
  const finishedRef = useRef(false);

  const submit = () => {
    if (finishedRef.current) return;

    if (
      guess.length !== profile.length ||
      !/^\d+$/.test(guess)
    ) {
      return;
    }

    const result = evaluateCode(secret, guess);
    const nextHistory = [
      ...history,
      {
        guess,
        ...result,
      },
    ];

    setHistory(nextHistory);

    if (result.exact === profile.length) {
      finishedRef.current = true;

      const accuracy = clamp(
        1 -
          Math.max(0, nextHistory.length - 1) *
            (profile.difficulty === 'expert' ? 0.1 : 0.08)
      );

      onComplete(
        createResult({
          solved: true,
          accuracy,
          startedAt,
          evidence: {
            guesses: nextHistory.map((item) => item.guess),
          },
        })
      );

      return;
    }

    if (nextHistory.length >= profile.maxGuesses) {
      finishedRef.current = true;

      const bestExact = Math.max(
        0,
        ...nextHistory.map((item) => item.exact)
      );

      onComplete(
        createResult({
          solved: false,
          accuracy:
            bestExact / profile.length,
          startedAt,
          evidence: {
            guesses: nextHistory.map((item) => item.guess),
          },
        })
      );

      return;
    }

    setGuess('');
  };

  return (
    <GameShell
      title="Logic Code Breaker"
      instruction={`Crack the ${profile.length}-digit code. Digits do not repeat.`}
      progress={`${history.length} / ${profile.maxGuesses} guesses used`}
      footer="Exact = correct digit in the correct position. Misplaced = correct digit in the wrong position."
    >
      <div className="flex justify-center mb-5">
        <DifficultyBadge difficulty={profile.difficulty} />
      </div>

      <div className="flex gap-2">
        <input
          value={guess}
          maxLength={profile.length}
          inputMode="numeric"
          pattern="[0-9]*"
          onChange={(event) =>
            setGuess(
              event.target.value
                .replace(/\D/g, '')
                .slice(0, profile.length)
            )
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          placeholder={'•'.repeat(profile.length)}
          className="flex-1 min-w-0 rounded-xl border-2 border-slate-200 px-4 py-3 text-center text-2xl tracking-[0.4em] font-black outline-none focus:border-[#6C2BFF]"
          data-testid="code-breaker-input"
        />

        <button
          onClick={submit}
          className="px-5 rounded-xl bg-[#6C2BFF] text-white font-extrabold"
        >
          Check
        </button>
      </div>

      <div className="mt-5 space-y-2">
        {history
          .slice()
          .reverse()
          .map((item, index) => (
            <div
              key={`${item.guess}-${index}`}
              className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm"
            >
              <div className="font-mono font-black tracking-widest">
                {item.guess}
              </div>

              <div className="text-emerald-600 font-bold text-center">
                Exact {item.exact}
              </div>

              <div className="text-orange-500 font-bold text-right">
                Misplaced {item.misplaced}
              </div>
            </div>
          ))}
      </div>
    </GameShell>
  );
}


/* ============================================================
   10. MOVING TARGET PRO
   Precision + reaction.
   ============================================================ */

function newTargetPosition(rng = Math.random) {
  return {
    x: randomInt(8, 88, rng),
    y: randomInt(8, 88, rng),
  };
}

export function MovingTargetPro({ config, onComplete }) {
  const rngRef = useRef(null);

  if (!rngRef.current) {
    rngRef.current = createRandomSource(
      config,
      'moving_target_pro'
    );
  }

  const rng = rngRef.current;

  const profile = difficultyProfile(config, {
    easy: {
      hits: 10,
      size: 64,
    },
    medium: {
      hits: 15,
      size: 52,
    },
    hard: {
      hits: 18,
      size: 42,
    },
    expert: {
      hits: 22,
      size: 34,
    },
  });

  const [position, setPosition] =
    useState(() => newTargetPosition(rng));

  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [startedAt] = useState(now);
  const completedRef = useRef(false);

  const miss = () => {
    if (completedRef.current) return;
    setMisses((value) => value + 1);
  };

  const hit = (event) => {
    event.stopPropagation();

    if (completedRef.current) return;

    const nextHits = hits + 1;

    if (nextHits >= profile.hits) {
      completedRef.current = true;

      onComplete(
        createResult({
          solved: true,
          accuracy:
            profile.hits /
            Math.max(
              profile.hits,
              profile.hits + misses
            ),
          startedAt,
        })
      );

      return;
    }

    setHits(nextHits);
    setPosition(newTargetPosition(rng));
  };

  return (
    <GameShell
      title="Moving Target Pro"
      instruction="Hit every moving target. Smaller targets appear at higher difficulty."
      progress={`${hits} / ${profile.hits} targets hit`}
    >
      <div className="flex items-center justify-between mb-4">
        <DifficultyBadge difficulty={profile.difficulty} />

        <div className="text-sm text-slate-500">
          Misses: <b>{misses}</b>
        </div>
      </div>

      <div
        onClick={miss}
        className="relative w-full aspect-square md:aspect-video rounded-2xl bg-slate-950 overflow-hidden cursor-crosshair select-none"
        data-testid="moving-target-pro-arena"
      >
        <button
          type="button"
          onClick={hit}
          data-testid="moving-target-pro-target"
          className="absolute rounded-full bg-gradient-to-br from-orange-400 via-rose-500 to-fuchsia-600 border-4 border-white shadow-xl shadow-fuchsia-500/30"
          style={{
            width: `${profile.size}px`,
            height: `${profile.size}px`,
            left: `${position.x}%`,
            top: `${position.y}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span className="absolute inset-1/3 rounded-full bg-white/90" />
        </button>
      </div>
    </GameShell>
  );
}


/* ============================================================
   BATCH 1 REGISTRY
   ============================================================ */

export const GAME_MAP_V3_BATCH1 = {
  rapid_equation: (config, onComplete) => (
    <RapidEquation
      config={config}
      onComplete={onComplete}
    />
  ),

  missing_operator: (config, onComplete) => (
    <MissingOperator
      config={config}
      onComplete={onComplete}
    />
  ),

  number_grid_hunt: (config, onComplete) => (
    <NumberGridHunt
      config={config}
      onComplete={onComplete}
    />
  ),

  equation_balance: (config, onComplete) => (
    <EquationBalance
      config={config}
      onComplete={onComplete}
    />
  ),

  memory_grid: (config, onComplete) => (
    <MemoryGrid
      config={config}
      onComplete={onComplete}
    />
  ),

  direction_rush: (config, onComplete) => (
    <DirectionRush
      config={config}
      onComplete={onComplete}
    />
  ),

  shape_sequence: (config, onComplete) => (
    <ShapeSequence
      config={config}
      onComplete={onComplete}
    />
  ),

  quick_compare: (config, onComplete) => (
    <QuickCompare
      config={config}
      onComplete={onComplete}
    />
  ),

  logic_code_breaker: (config, onComplete) => (
    <LogicCodeBreaker
      config={config}
      onComplete={onComplete}
    />
  ),

  moving_target_pro: (config, onComplete) => (
    <MovingTargetPro
      config={config}
      onComplete={onComplete}
    />
  ),
};

export const GAME_META_V3_BATCH1 = [
  {
    id: 'rapid_equation',
    label: 'Rapid Equation',
    category: 'math',
  },
  {
    id: 'missing_operator',
    label: 'Missing Operator',
    category: 'math',
  },
  {
    id: 'number_grid_hunt',
    label: 'Number Grid Hunt',
    category: 'reaction',
  },
  {
    id: 'equation_balance',
    label: 'Equation Balance',
    category: 'math',
  },
  {
    id: 'memory_grid',
    label: 'Memory Grid',
    category: 'memory',
  },
  {
    id: 'direction_rush',
    label: 'Direction Rush',
    category: 'reaction',
  },
  {
    id: 'shape_sequence',
    label: 'Shape Sequence',
    category: 'reasoning',
  },
  {
    id: 'quick_compare',
    label: 'Quick Compare',
    category: 'math',
  },
  {
    id: 'logic_code_breaker',
    label: 'Logic Code Breaker',
    category: 'logic',
  },
  {
    id: 'moving_target_pro',
    label: 'Moving Target Pro',
    category: 'reaction',
  },
];
