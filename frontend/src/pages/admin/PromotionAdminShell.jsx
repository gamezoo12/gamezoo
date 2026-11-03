import { useSearchParams } from 'react-router-dom';
import PromotionAdmin from './PromotionAdmin';
import PromotionSourceAnalytics from './PromotionSourceAnalytics';
import PromotionCampaignsAdmin from './PromotionCampaignsAdmin';

const TABS = [['popup', 'Pop-up & Offers'], ['campaigns', 'Campaigns & Draws']];

export default function PromotionAdminShell() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'campaigns' ? 'campaigns' : 'popup';
  return (
    <>
      <div className="mb-4 inline-flex rounded-full border border-slate-200 bg-white p-1" data-testid="promotion-section-tabs">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setParams({ tab: key })} data-testid={`promotion-tab-${key}`}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${tab === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'campaigns' ? <PromotionCampaignsAdmin /> : <><PromotionAdmin /><PromotionSourceAnalytics /></>}
    </>
  );
}
