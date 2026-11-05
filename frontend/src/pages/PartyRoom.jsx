import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Copy, Crown, Share2, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { roomAPI, useRoom } from '../lib/partyRoom';
import { PARTY_ONLINE } from '../components/games/party';
import { useRoomChat, sfx } from '../components/games/party/kit';
import { gameCover } from '../lib/gameCovers';

const SEAT_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#eab308'];
const CONFIG = { difficulty: 5, stage_level: 11, practice_mode: true, public_preview: true };

function Lobby({ room, code, onStart, starting }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/play/${code}`;
  const g = PARTY_ONLINE[room.game_id];
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  const share = () => (navigator.share ? navigator.share({ title: `Play ${g.label} with me`, text: `Join my ${g.label} game on Prize League!`, url: link }).catch(() => {}) : copy());
  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]" data-testid="room-lobby">
      <div className="relative aspect-[16/9]"><img src={gameCover(room.game_id)} alt="" className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-slate-950 to-transparent" />
        <div className="absolute bottom-3 left-4"><div className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">Play with friends</div><h1 className="font-display text-3xl font-black text-white" data-testid="room-game-title">{g.label}</h1></div></div>
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-white/60"><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />Players {room.players.length}/{room.max_players}</span><span>Room <b className="text-white" data-testid="room-code">{code}</b></span></div>
          <div className="space-y-1.5">{Array.from({ length: room.max_players }, (_, i) => { const p = room.players[i]; return (
            <div key={i} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${p ? 'bg-white/10' : 'border border-dashed border-white/15'}`} data-testid={`room-player-${i}`}>
              <span className="h-4 w-4 rounded-full" style={{ background: p ? SEAT_COLORS[i] : 'transparent', border: p ? 'none' : '2px dashed rgba(255,255,255,0.25)' }} />
              <span className="flex-1 text-sm font-bold text-white">{p ? `${p.name}${p.seat === room.seat ? ' (you)' : ''}` : 'Waiting for a friend…'}</span>
              {p && i === 0 && <Crown className="h-4 w-4 text-amber-300" />}
            </div>); })}</div>
        </div>
        <div className="rounded-2xl bg-black/30 p-3">
          <div className="mb-2 text-xs font-bold text-white/70">Send this invite link to your friends (they sign in to join):</div>
          <div className="flex gap-2"><input readOnly value={link} className="h-10 min-w-0 flex-1 rounded-xl bg-white/10 px-3 text-xs text-white" data-testid="room-invite-link" />
            <button type="button" onClick={copy} className="inline-flex h-10 items-center gap-1 rounded-xl bg-white/15 px-3 text-xs font-black text-white" data-testid="room-copy">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy'}</button></div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={share} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-500 text-xs font-black text-white" data-testid="room-share"><Share2 className="h-4 w-4" />Share</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`Join my ${g.label} game on Prize League! ${link}`)}`} target="_blank" rel="noreferrer" className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-emerald-500 text-xs font-black text-white" data-testid="room-whatsapp">WhatsApp</a>
          </div>
        </div>
        {room.host ? <button type="button" disabled={room.players.length < 2 || starting} onClick={onStart} className="h-12 w-full rounded-2xl bg-amber-400 font-black text-slate-900 shadow-lg disabled:opacity-50" data-testid="room-start">{room.players.length < 2 ? 'Waiting for at least 1 friend…' : `Start game (${room.players.length} players)`}</button>
          : <div className="rounded-2xl bg-white/5 py-3 text-center text-sm font-bold text-white/70" data-testid="room-waiting">Waiting for the host to start…</div>}
      </div>
    </div>
  );
}

export default function PartyRoom() {
  const { code: raw } = useParams();
  const code = (raw || '').toUpperCase();
  const { user, loading } = useAuth() || {};
  const [joinErr, setJoinErr] = useState('');
  const [joined, setJoined] = useState(false);
  const [starting, setStarting] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { if (user) roomAPI.join(code).then(() => setJoined(true)).catch((e) => setJoinErr(e?.response?.data?.detail || 'Could not join this room')); }, [user, code]);
  const { room, error, push, send, reload } = useRoom(joined ? code : null);
  const chat = useRoomChat(room, send);
  const online = useMemo(() => (room && room.state ? { seat: room.seat, names: room.players.map((p) => p.name), state: room.state, push, chat } : null), [room, push, chat]);
  useEffect(() => { if (room?.status === 'lobby') setResult(null); }, [room?.status]);

  if (loading) return <div className="min-h-screen bg-slate-950" />;
  if (!user) return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="max-w-sm rounded-3xl border border-white/10 bg-white/5 p-6 text-center" data-testid="room-signin">
        <h1 className="font-display text-2xl font-black text-white">Your friend invited you to play!</h1>
        <p className="mt-2 text-sm text-white/70">Sign in or create a free account to join the game.</p>
        <Link to={`/login?next=/play/${code}`} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-amber-400 font-black text-slate-900" data-testid="room-signin-btn">Sign in to join</Link>
      </div>
    </div>
  );
  const err = joinErr || (!room && error);
  if (err) return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 px-4 text-center text-white" data-testid="room-error"><p className="font-bold">{err}</p><Link to="/games" className="text-sm text-amber-300 underline">Back to games</Link></div>;
  if (!room) return <div className="min-h-screen bg-slate-950 py-20 text-center text-white/60">Joining the room…</div>;
  const g = PARTY_ONLINE[room.game_id];
  const start = async () => { setStarting(true); try { await roomAPI.start(code, g.init(room.players.length)); sfx('start'); reload(); } finally { setStarting(false); } };
  const finished = room.status === 'finished' || result;
  const won = result ? result.solved : room.winner === room.seat;
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-4xl px-3 py-5 sm:px-6">
        <Link to={`/games/${room.game_id}`} className="text-sm text-white/60 hover:text-white" data-testid="room-back">← {g.label}</Link>
        <div className="mt-4">
          {room.status === 'lobby' && <Lobby room={room} code={code} onStart={start} starting={starting} />}
          {room.status !== 'lobby' && online && <div className="relative">{g.render(CONFIG, setResult, online)}
            {finished && <div className="absolute inset-0 z-40 flex items-center justify-center rounded-[28px] bg-black/60 backdrop-blur-sm" data-testid="room-result">
              <div className="mx-4 rounded-3xl bg-slate-900/95 p-6 text-center">
                <div className="font-display text-3xl font-black text-white">{room.winner === -1 ? 'It\'s a draw!' : won ? 'You win! 🏆' : `${room.players.find((p) => p.seat === room.winner)?.name || 'A friend'} wins!`}</div>
                {room.host ? <button type="button" onClick={async () => { await roomAPI.rematch(code); reload(); }} className="mt-4 h-11 rounded-2xl bg-amber-400 px-6 font-black text-slate-900" data-testid="room-rematch">Play again</button>
                  : <p className="mt-3 text-sm text-white/60">Waiting for the host to start a rematch…</p>}
              </div>
            </div>}
          </div>}
        </div>
      </div>
    </div>
  );
}
