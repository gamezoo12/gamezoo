import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { ArrowLeft, Mail, ShieldCheck, Printer } from 'lucide-react';
import { api } from '../lib/api';
import { COMPANY as FALLBACK_COMPANY } from '../lib/brand';

export default function FreeEntry() {
  const [c, setC] = useState(null);

  useEffect(() => {
    api.get('/public/company')
      .then(r => setC(r.data))
      .catch(() => setC(null));   // fall through to static brand config below
  }, []);

  // Merge live company settings with static fallback so we always render.
  const legalName = c?.legal_name || FALLBACK_COMPANY.legalName;
  const line1 = c?.postal_address_line1 || FALLBACK_COMPANY.registeredOffice.line1;
  const line2 = c?.postal_address_line2 || FALLBACK_COMPANY.registeredOffice.line2;
  const country = c?.postal_address_country || FALLBACK_COMPANY.registeredOffice.country;
  const postcode = c?.postal_address_postcode || FALLBACK_COMPANY.registeredOffice.postcode;
  const countryFull = c?.postal_address_country_full || FALLBACK_COMPANY.registeredOffice.countryFull;
  const supportEmail = c?.email_support || FALLBACK_COMPANY.emails.support;
  const requiredDetails = c?.postal_required_details || (
    '- Full name\n- Prize League public ID or registered email\n' +
    '- Confirmation you are aged 18+ and agree to the Terms & Conditions\n' +
    '- The exact name of the competition\n- Your answer to the skill task'
  );

  const requiredLines = requiredDetails.split('\n').filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-12" data-testid="free-entry-page">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:underline mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to home
      </Link>

      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold mb-3">
        <ShieldCheck className="w-3.5 h-3.5" /> UK-COMPLIANT · FREE ENTRY ROUTE
      </div>
      <h1 className="font-display text-4xl font-extrabold text-slate-900">Free Postal Entry</h1>
      <p className="text-slate-600 mt-3 leading-relaxed">
        Every Prize League competition that displays a "Free postal entry available" badge accepts
        entries by post at no cost. Your postal entry is treated identically to a paid entry — same
        odds, same rules, same prizes.
      </p>

      <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="font-display text-xl font-bold text-slate-900">Required envelope contents</h2>
        <p className="text-sm text-slate-500 mt-1">On a plain, unlined card write the following:</p>
        <ul className="mt-3 space-y-1.5 text-slate-700 text-sm list-disc list-inside" data-testid="postal-required-list">
          {requiredLines.map((line, i) => (
            <li key={i}>{line.replace(/^[-•]\s*/, '')}</li>
          ))}
        </ul>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="font-display text-xl font-bold text-slate-900">Postal address</h2>
        <div
          className="mt-3 p-5 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 font-mono text-slate-800 leading-relaxed"
          data-testid="postal-address"
        >
          Free Postal Entry<br />
          {legalName}<br />
          {line1}<br />
          {line2}<br />
          {country}<br />
          {postcode}<br />
          {countryFull}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => window.print()}
          data-testid="postal-print-btn"
        >
          <Printer className="w-4 h-4 mr-1" /> Print this page
        </Button>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="font-display text-lg font-bold text-slate-900">Fair play</h3>
        <p className="text-slate-600 mt-2 text-sm leading-relaxed">
          Postal entries must arrive before the specific contest closes. Your entry is added to the
          combined pool for winner determination. Duplicate, late or incomplete envelopes are
          reviewed by our compliance team and may be rejected — the full workflow and reasons are
          documented in the Free Postal Entry Policy.
        </p>
        <div className="mt-3">
          <Link to="/legal/postal-entry" className="text-sm text-teal-700 font-semibold hover:underline">
            Read the Free Postal Entry Policy →
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Link to="/competitions"><Button className="bg-teal-600 hover:bg-teal-700">Browse contests</Button></Link>
        <a href={`mailto:${supportEmail}`}>
          <Button variant="outline"><Mail className="w-4 h-4 mr-1" /> Questions? {supportEmail}</Button>
        </a>
      </div>
    </div>
  );
}
