import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { Input } from '../../components/ui/input';
import { Search, Users as UsersIcon, ShieldAlert, ShieldCheck } from 'lucide-react';
import { gbp } from '../../lib/format';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

const ROLES = ['user', 'operator', 'support', 'admin', 'super_admin'];
const ROLE_COLORS = { user: 'bg-slate-100 text-slate-700', operator: 'bg-blue-100 text-blue-700', support: 'bg-indigo-100 text-indigo-700', admin: 'bg-amber-100 text-amber-700', super_admin: 'bg-rose-100 text-rose-700' };

export default function UsersPage() {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const { toast } = useToast();

  const load = () => adminAPI.users().then(setUsers).catch(() => setUsers([]));
  useEffect(() => { load(); }, []);

  const setRole = async (id, role) => { try { await adminAPI.updateUser(id, { role }); toast({ title: 'Role updated' }); load(); setEditing(null); } catch (e) { toast({ title: 'Failed', description: e?.response?.data?.detail }); } };
  const toggleSuspend = async (u) => { try { if (u.suspended) await adminAPI.unsuspendUser(u.user_id); else await adminAPI.suspendUser(u.user_id); toast({ title: u.suspended ? 'Unsuspended' : 'Suspended' }); load(); } catch (e) { toast({ title: 'Failed', description: e?.response?.data?.detail }); } };

  const list = users.filter(u => u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-extrabold">Users ({users.length})</h2>
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search by name or email…" value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {list.length === 0 ? (
          <div className="py-16 text-center"><div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-3"><UsersIcon className="w-6 h-6 text-slate-400" /></div><div className="text-slate-500 text-sm">No users found.</div></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Sign-in</th><th className="text-left p-3">KYC</th><th className="text-left p-3">Tickets</th><th className="text-left p-3">Spent</th><th className="text-left p-3">Role</th><th className="text-left p-3">Status</th><th className="text-left p-3"></th></tr>
            </thead>
            <tbody>
              {list.map(u => (
                <tr key={u.user_id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-900">{u.name}</td>
                  <td className="p-3 text-slate-600">{u.email}</td>
                  <td className="p-3 text-slate-500">{u.method}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${u.kyc_status === 'approved' ? 'bg-emerald-100 text-emerald-700' : u.kyc_status === 'pending' ? 'bg-amber-100 text-amber-700' : u.kyc_status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{u.kyc_status || 'none'}</span></td>
                  <td className="p-3">{u.tickets}</td>
                  <td className="p-3">{gbp(u.spent)}</td>
                  <td className="p-3">
                    {editing === u.user_id ? (
                      <select autoFocus defaultValue={u.role} onBlur={() => setEditing(null)} onChange={e => setRole(u.user_id, e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-xs">
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : (
                      <button onClick={() => setEditing(u.user_id)} className={`text-xs px-2 py-1 rounded-full ${ROLE_COLORS[u.role] || ROLE_COLORS.user}`}>{u.role} ✎</button>
                    )}
                  </td>
                  <td className="p-3">{u.suspended ? <span className="text-xs text-rose-600 inline-flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Suspended</span> : <span className="text-xs text-emerald-600 inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Active</span>}</td>
                  <td className="p-3"><Button size="sm" variant="ghost" onClick={() => toggleSuspend(u)} className={u.suspended ? 'text-emerald-600' : 'text-rose-600'}>{u.suspended ? 'Unsuspend' : 'Suspend'}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
