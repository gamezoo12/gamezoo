import { Link } from 'react-router-dom';
import { Hand } from 'lucide-react';

export default function AnnouncementBar() {
  const items = new Array(12).fill('50 live skill contests \u2022 Entry from just \u00a31 \u2022 UK legal');
  return (
    <div className="bg-gradient-to-r from-teal-600 via-teal-500 to-emerald-500 text-white overflow-hidden py-2 text-sm">
      <div className="flex marquee-track whitespace-nowrap gap-10">
        {items.concat(items).map((t, i) => (
          <Link key={i} to="/competitions" className="flex items-center gap-2 hover:underline">
            <Hand className="w-4 h-4" /> <span>{t}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
