import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { FONTS } from './textures';
import { captionAt } from './commentary';

// Animated 3D AI hosts: they walk on stage, stroll while talking, gesture, laugh, point at the machine and celebrate winners.
const LOOKS = {
  max: { name: 'MAX', skin: '#d9a27c', hair: '#2a1a12', top: '#1b2350', legs: '#141a3a', accent: '#111111', hairStyle: 'short' },
  leo: { name: 'LEO', skin: '#e8b892', hair: '#6b3b1f', top: '#ff7a3d', legs: '#1f6f78', accent: '#ffd54a', hairStyle: 'curly' },
  sophia: { name: 'SOPHIA', skin: '#8d5a3b', hair: '#2b1810', top: '#d9a93a', legs: '#8d5a3b', accent: '#fff2c2', hairStyle: 'long', dress: true },
  ruby: { name: 'RUBY', skin: '#f1c6a8', hair: '#c8341f', top: '#1f9d55', legs: '#151515', accent: '#ffffff', hairStyle: 'bob' },
};
const mat = (color, extra = {}) => <meshStandardMaterial color={color} roughness={0.55} {...extra} />;

function Hair({ look }) {
  const m = mat(look.hair, { roughness: 0.8 });
  if (look.hairStyle === 'curly') return <group>{[[-0.14, 0.4, 0], [0, 0.46, 0], [0.14, 0.4, 0], [-0.1, 0.36, -0.12], [0.1, 0.36, -0.12], [0, 0.4, -0.15], [-0.2, 0.3, -0.05], [0.2, 0.3, -0.05]].map((p, i) => <mesh key={i} position={p}><sphereGeometry args={[0.11, 12, 12]} />{m}</mesh>)}</group>;
  if (look.hairStyle === 'long') return <group><mesh position={[0, 0.31, -0.02]} scale={[1.08, 1, 1.08]}><sphereGeometry args={[0.25, 20, 20, 0, Math.PI * 2, 0, Math.PI / 1.9]} />{m}</mesh><mesh position={[0, 0.05, -0.12]}><capsuleGeometry args={[0.23, 0.42, 6, 16]} />{m}</mesh></group>;
  if (look.hairStyle === 'bob') return <group><mesh position={[0, 0.27, -0.02]} scale={[1.14, 1.05, 1.12]}><sphereGeometry args={[0.25, 20, 20, 0, Math.PI * 2, 0, Math.PI / 1.6]} />{m}</mesh><mesh position={[0, 0.41, 0.17]} rotation-x={0.5}><boxGeometry args={[0.36, 0.08, 0.12]} />{m}</mesh></group>;
  return <mesh position={[0, 0.3, -0.02]} scale={[1.05, 0.95, 1.05]}><sphereGeometry args={[0.25, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2.2]} />{m}</mesh>;
}

function Limb({ side, at, len, radius, color, refObj }) {
  return <group ref={refObj} position={[side * at[0], at[1], 0]}><mesh position={[0, -len / 2, 0]}><capsuleGeometry args={[radius, len, 6, 12]} />{mat(color)}</mesh></group>;
}

