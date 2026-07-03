import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { ShieldCheck, ShieldAlert, Info, Users } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

const ROLES_INFO = [
  { key: 'super_admin', label: 'Super Admin', color: 'bg-rose-100 text-rose-700', desc: 'Full control including role changes, deleting users, changing settings, and the Emergency stop.' },
  { key: 'admin', label: 'Admin', color: 'bg-amber-100 text-amber-700', desc: 'Manage contests, users, KYC, orders, payments, winners. Cannot demote other admins.' },
  { key: 'operator', label: 'Operator (Production)', color: 'bg-blue-100 text-blue-700', desc: 'Run live draws, manage prize inventory, review KYC. Cannot change site settings.' },
  { key: 'support', label: 'Customer Support', color: 'bg-indigo-100 text-indigo-700', desc: 'Read-only across users/orders. Can approve/reject KYC. Cannot draw winners or change contests.' },
  { key: 'user', label: 'Player (default)', color: 'bg-slate-100 text-slate-700', desc: 'Standard end-user – buys tickets, submits KYC, receives payouts.' },
];

export default function RolesPage() {
  const [users, setUsers] = useState([]);
  const { toast } = useToast();

  const load = () => adminAPI.users().then(setUsers).catch(() => setUsers([]));
  useEffect(() => { load(); }, []);

  const staff = users.filter(u => u.role !== 'user');

  const setRole = async (id, role) => { try { await adminAPI.updateUser(id, { role }); toast({ title: 'Role updated' }); load(); } catch (e) { toast({ title: 'Failed', description: e?.response?.data?.detail }); } };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-extrabold flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-teal-600" /> Roles &amp; Permissions</h2>

      <section className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-3"><Info className="w-4 h-4 text-teal-600" /><h3 className="font-display font-bold">Role guide</h3></div>
        <div className="grid md:grid-cols-2 gap-3">
          {ROLES_INFO.map(r => (
            <div key={r.key} className="border border-slate-100 rounded-xl p-4">
              <span className={`text-xs px-2 py-1 rounded-full ${r.color}`}>{r.label}</span>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><Users className="w-4 h-4 text-teal-600" /><h3 className="font-display font-bold">Staff members ({staff.length})</h3></div>
          <a href="/admin/users" className="text-xs text-teal-600 hover:underline">Manage all users →</a>
        </div>
        {staff.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">Only the seeded super-admin so far. Promote users from the Users page or ask Meera.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-slate-500 bg-slate-50"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Sign-in</th><th className="text-left p-3">Role</th><th className="text-left p-3">Change</th></tr></thead>
            <tbody>
              {staff.map(u => (
                <tr key={u.user_id} className="border-t border-slate-100">
                  <td className="p-3 font-medium">{u.name}</td>
                  <td className="p-3 text-slate-600">{u.email}</td>
                  <td className="p-3 text-slate-500">{u.method}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${(ROLES_INFO.find(r => r.key === u.role) || ROLES_INFO[4]).color}`}>{u.role}</span></td>
                  <td className="p-3">
                    <select value={u.role} onChange={e => setRole(u.user_id, e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-xs">
                      {ROLES_INFO.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
