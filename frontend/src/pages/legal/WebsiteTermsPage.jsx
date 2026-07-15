import LegalPage from '../../components/legal/LegalPage';
import { WEBSITE_TERMS } from './content/website-terms';

export default function WebsiteTermsPage() {
  return (
    <LegalPage
      title="Website Terms of Use & Acceptable Use Policy"
      effectiveDate="15 July 2026"
      lastUpdated="15 July 2026"
      body={WEBSITE_TERMS}
    />
  );
}