function Character({ id, slot, count, S }) {
  const look = LOOKS[id];
  const R = { root: useRef(), body: useRef(), head: useRef(), mouth: useRef(), eyes: useRef(), armL: useRef(), armR: useRef(), legL: useRef(), legR: useRef() };
  const home = count === 1 ? -4.1 : slot === 0 ? -4.3 : 4.3;
  const toCenter = -Math.sign(home);
  const st = useMemo(() => ({ x: home + Math.sign(home) * 5, blinkAt: 2 + Math.random() * 3 }), [home]);
  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.12);
    const t = clock.elapsedTime + slot * 1.7;
    const s = S.current;
    const cue = captionAt(s.caption) ? s.caption : null;
    const speaking = cue?.host === id;
    const otherSpeaking = cue && !speaking;
    const celebrating = s.stage === 'drawn' || cue?.action === 'celebrate';
    let action = speaking ? cue.action || 'talk' : otherSpeaking && cue.action === 'laugh' ? 'chuckle' : celebrating ? 'celebrate' : 'idle';
    if (s.stage === 'drawing' && !speaking) action = 'suspense';
    const target = home + (speaking && ['talk', 'point', 'suspense'].includes(action) && ['loading', 'mixing', 'loaded', 'mixed', 'ready'].includes(s.stage) ? toCenter * 0.9 : 0);
    const dx = target - st.x;
    const walking = Math.abs(dx) > 0.04;
    if (walking) st.x += Math.sign(dx) * Math.min(Math.abs(dx), 1.7 * dt);
    const level = speaking ? s.voiceLevel?.() || 0 : 0;
    const k = 1 - Math.exp(-dt * 10);
    const ease = (obj, key, v) => { obj[key] += (v - obj[key]) * k; };
    const { root, body, head, mouth, eyes, armL, armR, legL, legR } = R;
    if (!root.current) return;
    root.current.position.x = st.x;
    const face = walking ? Math.sign(dx) * 1.2 : otherSpeaking ? toCenter * 0.7 : toCenter * 0.3;
    ease(root.current.rotation, 'y', face);
    let armZ = [0.12, 0.12]; let armX = [0, 0]; let legX = [0, 0]; let bob = Math.sin(t * 2) * 0.01; let headX = 0; let headZ = Math.sin(t * 0.8) * 0.04; let lean = 0; let open = level * 1.7;
    if (walking) { const w = Math.sin(t * 8); legX = [w * 0.6, -w * 0.6]; armX = [-w * 0.5, w * 0.5]; bob = Math.abs(w) * 0.06; }
    if (action === 'talk' || action === 'point') { armZ = [0.25 + Math.sin(t * 2.6) * 0.15, 0.3 + Math.sin(t * 3.1) * 0.25]; armX = [-0.4 - Math.sin(t * 2.2) * 0.25, -0.7 + Math.sin(t * 2.7) * 0.3]; headX = Math.sin(t * 5) * 0.08 * (0.4 + level); }
    if (action === 'point') { const c = toCenter > 0 ? 1 : 0; armZ[c] = 1.35; armX[c] = -0.5; }
    if (action === 'wave') { armZ = [0.15, 2.5 + Math.sin(t * 10) * 0.35]; }
    if (action === 'laugh' || action === 'chuckle') { const a = action === 'laugh' ? 1 : 0.5; headX = -0.35 * a + Math.sin(t * 18) * 0.06; bob = Math.abs(Math.sin(t * 14)) * 0.07 * a; armX = [-0.9, -0.9]; armZ = [0.5, 0.5]; open = Math.max(open, 0.6 * a + Math.abs(Math.sin(t * 16)) * 0.4 * a); }
    if (action === 'celebrate') { armZ = [2.6 + Math.sin(t * 9) * 0.2, 2.6 + Math.cos(t * 9) * 0.2]; bob = Math.abs(Math.sin(t * 6)) * 0.3; open = Math.max(open, 0.7); }
    if (action === 'suspense') { lean = 0.16; armX = [-1.0, -1.0]; armZ = [0.55, 0.55]; headX = 0.12; }
    ease(armL.current.rotation, 'z', -armZ[0]); ease(armR.current.rotation, 'z', armZ[1]);
    ease(armL.current.rotation, 'x', armX[0]); ease(armR.current.rotation, 'x', armX[1]);
    ease(legL.current.rotation, 'x', legX[0]); ease(legR.current.rotation, 'x', legX[1]);
    ease(head.current.rotation, 'x', headX); ease(head.current.rotation, 'z', headZ); ease(body.current.rotation, 'x', lean);
    body.current.position.y = bob;
    mouth.current.scale.y += (Math.min(1.2, 0.18 + open) - mouth.current.scale.y) * 0.5;
    if (t > st.blinkAt) { eyes.current.scale.y = 0.1; if (t > st.blinkAt + 0.12) { eyes.current.scale.y = 1; st.blinkAt = t + 2.5 + Math.random() * 3; } }
  });
  return (
    <group ref={R.root} position={[st.x, 0.02, 1.5]} scale={1.12} data-host={id}>
      <pointLight position={[0, 2.4, 1.4]} intensity={9} distance={4.5} color="#ffe2c4" />
      <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[0.5, 32]} /><meshBasicMaterial color="#ffd54a" transparent opacity={0.25} toneMapped={false} /></mesh>
      <Limb side={-1} at={[0.13, 0.9]} len={0.62} radius={0.085} color={look.dress ? look.skin : look.legs} refObj={R.legL} />
      <Limb side={1} at={[0.13, 0.9]} len={0.62} radius={0.085} color={look.dress ? look.skin : look.legs} refObj={R.legR} />
      <group ref={R.body}>
        {look.dress && <mesh position={[0, 0.72, 0]}><coneGeometry args={[0.42, 0.75, 24, 1, true]} />{mat(look.top, { metalness: 0.5, roughness: 0.3, side: 2 })}</mesh>}
        <mesh position={[0, 1.22, 0]}><capsuleGeometry args={[0.25, 0.42, 8, 16]} />{mat(look.top, look.dress ? { metalness: 0.5, roughness: 0.3 } : {})}</mesh>
        {!look.dress && <mesh position={[0, 1.32, 0.2]}><boxGeometry args={[0.14, 0.3, 0.05]} />{mat(look.accent)}</mesh>}
        <Limb side={-1} at={[0.33, 1.47]} len={0.55} radius={0.075} color={look.dress ? look.skin : look.top} refObj={R.armL} />
        <Limb side={1} at={[0.33, 1.47]} len={0.55} radius={0.075} color={look.dress ? look.skin : look.top} refObj={R.armR} />
        <group ref={R.head} position={[0, 1.62, 0]}>
          <mesh position={[0, 0.24, 0]}><sphereGeometry args={[0.24, 24, 24]} />{mat(look.skin)}</mesh>
          <Hair look={look} />
          <group ref={R.eyes} position={[0, 0.27, 0.2]}>
            {[-1, 1].map((x) => <group key={x} position={[x * 0.085, 0, 0]}><mesh><sphereGeometry args={[0.045, 12, 12]} />{mat('#ffffff')}</mesh><mesh position={[0, 0, 0.034]}><sphereGeometry args={[0.024, 10, 10]} />{mat('#1a1a1a')}</mesh></group>)}
          </group>
          {[-1, 1].map((x) => <mesh key={x} position={[x * 0.085, 0.345, 0.215]} rotation-z={x * -0.12}><boxGeometry args={[0.08, 0.016, 0.02]} />{mat(look.hair)}</mesh>)}
          <mesh ref={R.mouth} position={[0, 0.14, 0.215]} scale={[1.4, 0.2, 0.4]}><sphereGeometry args={[0.055, 16, 12]} />{mat('#5a1220')}</mesh>
          <Billboard position={[0, 0.66, 0]}><Text font={FONTS.bold} fontSize={0.12} color="#ffd54a" outlineWidth={0.01} outlineColor="#2a1050" letterSpacing={0.12}>{look.name}</Text></Billboard>
        </group>
      </group>
    </group>
  );
}

export function Hosts3D({ S, cast = [] }) {
  return <>{cast.filter((id) => LOOKS[id]).map((id, i, arr) => <Character key={`${id}-${arr.length}`} id={id} slot={i} count={arr.length} S={S} />)}</>;
}
