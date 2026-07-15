/**
 * Prize League — legal document renderer.
 * Renders a plain-text legal doc with light markup:
 *   • Lines that look like a section number (e.g. "1. ", "5A.1", "20.3") → styled heading
 *   • Lines starting with "*" or "•" → list bullets
 *   • Everything else → paragraph
 *
 * Kept intentionally simple — legal copy should be readable, not designy.
 * All HTML is sanitised via DOMPurify before render (only <strong> and <em> retained).
 */
import DOMPurify from 'dompurify';

const SANITIZE_CONFIG = { ALLOWED_TAGS: ['strong', 'em'], ALLOWED_ATTR: [] };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);

export default function LegalPage({ title, effectiveDate, lastUpdated, body }) {
  const blocks = body.split(/\n\n+/).map(b => b.trim()).filter(Boolean);

  const isHeading = (line) => /^(\d+[A-Z]?(?:\.\d+)*\.?\s+\S+|PART[-\s][AB]:|END OF)/.test(line.trim())
    || /^[A-Z][A-Z0-9\s,&()'"–\-]{3,}$/.test(line.trim());

  return (
    <div className="bg-white" data-testid="legal-page">
      <section className="pl-hero-bg text-white py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4 lg:px-8">
          <h1 className="font-display font-extrabold text-3xl md:text-5xl">{title}</h1>
          <div className="mt-3 text-white/70 text-sm flex flex-wrap gap-4">
            {effectiveDate && <span><b className="text-white/90">Effective:</b> {effectiveDate}</span>}
            {lastUpdated && <span><b className="text-white/90">Last updated:</b> {lastUpdated}</span>}
          </div>
        </div>
      </section>

      <article className="max-w-4xl mx-auto px-4 lg:px-8 py-10 md:py-14 prose-legal">
        {blocks.map((block) => {
          const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length === 0) return null;
          const blockKey = slug(lines[0]) || `b-${block.length}`;

          if (lines.length === 1 && isHeading(lines[0])) {
            return <h2 key={blockKey} className="font-display font-extrabold text-xl md:text-2xl text-slate-900 mt-8 mb-3">{lines[0]}</h2>;
          }

          const [first, ...rest] = lines;
          const hasHeading = isHeading(first);
          const bodyLines = hasHeading ? rest : lines;

          const bulletsOnly = bodyLines.every(l => /^[*•]\s+/.test(l));
          const listItems = bodyLines.filter(l => /^[*•]\s+/.test(l)).map(l => l.replace(/^[*•]\s+/, ''));
          const otherLines = bodyLines.filter(l => !/^[*•]\s+/.test(l));

          return (
            <div key={blockKey} className="mb-5">
              {hasHeading && (
                <h3 className="font-display font-bold text-lg text-slate-900 mt-6 mb-2">{first.replace(/&amp;/g, '&')}</h3>
              )}
              {otherLines.map((p) => {
                // Convert **bold** to <strong>, then sanitize
                const withBold = p.replace(/&amp;/g, '&').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                const safe = DOMPurify.sanitize(withBold, SANITIZE_CONFIG);
                return (
                  <p key={slug(p) || p.length} className="text-slate-700 leading-relaxed mb-3 text-[15px]" dangerouslySetInnerHTML={{ __html: safe }} />
                );
              })}
              {listItems.length > 0 && (
                <ul className="list-disc pl-6 space-y-1.5 text-slate-700 text-[15px] mb-3">
                  {listItems.map((it) => <li key={slug(it) || it.length}>{it.replace(/&amp;/g, '&')}</li>)}
                </ul>
              )}
              {!hasHeading && bulletsOnly && listItems.length === 0 && (
                <p className="text-slate-700 leading-relaxed">{block}</p>
              )}
            </div>
          );
        })}
      </article>
    </div>
  );
}
