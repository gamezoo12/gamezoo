import { Trophy } from 'lucide-react';

export default function DrawResults() {
  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
      <h1 className="font-display text-4xl font-extrabold text-slate-900">
        Draw Results
      </h1>
      <p className="text-slate-500 mt-1">
        Completed competitions and verified winners will appear here.
      </p>

      <div className="mt-8 bg-white rounded-2xl border border-slate-100 p-12 text-center">
        <Trophy className="w-14 h-14 text-slate-300 mx-auto" />
        <h2 className="font-display text-2xl font-extrabold text-slate-900 mt-4">
          No draw results yet
        </h2>
        <p className="text-slate-500 mt-2 max-w-xl mx-auto">
          Once a competition has ended and its winner has been verified,
          the official result will appear here.
        </p>
      </div>
    </div>
  );
}
