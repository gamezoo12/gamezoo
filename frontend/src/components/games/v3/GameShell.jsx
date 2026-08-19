import React from 'react';

export default function GameShell({
  title,
  instruction,
  progress,
  children,
  footer,
}) {
  return (
    <div className="max-w-xl mx-auto" data-testid="v3-game-shell">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="text-xs uppercase tracking-[0.18em] text-[#6C2BFF] font-bold">
            Prize League Skill Challenge
          </div>

          <h2 className="mt-1 font-display text-xl md:text-2xl font-extrabold text-slate-900">
            {title}
          </h2>

          {instruction && (
            <p className="mt-1 text-sm text-slate-500">
              {instruction}
            </p>
          )}

          {progress && (
            <div className="mt-3 text-xs font-semibold text-slate-500">
              {progress}
            </div>
          )}
        </div>

        <div className="p-5 md:p-6">
          {children}
        </div>

        {footer && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
