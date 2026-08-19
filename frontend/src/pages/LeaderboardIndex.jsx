import { useEffect, useState } from 'react';
import { contestsAPI } from '../lib/api';
import UnifiedLeaderboard from '../components/leaderboard/UnifiedLeaderboard';

export default function LeaderboardIndex() {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    contestsAPI
      .list()
      .then((response) => {
        if (!active) return;

        const list = Array.isArray(response)
          ? response
          : Array.isArray(response?.contests)
            ? response.contests
            : [];

        setContests(list);
      })
      .catch((err) => {
        if (!active) return;

        setError(
          err?.response?.data?.detail ||
          err?.message ||
          'Could not load contest leaderboards.'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0B0D1F] px-4 py-20 text-center text-white">
        <div className="font-bold">Loading leaderboards…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#0B0D1F] px-4 py-20 text-center">
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200">
          <div className="font-extrabold">Leaderboard unavailable</div>
          <div className="mt-2 text-sm">{error}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B0D1F]">
      <div className="mx-auto w-full max-w-5xl">
        <UnifiedLeaderboard contests={contests} />
      </div>
    </main>
  );
}
