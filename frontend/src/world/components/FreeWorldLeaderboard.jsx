import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Trophy, X, Clock, RefreshCw, Radio, Crown, User, ChevronDown, Coins, ChevronRight,
} from 'lucide-react';
import { worldAPI } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import '../styles/pl-global-lb.css';

const LOGO_URL = '/logo.png?v=5';
const CHAMPIONSHIP_COUNT = 100;

/* Authoritative prize model (mirrors backend _champion_final_prize):
   base rank prize x championship multiplier, multiplier = 1 + (stage-1)*0.5 */
const BASE_PRIZES = { 1: 50, 2: 20, 3: 15, 4: 10, 5: 5 };
const WINNER_RANKS = [1, 2, 3, 4, 5];
const champMultiplier = (stage) => 1 + (Math.max(1, Number(stage) || 1) - 1) * 0.5;
const finalPrize = (rank, stage) => (BASE_PRIZES[rank] || 0) * champMultiplier(stage);

// Displayed total prize pool (matches the seeded season pool of £257,500).
const TOTAL_PRIZE_POOL = Array.from({ length: CHAMPIONSHIP_COUNT }, (_, i) => 50 * (i + 2))
  .reduce((t, p) => t + p, 0);

const gbp0 = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(Number(v) || 0);
const gbp2 = (v) => {
  const n = Number(v) || 0;
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
};
const fmtMult = (m) => `${Number.isInteger(m) ? m : m.toFixed(1)}x`;

