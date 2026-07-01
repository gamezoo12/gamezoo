import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Sparkles, Send, X, Loader2, Bot } from 'lucide-react';
import { api } from '../lib/api';

const STORAGE_KEY = 'gz_meera_history';

export default function MeeraChat({ theme = 'light', onActionsExecuted }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState(() => sessionStorage.getItem('gz_meera_sid') || null);
  const scrollRef = useRef(null);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  const send = async (msg) => {
    if (!msg.trim() || busy) return;
    setBusy(true);
    setMessages(m => [...m, { role: 'user', text: msg }]);
    setInput('');
    try {
      const r = await api.post('/admin/meera/chat', { message: msg, session_id: sessionId });
      if (r.data.session_id && !sessionId) { setSessionId(r.data.session_id); sessionStorage.setItem('gz_meera_sid', r.data.session_id); }
      setMessages(m => [...m, { role: 'meera', text: r.data.reply, actions: r.data.actions, results: r.data.results }]);
      if (onActionsExecuted && (r.data.results || []).some(x => x.ok)) onActionsExecuted();
    } catch (e) {
      setMessages(m => [...m, { role: 'meera', text: `Sorry, I hit an error: ${e?.response?.data?.detail || e.message}` }]);
    } finally { setBusy(false); }
  };

  const quickSuggestions = [
    'Add 5 draft contests worth £100 with 150 tickets running 7 days',
    'Launch all draft contests',
    'Show me all draft contests',
    'Change contest-1 prize to £250',
    'Delete all draft contests',
  ];

  const bubbleBase = theme === 'dark' ? 'bg-slate-800 text-slate-100 border-slate-700' : 'bg-white text-slate-800 border-slate-100';

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 group flex items-center gap-2 pl-3 pr-4 py-3 rounded-full bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 text-white shadow-xl shadow-purple-500/40 hover:shadow-purple-500/60 transition-shadow">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><Sparkles className="w-4 h-4" /></div>
        <span className="font-semibold">Ask Meera</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <aside onClick={e => e.stopPropagation()} className={`relative w-full max-w-lg h-full ${theme === 'dark' ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'} shadow-2xl flex flex-col`}>
            <header className="flex items-center justify-between p-4 border-b border-slate-200/60 bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center"><Sparkles className="w-5 h-5" /></div>
                <div>
                  <div className="font-display font-bold">Meera</div>
                  <div className="text-xs opacity-80">AI operations assistant</div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-indigo-500 text-white flex items-center justify-center mx-auto"><Bot className="w-7 h-7" /></div>
                  <h3 className="font-display font-bold mt-3">Hi, I’m Meera 👋</h3>
                  <p className="text-sm opacity-70 mt-1 max-w-xs mx-auto">Tell me what contests you want and I’ll add, edit, launch, pause or remove them for you — no limits.</p>
                  <div className="mt-4 space-y-2">
                    {quickSuggestions.map(s => (
                      <button key={s} onClick={() => send(s)} className={`block w-full text-left text-xs px-3 py-2 rounded-lg border ${theme === 'dark' ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-white'}`}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 border ${m.role === 'user' ? 'bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white border-transparent' : bubbleBase}`}>
                    <div className="whitespace-pre-wrap text-sm">{m.text}</div>
                    {m.results && m.results.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {m.results.map((r, j) => (
                          <div key={j} className={`text-xs px-2 py-1 rounded ${r.ok ? 'bg-emerald-500/15 text-emerald-700' : 'bg-rose-500/15 text-rose-700'}`}>
                            <span className="font-mono">{r.action}</span> {r.ok ? '✓' : `✗ ${r.error || ''}`}
                            {r.count !== undefined && ` — ${r.count} created`}
                            {r.launched !== undefined && ` — ${r.launched} launched`}
                            {r.deleted !== undefined && ` — ${r.deleted} deleted`}
                            {r.winner && ` — ${r.winner.user_name} won £${r.winner.prize_amount}`}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className={`rounded-2xl px-4 py-3 border ${bubbleBase} inline-flex items-center gap-2 text-sm`}>
                    <Loader2 className="w-4 h-4 animate-spin" /> Meera is thinking&hellip;
                  </div>
                </div>
              )}
            </div>

            <div className={`p-3 border-t ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
              <form onSubmit={e => { e.preventDefault(); send(input); }} className="flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask Meera anything about contests…"
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200'}`}
                />
                <Button type="submit" disabled={busy || !input.trim()} className="bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-700 hover:to-indigo-700">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
