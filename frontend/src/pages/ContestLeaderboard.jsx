import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { contestsAPI } from '../lib/api';
import UnifiedLeaderboard from '../components/leaderboard/UnifiedLeaderboard';

export default function ContestLeaderboard() {
  const { contestId } = useParams();
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    contestsAPI
      .list()
      .then((response) => {
        setContests(
          Array.isArray(response)
            ? response
            : response?.contests || []
        );
      })
      .catch(() => setContests([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] bg-[#0B0D1F] py-16 text-center text-white">
        Loading leaderboard…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0D1F]">
      <div className="mx-auto max-w-5xl">
        <UnifiedLeaderboard
          contests={contests}
          initialContestId={contestId}
        />
      </div>
    </div>
  );
}
