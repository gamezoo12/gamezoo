import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { legalAPI } from '../../lib/api';
import { COMPANY } from '../../lib/brand';
import BackButton from '../../components/BackButton';
import { FileText, Calendar, Hash, User as UserIcon, ArrowRight } from 'lucide-react';

export default function LegalDocPage() {
  const { slug } = useParams();
  const [doc, setDoc] = useState(null);
  const [others, setOthers] = useState([]);
  const [state, setState] = useState('loading');   // loading | ok | missing | error

  useEffect(() => {
    setState('loading');
    setDoc(null);
    legalAPI.get(slug)
      .then(d => { setDoc(d); setState('ok'); })
      .catch(err => {
        if (err?.response?.status === 404) setState('missing');
        else setState('error');
      });
    legalAPI.list().then(r => setOthers(r.documents || [])).catch(() => {});
  }, [slug]);

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8" data-testid="legal-doc-page">
      <BackButton to="/" label="Back to home" className="mb-4" />
      <div className="grid lg:grid-cols-[1fr_260px] gap-8">
        <article className="bg-white rounded-2xl border border-slate-200 p-6 lg:p-10 shadow-sm">
          {state === 'loading' && (
            <div className="text-slate-500 text-sm py-16 text-center">Loading…</div>
          )}
          {state === 'missing' && (
            <div className="py-16 text-center">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h2 className="font-display font-extrabold text-xl mb-1">Not published yet</h2>
              <p className="text-slate-500 text-sm">
                This policy has not been published. Please check back soon or contact
                <a className="text-indigo-600 ml-1" href={`mailto:${COMPANY.emails.support}`}>{COMPANY.emails.support}</a>.
              </p>
            </div>
          )}
          {state === 'error' && (
            <div className="py-16 text-center text-rose-600">Failed to load. Please retry.</div>
          )}
          {state === 'ok' && doc && (
            <>
              <div className="flex items-start gap-3 mb-2">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-700 text-white flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="font-display font-extrabold text-2xl sm:text-3xl leading-tight text-slate-900" data-testid="legal-doc-title">
                    {doc.title}
                  </h1>
                  <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1"><Hash className="w-3 h-3" /> v{doc.version}</span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Effective {doc.effective_date ? new Date(doc.effective_date).toLocaleDateString('en-GB') : '—'}
                    </span>
                    <span className="inline-flex items-center gap-1"><UserIcon className="w-3 h-3" /> {doc.owner}</span>
                  </div>
                </div>
              </div>

              <div className="prose prose-slate max-w-none mt-6 text-[15px] leading-relaxed">
                <ReactMarkdown>{doc.content || ''}</ReactMarkdown>
              </div>

              <div className="border-t border-slate-100 mt-8 pt-4 text-[11px] text-slate-500 leading-relaxed">
                <p>
                  <strong>{COMPANY.legalName}</strong> · Company No. {COMPANY.companyNumber} ·
                  Registered in {COMPANY.jurisdiction}. Registered office:
                  {' '}{COMPANY.registeredOffice.line1}, {COMPANY.registeredOffice.line2},
                  {' '}{COMPANY.registeredOffice.country}, {COMPANY.registeredOffice.postcode},
                  {' '}{COMPANY.registeredOffice.countryFull}.
                </p>
              </div>
            </>
          )}
        </article>

        <aside className="lg:sticky lg:top-24 self-start bg-slate-50 rounded-2xl border border-slate-200 p-4 h-fit">
          <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider mb-2">Legal & policies</div>
          <ul className="space-y-1">
            {others.map(o => (
              <li key={o.slug}>
                <Link
                  to={`/legal/${o.slug}`}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-sm ${
                    o.slug === slug
                      ? 'bg-indigo-100 text-indigo-800 font-semibold'
                      : 'text-slate-700 hover:bg-white'
                  }`}
                >
                  <span className="truncate">{o.title}</span>
                  <ArrowRight className="w-3 h-3 opacity-40 shrink-0" />
                </Link>
              </li>
            ))}
            {others.length === 0 && (
              <li className="text-xs text-slate-500 px-2 py-1">No policies published yet.</li>
            )}
          </ul>
        </aside>
      </div>
    </div>
  );
}
