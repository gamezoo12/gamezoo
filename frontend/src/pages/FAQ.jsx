import { FAQ_ITEMS } from '../mock/mockData';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';

export default function FAQ() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="font-display text-4xl font-extrabold text-slate-900 text-center">Frequently Asked Questions</h1>
      <p className="text-slate-500 text-center mt-2">Everything you need to know about entering, winning & getting paid.</p>

      <Accordion type="single" collapsible className="mt-10 bg-white rounded-2xl border border-slate-100 shadow-sm px-6">
        {FAQ_ITEMS.map((f, i) => (
          <AccordionItem key={i} value={`f-${i}`} className="border-slate-100">
            <AccordionTrigger className="text-left font-medium text-slate-900 hover:text-teal-600">{f.q}</AccordionTrigger>
            <AccordionContent className="text-slate-600 leading-relaxed">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
