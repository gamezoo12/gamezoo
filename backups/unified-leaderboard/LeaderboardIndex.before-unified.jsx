import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, ArrowRight } from 'lucide-react';
import { contestsAPI } from '../lib/api';

export default function LeaderboardIndex() {
  const [contests, setContests] = useState([]);

  useEffect(() => {
    contestsAPI.list()
      .then(data => setContests(data || []))
      .catch(() => setContests([]));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest font-bold text-[#6C2BFF]">
          Contest Leaderboards
        </div>

        <h1 className="font-display text-4xl font-extrabold text-slate-900 mt-2">
          Select a Contest
        </h1>

        <p className="text-slate-500 mt-2">
          Every contest has its own independent leaderboard.
        </p>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
        {contests.map((contest) => (
          <div
            key={contest.contest_id}
            className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
          >
            {contest.image && (
              <img
                src={contest.image}
                alt={contest.title}
                className="w-full h-52 object-cover"
              />
            )}

            <div className="p-6">
              <div className="text-xs font-bold uppercase tracking-widest text-[#6C2BFF]">
                {contest.status}
              </div>

              <h2 className="font-display text-2xl font-extrabold mt-2">
                {contest.title}
              </h2>

              <Link
                to={`/leaderboard/${contest.contest_id}`}
                className="mt-5 inline-flex items-center gap-2 text-[#6C2BFF] font-bold"
              >
                View Leaderboard
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
