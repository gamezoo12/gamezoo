import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function BackButton({ className = '' }) {
  const nav = useNavigate();
  const canGoBack = window.history.length > 1;
  return (
    <button
      type="button"
      onClick={() => canGoBack && nav(-1)}
      disabled={!canGoBack}
      aria-label="Back to previous page"
      data-page-back-control="true"
      className={`inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-teal-600 disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      <ArrowLeft className="w-4 h-4" /> Back
    </button>
  );
}
