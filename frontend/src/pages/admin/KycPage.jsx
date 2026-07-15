import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Check, X, Clock, Shield, FileText } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

const TABS = [
  { key: 'pending', label: 'Pending review', badge: 'bg-amber-100 text-amber-700' },
  { key: 'approved', label: 'Approved', badge: 'bg-emerald-100 text-emerald-700' },
  { key: 'rejected', label: 'Rejected', badge: 'bg-rose-100 text-rose-700' },
  { key: 'all', label: 'All' },
];

export default function KycAdmin() {
  const [tab, setTab] = useState('pending');
  const [items, setItems] = useState([]);
  const { toast } = useToast();

  const load = () => adminAPI.kycList(tab).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, [tab]);

  const approve = async (id) => { try { await adminAPI.kycApprove(id); toast({ title: 'KYC approved' }); load(); } catch (e) { toast({ title: 'Failed', description: e?.response?.data?.detail }); } };
  const reject = async (id) => { const reason = window.prompt('Reason for rejection?'); if (reason === null) return; try { await adminAPI.kycReject(id, reason); toast({ title: 'KYC rejected' }); load(); } catch (e) { toast({ title: 'Failed', description: e?.response?.data?.detail }); } };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="font-display text-2xl font-extrabold flex items-center gap-2"><Shield className="w-6 h-6 text-[#6C2BFF]" /> Identity Verification (KYC)</h2>
        <div className="flex gap-1 bg-white border border-slate-100 p-1 rounded-xl">
          {TABS.map(t => <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-[#6C2BFF] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{t.label}</button>)}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-3"><FileText className="w-6 h-6 text-slate-400" /></div>
          <div className="text-slate-500 text-sm">No KYC submissions here.</div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {items.map(k => (
            <div key={k.kyc_id} className="bg-white rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{k.user_name}</div>
                  <div className="text-xs text-slate-500">{k.user_email}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${k.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : k.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                  {k.status === 'pending' && <Clock className="w-3 h-3 inline mr-1" />}
                  {k.status}
                </span>
              </div>
              <div className="mt-3 text-sm space-y-1 text-slate-600">
                <div><span className="text-slate-400 w-20 inline-block">Legal name</span> {k.full_name}</div>
                <div><span className="text-slate-400 w-20 inline-block">DOB</span> {k.dob}</div>
                <div><span className="text-slate-400 w-20 inline-block">Country</span> {k.country}</div>
                <div><span className="text-slate-400 w-20 inline-block">Address</span> {k.address}</div>
                <div><span className="text-slate-400 w-20 inline-block">ID {k.id_type}</span> {k.id_number}</div>
                {k.phone && <div><span className="text-slate-400 w-20 inline-block">Phone</span> {k.phone}</div>}
                <div className="text-xs text-slate-400 pt-1">Submitted {new Date(k.submitted_at).toLocaleString('en-GB')}</div>
                {k.reject_reason && <div className="text-xs text-rose-600">Rejected: {k.reject_reason}</div>}
              </div>
              {k.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => approve(k.kyc_id)} className="bg-emerald-600 hover:bg-emerald-700"><Check className="w-4 h-4 mr-1" /> Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => reject(k.kyc_id)} className="text-rose-600 border-rose-200 hover:bg-rose-50"><X className="w-4 h-4 mr-1" /> Reject</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
