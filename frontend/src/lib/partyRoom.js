import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export const ONLINE_GAMES = ['pty_ludo_royale', 'pty_colour_cards', 'pty_four_in_row', 'pty_snakes_ladders', 'pty_dots_boxes', 'pty_checkers', 'pty_memory_duel', 'pty_reversi', 'pty_gomoku', 'pty_tictactoe', 'pty_mancala', 'pty_isolation', 'pty_breakthrough', 'pty_domineering', 'pty_clobber', 'pty_nim', 'pty_hex', 'pty_treblecross', 'pty_morris', 'pty_fox_hounds', 'pty_sim', 'pty_chomp', 'pty_kayles', 'pty_notakto'];
export const roomAPI = {
  create: (gameId) => api.post('/party/rooms', { game_id: gameId }).then((r) => r.data),
  join: (code) => api.post(`/party/rooms/${code}/join`).then((r) => r.data),
  start: (code, state) => api.post(`/party/rooms/${code}/start`, { state }).then((r) => r.data),
  rematch: (code) => api.post(`/party/rooms/${code}/rematch`).then((r) => r.data),
  chat: (code, body) => api.post(`/party/rooms/${code}/chat`, body).then((r) => r.data),
};

// Polls the room every second. push() sends the next game state (queued so versions never clash).
export function useRoom(code) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const ver = useRef(0);
  const queue = useRef(Promise.resolve());
  const busy = useRef(0);
  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/party/rooms/${code}`);
      setError('');
      setRoom((prev) => {
        if (busy.current || (prev && data.version < ver.current)) return prev ? { ...prev, chat: data.chat, players: data.players } : data;
        ver.current = data.version;
        return data;
      });
    } catch (e) { setError(e?.response?.data?.detail || 'Could not load the room'); }
  }, [code]);
  useEffect(() => { load(); const id = setInterval(load, 1000); return () => clearInterval(id); }, [load]);
  const push = useCallback((state, winner = null) => {
    busy.current += 1;
    const v = ver.current; ver.current = v + 1;
    setRoom((r) => ({ ...r, state, version: v + 1, ...(winner != null ? { status: 'finished', winner } : {}) }));
    queue.current = queue.current.then(() => api.post(`/party/rooms/${code}/state`, { version: v, state, winner }))
      .catch(() => { ver.current = 0; })
      .finally(() => { busy.current -= 1; if (!busy.current) load(); });
  }, [code, load]);
  const send = useCallback(async (body) => { try { await roomAPI.chat(code, body); load(); } catch { /* ignore */ } }, [code, load]);
  return { room, error, push, send, reload: load };
}