function nameOf(r) { return r?.user_name || r?.username || r?.display_name || 'Player'; }
function initials(name) {
  const p = String(name || 'P').trim().split(/\s+/).slice(0, 2);
  return (p.map((x) => x[0]).join('') || 'P').toUpperCase();
}
function fmtTime(ms) {
  const v = Math.max(0, Number(ms) || 0);
  if (!v) return '—';
  const totalMs = Math.floor(v);
  const s = Math.floor(totalMs / 1000);
  const millis = totalMs % 1000;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
function champOf(r) {
  const stage = r?.championship ?? r?.champion_badge?.stage ?? r?.champion_stage ?? null;
  return stage ? `C${stage}` : '—';
}
function winningsOf(r) {
  const w = r?.winning_amount ?? r?.current_win ?? r?.prize_amount ?? null;
  return w == null || Number(w) <= 0 ? null : gbp2(w);
}
// Backend stores contest timestamps as naive UTC (no tz suffix). Parse them
// as UTC so the countdown matches the real championship close time in every
// browser timezone (e.g. London BST).
function parseUtcMs(s) {
  if (!s) return null;
  const str = String(s);
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(str);
  const t = new Date(hasTz ? str : `${str}Z`).getTime();
  return Number.isNaN(t) ? null : t;
}

export default function FreeWorldLeaderboard({ open, onClose }) {
  const auth = useAuth();
  const myId = auth?.user?.user_id || auth?.user?.id || null;
  const myName = auth?.user?.name || auth?.user?.user_name || null;

  const [champN, setChampN] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [endsIn, setEndsIn] = useState('');
  const [showMult, setShowMult] = useState(false);
  const [exStage, setExStage] = useState(2);
  const endHandledRef = useRef(false);

  const load = useCallback(async (which) => {
    setLoading(true); setError('');
    try {
      const n = which === 'all' ? undefined : Number(which);
      const res = await worldAPI.championLeaderboard(n);
      setData(res || { contest: null, leaderboard: [] });
    } catch (e) {
      setError('Leaderboard is temporarily unavailable.');
      setData(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) load(champN); }, [open, champN, load]);

  // Live rankings: while the leaderboard is open and the tab is visible, pull
  // fresh standings every 15s so positions update automatically without a
  // manual refresh. Pauses when the panel is closed or the tab is hidden.
  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load(champN);
    }, 15000);
    return () => clearInterval(id);
  }, [open, champN, load]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { if (showMult) setShowMult(false); else onClose?.(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, showMult]);

  const contest = data?.contest || {};
  const endAt = parseUtcMs(contest?.end_at);

  useEffect(() => {
    if (!open || !endAt) { setEndsIn(''); endHandledRef.current = false; return undefined; }
    let poll;
    const tick = () => {
      const diff = endAt - Date.now();
      if (diff <= 0) {
        setEndsIn('00:00:00');
        // Championship has closed exactly at end_at — pull the settled
        // leaderboard so the winners are announced automatically.
        if (!endHandledRef.current) {
          endHandledRef.current = true;
          load(champN);
          let tries = 0;
          poll = setInterval(() => {
            tries += 1;
            load(champN);
            if (tries >= 8 && poll) clearInterval(poll);
          }, 20000);
        }
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setEndsIn(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { clearInterval(id); if (poll) clearInterval(poll); };
  }, [open, endAt, champN, load]);

  const rows = useMemo(() => (Array.isArray(data?.leaderboard) ? data.leaderboard : []), [data]);
  const isMine = useCallback(
    (r) => (myId && String(r.user_id) === String(myId)) || (!myId && myName && nameOf(r) === myName),
    [myId, myName],
  );

  const myRow = useMemo(() => rows.find(isMine) || null, [rows, isMine]);
  const status = String(contest?.status || '').toLowerCase();
  const isLive = status === 'active';
  const settled = Boolean(contest?.settled) || status === 'settled' || status === 'closed_settled';
  const titleLbl = champN === 'all' ? 'GLOBAL RANKINGS' : `CHAMPION ${champN} RANKINGS`;

  if (!open) return null;

  const rankBadge = (rank) => {
    if (rank === 1) return <span className="pl-global-lb-rk gold"><Crown size={12} /></span>;
    if (rank === 2) return <span className="pl-global-lb-rk silver">2</span>;
    if (rank === 3) return <span className="pl-global-lb-rk bronze">3</span>;
    return null;
  };

  const RankingsBody = () => {
    if (loading) return <div className="pl-global-lb-state" data-testid="lb-loading"><span className="pl-global-lb-spin" /><p>Loading rankings…</p></div>;
    if (error) return (
      <div className="pl-global-lb-state" data-testid="lb-error">
        <h4>Couldn’t load the leaderboard</h4><p>{error}</p>
        <button className="pl-global-lb-refresh" onClick={() => load(champN)} data-testid="lb-retry"><RefreshCw size={15} /> Try again</button>
      </div>
    );
    if (rows.length === 0) return (
      <div className="pl-global-lb-state" data-testid="lb-empty">
        <div className="pl-global-lb-emptytr"><Trophy size={28} strokeWidth={1.6} /></div>
        <h4>No rankings yet</h4>
        <p>Be the first to set a score in {champN === 'all' ? 'Free World' : `Championship ${champN}`}.</p>
      </div>
    );
    return (
      <div className="pl-global-lb-tablewrap" data-testid="lb-list">
        <div className="pl-global-lb-thead">
          <span>#</span><span>PLAYER</span><span>CHAMP</span><span>TIME</span><span className="ta-r">WINNINGS</span>
        </div>
        {rows.map((r) => {
          const win = winningsOf(r);
          const top = r.rank <= 3;
          return (
            <div
              key={r.user_id || r.rank}
              className={`pl-global-lb-tr ${top ? `top top-${r.rank}` : ''} ${isMine(r) ? 'is-me' : ''}`}
              data-testid={isMine(r) ? 'lb-row-me' : 'lb-row'}
            >
              <span className="pl-global-lb-rankcell"><b>{r.rank}</b>{rankBadge(r.rank)}</span>
              <span className="pl-global-lb-player">
                <span className={`pl-global-lb-av r${r.rank <= 3 ? r.rank : ''}`}>{initials(nameOf(r))}</span>
                <span className="pl-global-lb-pn">{nameOf(r)}{isMine(r) && <em>YOU</em>}</span>
              </span>
              <span className="pl-global-lb-champ"><Trophy size={12} /> {champOf(r)}</span>
              <span className="pl-global-lb-time"><Clock size={12} /> {fmtTime(r.duration_ms)}</span>
              <span className="pl-global-lb-win ta-r">{win || '—'}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section className="pl-global-lb-shell" role="dialog" aria-modal="true" aria-label="Global leaderboard" data-testid="global-leaderboard">
      {/* SLIM PRIZE LEAGUE BRAND BAR */}
      <header className="pl-global-lb-topbar" data-testid="lb-topbar">
        <div className="pl-global-lb-brand">
          <img src={LOGO_URL} alt="Prize League" className="pl-global-lb-logo" />
          <span className="pl-global-lb-wordmark"><b>PRIZE</b> LEAGUE</span>
        </div>
        <button className="pl-global-lb-back" onClick={() => onClose?.()} data-testid="lb-close" aria-label="Close leaderboard">
          <X size={18} /> <span>Back</span>
        </button>
      </header>

      <div className="pl-global-lb-inner">
        {/* PRIZE POOL + TIMER (side by side) */}
        <div className="pl-global-lb-stats">
          <div className="pl-global-lb-card pl-global-lb-pool">
            <span className="pl-global-lb-poolicon"><Coins size={26} /></span>
            <div>
              <div className="pl-global-lb-poolamt" data-testid="lb-prize-pool">{gbp0(TOTAL_PRIZE_POOL)}</div>
              <div className="pl-global-lb-poollbl">Total Prize Pool</div>
            </div>
          </div>
          <div className="pl-global-lb-card pl-global-lb-ends">
            <span className="pl-global-lb-endsicon"><Clock size={26} /></span>
            <div>
              <div className="pl-global-lb-endsval" data-testid="lb-ends-in">{settled ? 'CLOSED' : (endsIn || '—')}</div>
              <div className="pl-global-lb-endslbl">{settled ? 'Winners Announced' : 'Ends In'}</div>
            </div>
          </div>
        </div>

        {/* PRIZE CALCULATION */}
        <div className="pl-global-lb-card pl-global-lb-prizecalc">
          <div className="pl-global-lb-pc-left">
            <div className="pl-global-lb-sectlbl">PRIZE CALCULATION</div>
            <div className="pl-global-lb-prizes">
              <span className="pl-global-lb-prz"><i className="m1"><Crown size={11} /></i><span className="ord">1st</span> <b>£50</b></span>
              <span className="pl-global-lb-dot" />
              <span className="pl-global-lb-prz"><i className="m2">2</i><span className="ord">2nd</span> <b>£20</b></span>
              <span className="pl-global-lb-dot" />
              <span className="pl-global-lb-prz"><i className="m3">3</i><span className="ord">3rd</span> <b>£15</b></span>
              <span className="pl-global-lb-dot" />
              <span className="pl-global-lb-prz"><i className="m4">4</i><span className="ord">4th</span> <b>£10</b></span>
              <span className="pl-global-lb-dot" />
              <span className="pl-global-lb-prz"><i className="m5">5</i><span className="ord">5th</span> <b>£5</b></span>
            </div>
            <p className="pl-global-lb-pc-note">Base prizes × championship multiplier = final prize</p>
          </div>
          <button className="pl-global-lb-more" onClick={() => setShowMult(true)} data-testid="lb-more-multipliers">
            More <ChevronRight size={15} />
          </button>
        </div>

        {/* VIEW CHAMPIONSHIP */}
        <div className="pl-global-lb-card pl-global-lb-viewcard">
          <div className="pl-global-lb-sectlbl">VIEW CHAMPIONSHIP</div>
          <div className="pl-global-lb-viewrow">
            <div className="pl-global-lb-select">
              <Trophy size={15} />
              <select value={champN} onChange={(e) => setChampN(e.target.value)} data-testid="lb-champ-select" aria-label="View championship">
                <option value="all">All Championships (Global)</option>
                {Array.from({ length: CHAMPIONSHIP_COUNT }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>Champion {n}</option>
                ))}
              </select>
              <ChevronDown size={15} className="pl-global-lb-selchev" />
            </div>
            {isLive && <span className="pl-global-lb-livepill green" data-testid="lb-live"><Radio size={12} /> LIVE</span>}
            <button className="pl-global-lb-refresh" onClick={() => load(champN)} data-testid="lb-refresh"><RefreshCw size={14} /> Refresh</button>
          </div>
        </div>

        {/* YOUR POSITION */}
        {myRow ? (
          <div className="pl-global-lb-card pl-global-lb-you" data-testid="lb-your-rank">
            <div className="pl-global-lb-sectlbl purple">YOUR POSITION</div>
            <div className="pl-global-lb-yourow">
              <span className="pl-global-lb-yourank">#{myRow.rank}</span>
              <span className="pl-global-lb-av you">{initials(nameOf(myRow))}</span>
              <span className="pl-global-lb-yn">{nameOf(myRow)}</span>
              <span className="pl-global-lb-champ"><Trophy size={12} /> {champOf(myRow)}</span>
              <span className="pl-global-lb-time"><Clock size={12} /> {fmtTime(myRow.duration_ms)}</span>
              <span className="pl-global-lb-win">{winningsOf(myRow) || '—'}</span>
            </div>
          </div>
        ) : (
          <div className="pl-global-lb-card pl-global-lb-you empty" data-testid="lb-your-rank-empty">
            <div className="pl-global-lb-sectlbl purple">YOUR POSITION</div>
            <p className="pl-global-lb-youempty"><User size={15} /> Set a score in Free World to claim your spot on the board.</p>
          </div>
        )}

        {/* RANKINGS */}
        <div className="pl-global-lb-card pl-global-lb-rankings">
          <div className="pl-global-lb-rankhead">
            <h2>{titleLbl}</h2>
            {isLive && <span className="pl-global-lb-updates" data-testid="lb-updates"><i /> UPDATES LIVE</span>}
            {settled && <span className="pl-global-lb-updates final" data-testid="lb-final"><Crown size={12} /> FINAL RESULTS</span>}
          </div>
          {settled && (
            <div className="pl-global-lb-settled" data-testid="lb-settled">
              <Crown size={14} /> Championship closed — winners announced below
            </div>
          )}
          <RankingsBody />
        </div>
      </div>

      {/* MULTIPLIERS MODAL */}
      {showMult && (
        <div className="pl-global-lb-modal" role="dialog" aria-modal="true" aria-label="Championship prize multipliers" data-testid="lb-mult-modal">
          <div className="pl-global-lb-modal-bg" onClick={() => setShowMult(false)} />
          <div className="pl-global-lb-modal-card">
            <div className="pl-global-lb-modal-head">
              <div>
                <span className="pl-global-lb-sectlbl">CHAMPIONSHIP PRIZES</span>
                <h3>100 Championship Prize Multipliers</h3>
              </div>
              <button className="pl-global-lb-x" onClick={() => setShowMult(false)} data-testid="lb-mult-close" aria-label="Close"><X size={18} /></button>
            </div>

            <p className="pl-global-lb-modal-desc">
              Championship prizes are calculated by multiplying the base finishing-position prize by the Championship multiplier.
            </p>
            <div className="pl-global-lb-formula">
              <span>BASE PRIZE</span><b>×</b><span>CHAMPIONSHIP MULTIPLIER</span><b>=</b><span className="fin">FINAL PRIZE</span>
            </div>

            {/* WORKED EXAMPLE */}
            <div className="pl-global-lb-example">
              <div className="pl-global-lb-example-head">
                <span>Prize example</span>
                <div className="pl-global-lb-select sm">
                  <Trophy size={13} />
                  <select value={exStage} onChange={(e) => setExStage(Number(e.target.value))} data-testid="lb-mult-example-select" aria-label="Example championship">
                    {Array.from({ length: CHAMPIONSHIP_COUNT }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>Champion {n} — {fmtMult(champMultiplier(n))}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="pl-global-lb-selchev" />
                </div>
              </div>
              <div className="pl-global-lb-example-rows">
                {WINNER_RANKS.map((rk) => (
                  <div key={rk} className="pl-global-lb-example-row">
                    <span className="rk">{rk === 1 ? '1st' : rk === 2 ? '2nd' : rk === 3 ? '3rd' : `${rk}th`}</span>
                    <span className="calc">{gbp0(BASE_PRIZES[rk])} × {fmtMult(champMultiplier(exStage))}</span>
                    <b className="res">{gbp2(finalPrize(rk, exStage))}</b>
                  </div>
                ))}
              </div>
            </div>

            {/* FULL 1..100 GRID */}
            <div className="pl-global-lb-multgrid" data-testid="lb-mult-grid">
              {Array.from({ length: CHAMPIONSHIP_COUNT }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  className={`pl-global-lb-multtile ${n === exStage ? 'active' : ''}`}
                  onClick={() => setExStage(n)}
                  data-testid={`lb-mult-tile-${n}`}
                >
                  <span className="c">Champion {n}</span>
                  <b className="x">{fmtMult(champMultiplier(n))}</b>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
