import LegalPage from '../../components/legal/LegalPage';
import { TERMS_AND_CONDITIONS } from './content/terms';

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      effectiveDate="15 July 2026"
      lastUpdated="15 July 2026"
      body={TERMS_AND_CONDITIONS}
    />
  );
}
