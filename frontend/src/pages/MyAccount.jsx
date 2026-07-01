import { WINNERS } from '../mock/mockData';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Wallet, Ticket, Award, User } from 'lucide-react';

export default function MyAccount() {
  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-10">
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Wallet Balance', value: '£82.40', Icon: Wallet, color: 'from-teal-500 to-emerald-500' },
          { label: 'Active Tickets', value: '154', Icon: Ticket, color: 'from-orange-500 to-rose-500' },
          { label: 'Total Wins', value: '3', Icon: Award, color: 'from-amber-400 to-orange-500' },
          { label: 'Member since', value: 'Aug 2024', Icon: User, color: 'from-slate-700 to-slate-900' },
        ].map((s, i) => (
          <div key={i} className={`rounded-2xl p-5 text-white bg-gradient-to-br ${s.color} shadow-lg`}>
            <s.Icon className="w-6 h-6 opacity-80" />
            <div className="mt-3 text-2xl font-extrabold font-display">{s.value}</div>
            <div className="text-sm opacity-90">{s.label}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="tickets">
        <TabsList>
          <TabsTrigger value="tickets">My Tickets</TabsTrigger>
          <TabsTrigger value="wins">My Wins</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>
        <TabsContent value="tickets">
          <div className="bg-white rounded-2xl border border-slate-100 p-6"><p className="text-slate-500">You have 154 active tickets across 6 competitions.</p></div>
        </TabsContent>
        <TabsContent value="wins">
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            {WINNERS.slice(0, 3).map(w => (
              <div key={w.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <img src={w.image} alt={w.name} className="w-full h-40 object-cover" />
                <div className="p-4"><div className="text-orange-600 font-bold">{w.amount}</div><div className="font-semibold">{w.prize}</div></div>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="orders"><div className="bg-white rounded-2xl border border-slate-100 p-6 text-slate-500">No recent orders.</div></TabsContent>
        <TabsContent value="profile"><div className="bg-white rounded-2xl border border-slate-100 p-6 text-slate-500">Profile settings coming soon.</div></TabsContent>
      </Tabs>
    </div>
  );
}
