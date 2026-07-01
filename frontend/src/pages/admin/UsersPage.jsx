import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { Input } from '../../components/ui/input';
import { Search, Users as UsersIcon } from 'lucide-react';
import { gbp } from '../../lib/format';

export default function UsersPage() {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  useEffect(() => { adminAPI.users().then(setUsers).catch(() => setUsers([])); }, []);
  const list = users.filter(u => u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-display text-2xl font-extrabold">Users ({users.length})</h2>
      </div>
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search users…" value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {list.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-3"><UsersIcon className="w-6 h-6 text-slate-400" /></div>
            <div className="text-slate-500 text-sm">No users match your search.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Method</th><th className="text-left p-3">Tickets</th><th className="text-left p-3">Spent</th><th className="text-left p-3">Role</th></tr>
            </thead>
            <tbody>
              {list.map(u => (
                <tr key={u.user_id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-900">{u.name}</td>
                  <td className="p-3 text-slate-600">{u.email}</td>
                  <td className="p-3 text-slate-500">{u.method}</td>
                  <td className="p-3">{u.tickets}</td>
                  <td className="p-3">{gbp(u.spent)}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${u.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{u.role}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
