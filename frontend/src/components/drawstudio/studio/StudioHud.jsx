import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Hud, OrthographicCamera, Text } from '@react-three/drei';
import * as THREE from 'three';
import { FONTS, makeCard, makePanel, pad, tierOf } from './textures';
import { REWARD_LABEL, STAGE_CAPTION, drawPhase, elapsed, gbp } from './timeline';

function LiveText({ S, get, fps = 14, ...props }) {
  const ref = useRef();
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (!ref.current || clock.elapsedTime - last.current < 1 / fps) return;
    last.current = clock.elapsedTime;
    const v = get(S.current);
    if (v === null) { ref.current.visible = false; return; }
    ref.current.visible = true;
    if (ref.current.text !== v) { ref.current.text = v; ref.current.sync(); }
  });
  return <Text ref={ref} {...props}>{' '}</Text>;
}

function cycleNumber(s) {
  if (s.stage === 'drawn') return `#${pad(s.winners[s.winners.length - 1].ticket_number)}`;
  if (s.stage !== 'drawing') return null;
  const ph = drawPhase(s);
  if (!ph.waiting && ph.local >= 0.72) return `#${pad(s.winners[ph.w].ticket_number)}`;
  const t = performance.now();
  const interval = 45 + 560 * (ph.waiting ? 0 : ph.local / 0.72) ** 2.4;
  if (!s.nextSwitch || t >= s.nextSwitch) {
    const pool = s.allNumbers || [0];
    s.cycleNum = pool[Math.floor(Math.random() * pool.length)];
    s.nextSwitch = t + interval;
  }
  return `#${pad(s.cycleNum)}`;
}

function Panel({ w, h, y = 0, x = 0, tex, opacity = 1 }) {
  return <mesh position={[x, y, -1]}><planeGeometry args={[w, h]} /><meshBasicMaterial map={tex} transparent opacity={opacity} toneMapped={false} /></mesh>;
}

function Confetti({ S, w, h }) {
  const ref = useRef();
  const N = 360;
  const parts = useMemo(() => Array.from({ length: N }, () => ({ x: 0, y: -9999, vx: 0, vy: 0, r: 0, vr: 0 })), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const fired = useRef(0);
  useEffect(() => {
    const c = new THREE.Color();
    const cols = ['#FFD54A', '#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#ffffff', '#ff9a4a'];
    for (let i = 0; i < N; i += 1) ref.current.setColorAt(i, c.set(cols[i % cols.length]));
    ref.current.instanceColor.needsUpdate = true;
  }, []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05) * 60;
    const s = S.current;
    if (s.confettiAt && s.confettiAt !== fired.current) {
      fired.current = s.confettiAt;
      parts.forEach((p, i) => {
        const side = i % 2 ? 1 : -1;
        Object.assign(p, { x: side * w * 0.45, y: -h * 0.3, vx: -side * (4 + Math.random() * 14) * (w / 1600), vy: (12 + Math.random() * 16) * (h / 900),
          r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3 });
      });
    }
    parts.forEach((p, i) => {
      if (p.y > -h) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 0.35 * dt * (h / 900); p.vx *= 0.995; p.r += p.vr * dt; }
      dummy.position.set(p.x, p.y, 5);
      dummy.rotation.set(p.r, p.r * 0.7, p.r * 1.3);
      dummy.scale.set(12 * (w / 1600) + 4, 7 * (w / 1600) + 3, 1);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[null, null, N]} frustumCulled={false}><planeGeometry args={[1, 1]} /><meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} /></instancedMesh>;
}

function Intro({ view, u }) {
  const tex = useMemo(() => makePanel(), []);
  const r = view.rounds[view.round];
  const first = view.round === 0;
  return (
    <group position={[0, -20 * u, 0]}>
      <Panel w={820 * u} h={410 * u} tex={tex} />
      <Text font={FONTS.semi} fontSize={22 * u} position={[0, 150 * u, 0]} color="#c9b8ff" letterSpacing={0.2} maxWidth={760 * u} textAlign="center">{(view.title || '').toUpperCase()}</Text>
      <Text font={FONTS.num} fontSize={120 * u} position={[0, 55 * u, 0]} color="#ffd54a" outlineWidth={2 * u} outlineColor="#7a4a00">{first ? gbp(view.totalPrize) : r.name.toUpperCase()}</Text>
      <Text font={FONTS.bold} fontSize={26 * u} position={[0, -30 * u, 0]} color="#ffffff" letterSpacing={0.12}>{first ? 'GRAND PRIZE DRAW' : `ROUND ${view.round + 1} · ${gbp(r.prize_amount)} × ${r.num_winners}`}</Text>
      {first && view.rounds.slice(0, 4).map((x, i, arr) => (
        <group key={i} position={[(i - (arr.length - 1) / 2) * 180 * u, -100 * u, 0]}>
          <mesh position={[0, 0, -0.5]}><planeGeometry args={[164 * u, 70 * u]} /><meshBasicMaterial color={tierOf(i).b} transparent opacity={0.9} /></mesh>
          <Text font={FONTS.num} fontSize={30 * u} position={[0, 10 * u, 0]} color="#1b0d3d">{gbp(x.prize_amount)}</Text>
          <Text font={FONTS.bold} fontSize={13 * u} position={[0, -18 * u, 0]} color="#1b0d3d">{`${x.num_winners} WINNER${x.num_winners > 1 ? 'S' : ''}`}</Text>
        </group>
      ))}
      <Text font={FONTS.bold} fontSize={18 * u} position={[0, -170 * u, 0]} color="#ffd54a" letterSpacing={0.15}>{`${view.rounds.length} DRAW ROUND${view.rounds.length > 1 ? 'S' : ''}  •  ${view.totalWinners} WINNER${view.totalWinners > 1 ? 'S' : ''}  •  ${view.eligible.toLocaleString('en-GB')} TICKETS`}</Text>
    </group>
  );
}

