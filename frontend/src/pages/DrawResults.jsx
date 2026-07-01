import { COMPETITIONS, WINNERS } from '../mock/mockData';
import { Badge } from '../components/ui/badge';

export default function DrawResults() {
  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
      <h1 className="font-display text-4xl font-extrabold text-slate-900">Draw Results</h1>
      <p className="text-slate-500 mt-1">All upcoming and past draws.</p>

      <div className="mt-8 bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left p-4">Contest</th>
              <th className="text-left p-4">Prize</th>
              <th className="text-left p-4">Draw Date</th>
              <th className="text-left p-4">Winner</th>
              <th className="text-left p-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {WINNERS.map((w) => (
              <tr key={w.id} className="border-t border-slate-100">
                <td className="p-4 font-medium">{w.prize}</td>
                <td className="p-4">{w.amount}</td>
                <td className="p-4 text-slate-500">{new Date(w.date).toLocaleString('en-GB')}</td>
                <td className="p-4">{w.name}</td>
                <td className="p-4"><Badge className="bg-green-100 text-green-700 hover:bg-green-100">Completed</Badge></td>
              </tr>
            ))}
            {COMPETITIONS.slice(0, 20).map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-4 font-medium text-slate-900">{c.title}</td>
                <td className="p-4 text-teal-700 font-semibold">£{c.prizeAmount}</td>
                <td className="p-4 text-slate-500">{new Date(c.endDate).toLocaleString('en-GB')}</td>
                <td className="p-4 text-slate-400">TBD</td>
                <td className="p-4"><Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Scheduled</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
