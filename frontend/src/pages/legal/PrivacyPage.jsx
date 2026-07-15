import LegalPage from '../../components/legal/LegalPage';
import { PRIVACY_POLICY } from './content/privacy';

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      effectiveDate="15 July 2026"
      lastUpdated="15 July 2026"
      body={PRIVACY_POLICY}
    />
  );
}