function WinnerCards({ view, u, w }) {
  const winners = view.outcomes[view.round] || [];
  const r = view.rounds[view.round];
  const card = useMemo(() => makeCard(view.round), [view.round]);
  const cw = 380 * u;
  const scale = Math.min(1, (w * 0.92) / (winners.length * (cw + 30 * u)));
  const group = useRef();
  useFrame(() => group.current?.children.forEach((c) => { c.scale.setScalar(c.scale.x + (scale - c.scale.x) * 0.08); }));
  return (
    <>
      <mesh position={[0, 0, -2]}><planeGeometry args={[w * 2, w * 2]} /><meshBasicMaterial color="#03010c" transparent opacity={0.6} /></mesh>
      <Text font={FONTS.title} fontSize={100 * u} position={[0, 285 * u, 0]} color="#ffd54a" outlineWidth={3 * u} outlineColor="#6b3d00">{winners.length > 1 ? 'WINNERS!' : 'WINNER!'}</Text>
      <Text font={FONTS.bold} fontSize={26 * u} position={[0, 215 * u, 0]} color="#ffffff" letterSpacing={0.15}>{`ROUND ${view.round + 1} · ${r.name.toUpperCase()}`}</Text>
      <group ref={group} position={[0, -70 * u, 0]}>
        {winners.map((x, i) => (
          <group key={x.ticket_number} position={[(i - (winners.length - 1) / 2) * (cw + 30 * u) * scale, 0, 0]} scale={0.01}>
            <Panel w={cw} h={475 * u} tex={card} />
            <Text font={FONTS.num} fontSize={92 * u} position={[0, 135 * u, 0]} color="#ffffff" outlineWidth={2 * u} outlineColor="#000">{`#${pad(x.ticket_number)}`}</Text>
            <Text font={FONTS.bold} fontSize={36 * u} position={[0, 30 * u, 0]} color="#ffffff" maxWidth={cw * 0.9} textAlign="center">{x.display_name}</Text>
            <Text font={FONTS.num} fontSize={64 * u} position={[0, -140 * u, 0]} color="#1b0d3d">{gbp(r.prize_amount)}</Text>
            <Text font={FONTS.bold} fontSize={17 * u} position={[0, -190 * u, 0]} color="#1b0d3d" letterSpacing={0.1}>{(REWARD_LABEL[r.reward_type] || REWARD_LABEL.winnings).toUpperCase()}</Text>
          </group>
        ))}
      </group>
    </>
  );
}

function Finale({ view, u, w }) {
  const tex = useMemo(() => makePanel(), []);
  const rows = view.rounds.flatMap((r, i) => (view.outcomes[i] || []).map((x) => ({ r, i, x }))).slice(0, 12);
  const cols = [-360, -120, 60, 300].map((c) => c * u);
  return (
    <>
      <mesh position={[0, 0, -2]}><planeGeometry args={[w * 2, w * 2]} /><meshBasicMaterial color="#03010c" transparent opacity={0.65} /></mesh>
      <Panel w={900 * u} h={(190 + rows.length * 42) * u} y={-10 * u} tex={tex} />
      <Text font={FONTS.title} fontSize={56 * u} position={[0, (70 + rows.length * 21) * u, 0]} color="#ffd54a">DRAW COMPLETE</Text>
      <Text font={FONTS.bold} fontSize={20 * u} position={[0, (18 + rows.length * 21) * u, 0]} color="#ffffff" letterSpacing={0.1}>{`TOTAL PRIZES ${gbp(view.totalPrize)}  •  ${rows.length} WINNER${rows.length === 1 ? '' : 'S'}`}</Text>
      {rows.map(({ r, i, x }, k) => {
        const y = ((rows.length * 21) - 30 - k * 42) * u;
        const c = k % 2 ? '#e8e0ff' : '#ffffff';
        return (
          <group key={`${i}-${x.ticket_number}`}>
            <Text font={FONTS.semi} fontSize={19 * u} position={[cols[0], y, 0]} anchorX="left" color={tierOf(i).b}>{`${i + 1}. ${r.name}`.slice(0, 22)}</Text>
            <Text font={FONTS.num} fontSize={22 * u} position={[cols[1], y, 0]} anchorX="left" color={c}>{`#${pad(x.ticket_number)}`}</Text>
            <Text font={FONTS.semi} fontSize={19 * u} position={[cols[2], y, 0]} anchorX="left" color={c}>{x.display_name}</Text>
            <Text font={FONTS.num} fontSize={22 * u} position={[cols[3], y, 0]} anchorX="left" color="#ffd54a">{gbp(r.prize_amount)}</Text>
          </group>
        );
      })}
    </>
  );
}

