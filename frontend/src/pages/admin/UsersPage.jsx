import { ADMIN_USERS } from '../../mock/mockData';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { gbp } from '../../lib/format';
import { Search, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';

export default function UsersPage() {
  const [q, setQ] = useState('');
  const list = ADMIN_USERS.filter(u => u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-display text-2xl font-extrabold">Users ({ADMIN_USERS.length})</h2>
        <Button className="bg-teal-600 hover:bg-teal-700">+ Add user</Button>
      </div>
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search users…" value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Joined</th><th className="text-left p-3">Tickets</th><th className="text-left p-3">Spent</th><th className="text-left p-3">Status</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {list.map(u => (
              <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3 font-medium text-slate-900">{u.name}</td>
                <td className="p-3 text-slate-600">{u.email}</td>
                <td className="p-3 text-slate-500">{u.joined}</td>
                <td className="p-3">{u.tickets.toLocaleString()}</td>
                <td className="p-3">{gbp(u.spent)}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${u.status === 'vip' ? 'bg-amber-100 text-amber-700' : u.status === 'suspended' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{u.status}</span>
                </td>
                <td className="p-3"><button className="text-slate-400 hover:text-slate-700"><MoreHorizontal className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
