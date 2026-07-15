import LegalPage from '../../components/legal/LegalPage';
import { MOBILE_TERMS } from './content/mobile-terms';

export default function MobileTermsPage() {
  return (
    <LegalPage
      title="Mobile Terms of Service"
      effectiveDate="15 July 2026"
      lastUpdated="15 July 2026"
      body={MOBILE_TERMS}
    />
  );
}
