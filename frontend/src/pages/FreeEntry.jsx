import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';

export default function FreeEntry() {
  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:underline mb-6"><ArrowLeft className="w-4 h-4" /> Back to home</Link>

      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold mb-3">
        <ShieldCheck className="w-3.5 h-3.5" /> UK LAW COMPLIANT • FREE ENTRY ROUTE
      </div>
      <h1 className="font-display text-4xl font-extrabold text-slate-900">Free Postal Entry</h1>
      <p className="text-slate-600 mt-3 leading-relaxed">Under UK skill-competition law we are required to offer a genuine free entry route to every Prize League contest. You can enter any live contest for free by post – you’ll receive the same odds as a paid entry.</p>

      <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="font-display text-xl font-bold text-slate-900">How to enter for free</h2>
        <ol className="mt-4 space-y-3 text-slate-700 leading-relaxed list-decimal list-inside">
          <li>On a plain, unlined postcard write:
            <ul className="list-disc ml-6 mt-1 space-y-1 text-sm text-slate-600">
              <li>Your full name, address, date of birth and email</li>
              <li>The exact name of the contest you’d like to enter</li>
              <li>Your answer to the skill question shown on that contest’s page</li>
            </ul>
          </li>
          <li>Post the card to:
            <div className="mt-2 p-4 rounded-xl bg-slate-50 border border-slate-100 text-sm text-slate-800 font-mono">
              Prize League Free Entry<br />PO Box 4210<br />London EC1A 1BB<br />United Kingdom
            </div>
          </li>
          <li>Your card must arrive at least 24 hours before the contest’s draw time to be valid. One card = one entry per contest, per person, per day.</li>
          <li>Your free entry ticket number is emailed to you within 48 hours of us receiving your card.</li>
        </ol>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="font-display text-lg font-bold text-slate-900">Fair play</h3>
        <p className="text-slate-600 mt-2 text-sm leading-relaxed">Every free postal entry is treated exactly the same as a paid entry. Winners are drawn from the combined pool of paid and postal entries, so free entrants have the same chance of winning any prize.</p>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Link to="/competitions"><Button className="bg-teal-600 hover:bg-teal-700">Browse contests</Button></Link>
        <a href="mailto:support@prizeleague.co.uk"><Button variant="outline"><Mail className="w-4 h-4 mr-1" /> Questions? support@prizeleague.co.uk</Button></a>
      </div>
    </div>
  );
}
