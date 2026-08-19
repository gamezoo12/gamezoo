import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function BackButton({ to, label = 'Back', className = '' }) {
  const nav = useNavigate();
  const go = () => {
    if (to) nav(to);
    else if (window.history.length > 1) nav(-1);
    else nav('/');
  };
  return (
    <button onClick={go} className={`inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors ${className}`}>
      <ArrowLeft className="w-4 h-4" /> {label}
    </button>
  );
}
