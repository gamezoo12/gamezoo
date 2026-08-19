import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function BackButton({
  to,
  fallback = '/',
  label = 'Back',
  className = '',
}) {
  const nav = useNavigate();
  const location = useLocation();

  const go = () => {
    /*
     * Explicit `to` is still supported for flows that genuinely require
     * a fixed destination.
     *
     * Otherwise prefer the route that opened this page, then browser
     * history, and finally the supplied fallback.
     */
    if (to) {
      nav(to);
      return;
    }

    const from = location.state?.from;

    if (
      typeof from === 'string' &&
      from.startsWith('/') &&
      !from.startsWith('//')
    ) {
      nav(from);
      return;
    }

    if (window.history.length > 1) {
      nav(-1);
      return;
    }

    nav(fallback);
  };

  return (
    <button
      type="button"
      onClick={go}
      className={`inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors ${className}`}
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </button>
  );
}