function Overlay({ S, view }) {
  const { size } = useThree();
  const w = size.width;
  const h = size.height;
  const u = Math.max(0.42, Math.min(w / 1600, h / 900));
  const r = view.rounds[view.round];
  const L = -w / 2 + 36 * u;
  const T = h / 2 - 36 * u;
  const showStats = !['revealed', 'complete'].includes(view.stage);
  return (
    <>
      <OrthographicCamera makeDefault position={[0, 0, 100]} />
      {showStats && r && <>
        <Text font={FONTS.bold} fontSize={16 * u} position={[L, T, 0]} anchorX="left" anchorY="top" color="#ffd54a" letterSpacing={0.2}>{`ROUND ${view.round + 1} OF ${view.rounds.length}`}</Text>
        <Text font={FONTS.bold} fontSize={32 * u} position={[L, T - 26 * u, 0]} anchorX="left" anchorY="top" color="#ffffff">{r.name.toUpperCase()}</Text>
        <Text font={FONTS.semi} fontSize={16 * u} position={[L, T - 68 * u, 0]} anchorX="left" anchorY="top" color="#c9b8ff">{`${gbp(r.prize_amount)} × ${r.num_winners} · ${(REWARD_LABEL[r.reward_type] || REWARD_LABEL.winnings).toUpperCase()}`}</Text>
        <LiveText S={S} font={FONTS.num} fontSize={50 * u} position={[-L, T + 4 * u, 0]} anchorX="right" anchorY="top" color="#ffd54a"
          get={(s) => (s.stage === 'ready' ? null : Math.floor(s.stage === 'loading' ? Math.min(1, elapsed(s) / s.cfg.load_duration_s) * view.eligible : view.eligible).toLocaleString('en-GB'))} />
        {view.stage !== 'ready' && <Text font={FONTS.bold} fontSize={14 * u} position={[-L, T - 56 * u, 0]} anchorX="right" anchorY="top" color="#ffffff" letterSpacing={0.2}>{`OF ${view.eligible.toLocaleString('en-GB')} TICKETS IN THE POOL`}</Text>}
        <Text font={FONTS.bold} fontSize={22 * u} position={[0, -h / 2 + 44 * u, 0]} color="#ffffff" letterSpacing={0.35}>{STAGE_CAPTION[view.stage]}</Text>
      </>}
      {view.preview && <Text font={FONTS.bold} fontSize={13 * u} position={[0, T, 0]} anchorY="top" color="#ff8fa3" letterSpacing={0.25}>PREVIEW · SIMULATED RESULT · NOT OFFICIAL</Text>}
      {view.replay && <Text font={FONTS.bold} fontSize={13 * u} position={[0, T, 0]} anchorY="top" color="#9fe8c4" letterSpacing={0.25}>REPLAY OF OFFICIAL RESULT</Text>}
      {view.stage === 'ready' && <Intro view={view} u={u} />}
      {view.stage === 'mixing' && <>
        <LiveText S={S} font={FONTS.num} fontSize={92 * u} position={[-L - 40 * u, 0, 0]} anchorX="right" color="#ffffff" outlineWidth={2 * u} outlineColor="#7b3bff"
          get={(s) => { const left = Math.max(0, Math.ceil(s.cfg.mix_duration_s - elapsed(s))); return left > 3 ? `${left}s` : null; }} />
        <LiveText S={S} font={FONTS.num} fontSize={300 * u} position={[0, 0, 2]} color="#ffd54a" outlineWidth={6 * u} outlineColor="#6b3d00"
          get={(s) => { const left = Math.ceil(s.cfg.mix_duration_s - elapsed(s)); return left <= 3 && left > 0 ? String(left) : null; }} />
      </>}
      {(view.stage === 'drawing' || view.stage === 'drawn') && <group position={[0, -h / 2 + 130 * u, 0]}>
        <mesh position={[0, 0, -1]}><planeGeometry args={[460 * u, 112 * u]} /><meshBasicMaterial color="#0d0626" transparent opacity={0.85} /></mesh>
        <mesh position={[0, 0, -1.2]}><planeGeometry args={[472 * u, 124 * u]} /><meshBasicMaterial color="#ffcf3a" /></mesh>
        <LiveText S={S} fps={30} font={FONTS.num} fontSize={84 * u} color="#ffd54a" get={cycleNumber} />
      </group>}
      {view.stage === 'revealed' && <WinnerCards view={view} u={u} w={w} />}
      {view.stage === 'complete' && <Finale view={view} u={u} w={w} />}
      <Confetti S={S} w={w} h={h} />
    </>
  );
}

export function StudioHud({ S, view }) {
  return <Hud renderPriority={2}><Overlay S={S} view={view} /></Hud>;
}
