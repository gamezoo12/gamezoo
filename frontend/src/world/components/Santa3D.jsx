import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';

const RED = '#d62828';
const WHITE = '#fbfbfb';
const SKIN = '#f6c9a8';
const BLACK = '#1a1a1a';
const GOLD = '#f4c430';

const M = ({ c, r = 0.55, m = 0.05, e }) => <meshStandardMaterial color={c} roughness={r} metalness={m} emissive={e || '#000'} emissiveIntensity={e ? 0.6 : 0} />;

function Arm({ side, armRef }) {
  return (
    <group ref={armRef} position={[0.5 * side, 0.55, 0]}>
      <mesh position={[0.12 * side, -0.28, 0]} rotation={[0, 0, 0.35 * side]} castShadow><capsuleGeometry args={[0.13, 0.42, 6, 12]} /><M c={RED} /></mesh>
      <mesh position={[0.24 * side, -0.58, 0]}><torusGeometry args={[0.12, 0.05, 8, 16]} /><M c={WHITE} r={0.9} /></mesh>
      <mesh position={[0.26 * side, -0.68, 0]} castShadow><sphereGeometry args={[0.12, 16, 16]} /><M c={WHITE} r={0.8} /></mesh>
    </group>
  );
}

function Leg({ side, legRef }) {
  return (
    <group ref={legRef} position={[0.2 * side, -0.38, 0]}>
      <mesh position={[0, -0.22, 0]} castShadow><cylinderGeometry args={[0.13, 0.13, 0.42, 14]} /><M c={RED} /></mesh>
      <mesh position={[0, -0.47, 0.06]} castShadow><boxGeometry args={[0.27, 0.16, 0.38]} /><M c={BLACK} r={0.3} m={0.3} /></mesh>
    </group>
  );
}

const DANCE_FN = {
  idle: (t, p) => { p.body.position.y = Math.sin(t * 3) * 0.03; p.armR.rotation.z = Math.sin(t * 2) > 0.6 ? -1.6 - Math.sin(t * 10) * 0.4 : -0.1; p.root.rotation.y = Math.sin(t * 0.8) * 0.35; },
  twist: (t, p) => { p.root.rotation.y = Math.sin(t * 8) * 0.7; p.body.rotation.z = Math.sin(t * 8) * 0.15; p.armR.rotation.z = -1.2 + Math.sin(t * 8) * 0.5; p.armL.rotation.z = 1.2 - Math.sin(t * 8) * 0.5; },
  spin: (t, p) => { p.root.rotation.y = t * 7; p.body.position.y = Math.abs(Math.sin(t * 5)) * 0.35; p.armR.rotation.z = -2.4; p.armL.rotation.z = 2.4; },
  moonwalk: (t, p) => { p.root.position.x = Math.sin(t * 1.6) * 0.6; p.root.rotation.y = Math.cos(t * 1.6) > 0 ? -1.2 : 1.2; p.legL.rotation.x = Math.sin(t * 9) * 0.5; p.legR.rotation.x = -Math.sin(t * 9) * 0.5; p.head.rotation.z = Math.sin(t * 9) * 0.12; },
  disco: (t, p) => { const up = Math.sin(t * 6) > 0; p.armR.rotation.z = up ? -2.7 : -0.4; p.armL.rotation.z = up ? 0.4 : 2.7; p.body.position.y = Math.abs(Math.sin(t * 12)) * 0.12; p.root.rotation.y = up ? 0.4 : -0.4; },
  belly: (t, p) => { const s = Math.sin(t * 22) * 0.06; p.body.scale.set(1 + s, 1 - s, 1 + s); p.head.position.y = 0.95 + Math.abs(Math.sin(t * 11)) * 0.06; p.armR.rotation.z = -0.5; p.armL.rotation.z = 0.5; },
  wave: (t, p) => { p.armR.rotation.z = -2.6 + Math.sin(t * 12) * 0.35; p.armL.rotation.z = 2.6 - Math.sin(t * 12) * 0.35; p.root.rotation.z = Math.sin(t * 3) * 0.12; },
  kick: (t, p) => { p.body.position.y = Math.abs(Math.sin(t * 6)) * 0.12; p.legL.rotation.x = Math.max(0, Math.sin(t * 6)) * -1.3; p.legR.rotation.x = Math.max(0, -Math.sin(t * 6)) * -1.3; p.armR.rotation.z = -2.2; p.armL.rotation.z = 0.6; },
  ride: (t, p) => { p.body.position.y = Math.abs(Math.sin(t * 9)) * 0.06; p.armR.rotation.z = -2.2 + Math.sin(t * 6) * 0.4; p.legL.rotation.x = -1.2; p.legR.rotation.x = -1.2; },
  try: (t, p) => { p.body.position.y = Math.abs(Math.sin(t * 5)) * 0.15; p.armR.rotation.z = -2 + Math.sin(t * 10) * 0.5; p.head.rotation.z = Math.sin(t * 4) * 0.15; },
};

function SantaModel({ dance }) {
  const root = useRef(); const body = useRef(); const head = useRef();
  const armL = useRef(); const armR = useRef(); const legL = useRef(); const legR = useRef(); const pom = useRef();
  useFrame(({ clock }) => {
    const p = { root: root.current, body: body.current, head: head.current, armL: armL.current, armR: armR.current, legL: legL.current, legR: legR.current };
    if (!p.root) return;
    p.root.position.x = 0; p.root.rotation.set(0, 0, 0); p.body.position.y = 0; p.body.rotation.set(0, 0, 0); p.body.scale.set(1, 1, 1);
    p.head.position.y = 0.95; p.head.rotation.set(0, 0, 0);
    p.armL.rotation.set(0, 0, 0.1); p.armR.rotation.set(0, 0, -0.1); p.legL.rotation.set(0, 0, 0); p.legR.rotation.set(0, 0, 0);
    (DANCE_FN[dance] || DANCE_FN.idle)(clock.elapsedTime, p);
    pom.current.position.x = 0.34 + Math.sin(clock.elapsedTime * 6) * 0.05;
  });
  return (
    <group ref={root}>
      <group ref={body}>
        <mesh position={[0, 0.2, 0]} scale={[1, 1.05, 0.9]} castShadow><sphereGeometry args={[0.55, 32, 32]} /><M c={RED} /></mesh>
        <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.5, 0.07, 12, 40]} /><M c={BLACK} r={0.25} m={0.4} /></mesh>
        <mesh position={[0, 0.06, 0.52]}><boxGeometry args={[0.2, 0.17, 0.05]} /><M c={GOLD} r={0.2} m={0.9} e="#7a5a00" /></mesh>
        <mesh position={[0, -0.3, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.4, 0.09, 12, 40]} /><M c={WHITE} r={0.95} /></mesh>
        <mesh position={[0, 0.12, 0.5]} scale={[0.07, 0.36, 0.05]}><sphereGeometry args={[1, 12, 12]} /><M c={WHITE} r={0.95} /></mesh>
        <Arm side={-1} armRef={armL} />
        <Arm side={1} armRef={armR} />
        <group ref={head} position={[0, 0.95, 0]}>
          <mesh castShadow><sphereGeometry args={[0.34, 32, 32]} /><M c={SKIN} r={0.7} /></mesh>
          <mesh position={[0, -0.2, 0.13]} scale={[1, 1.15, 0.75]}><sphereGeometry args={[0.32, 24, 24]} /><M c={WHITE} r={1} /></mesh>
          <mesh position={[-0.1, -0.03, 0.3]} scale={[1.3, 0.6, 0.7]}><sphereGeometry args={[0.09, 12, 12]} /><M c={WHITE} r={1} /></mesh>
          <mesh position={[0.1, -0.03, 0.3]} scale={[1.3, 0.6, 0.7]}><sphereGeometry args={[0.09, 12, 12]} /><M c={WHITE} r={1} /></mesh>
          <mesh position={[0, 0.03, 0.33]}><sphereGeometry args={[0.065, 16, 16]} /><M c="#e76f6f" r={0.4} /></mesh>
          <mesh position={[-0.11, 0.12, 0.29]}><sphereGeometry args={[0.035, 12, 12]} /><M c={BLACK} r={0.2} /></mesh>
          <mesh position={[0.11, 0.12, 0.29]}><sphereGeometry args={[0.035, 12, 12]} /><M c={BLACK} r={0.2} /></mesh>
          <mesh position={[-0.2, 0.0, 0.24]}><sphereGeometry args={[0.05, 12, 12]} /><meshStandardMaterial color="#f08f8f" transparent opacity={0.6} /></mesh>
          <mesh position={[0.2, 0.0, 0.24]}><sphereGeometry args={[0.05, 12, 12]} /><meshStandardMaterial color="#f08f8f" transparent opacity={0.6} /></mesh>
          <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.31, 0.08, 12, 32]} /><M c={WHITE} r={1} /></mesh>
          <mesh position={[0.08, 0.45, -0.02]} rotation={[0, 0, -0.45]} castShadow><coneGeometry args={[0.3, 0.6, 24]} /><M c={RED} /></mesh>
          <mesh ref={pom} position={[0.34, 0.62, -0.02]}><sphereGeometry args={[0.09, 16, 16]} /><M c={WHITE} r={1} /></mesh>
        </group>
      </group>
      <Leg side={-1} legRef={legL} />
      <Leg side={1} legRef={legR} />
      <mesh position={[0, -0.95, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[0.7, 32]} /><shadowMaterial opacity={0.3} /></mesh>
    </group>
  );
}

function Reindeer({ x, lead, phase }) {
  const g = useRef(); const legs = useRef([]); const nose = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 11 + phase;
    g.current.position.y = Math.abs(Math.sin(t)) * 0.18;
    g.current.rotation.z = Math.sin(t) * 0.08;
    legs.current.forEach((l, i) => { if (l) l.rotation.z = Math.sin(t + (i % 2 ? Math.PI : 0)) * 0.7; });
    if (nose.current) nose.current.material.emissiveIntensity = 0.6 + Math.sin(clock.elapsedTime * 8) * 0.5;
  });
  const BROWN = '#8b5a2b';
  return (
    <group position={[x, -0.25, 0]}>
      <group ref={g}>
        <mesh scale={[0.55, 0.28, 0.25]} castShadow><sphereGeometry args={[1, 20, 16]} /><M c={BROWN} r={0.8} /></mesh>
        <mesh position={[0.48, 0.32, 0]} rotation={[0, 0, -0.6]} castShadow><capsuleGeometry args={[0.1, 0.32, 6, 10]} /><M c={BROWN} r={0.8} /></mesh>
        <group position={[0.66, 0.55, 0]}>
          <mesh scale={[0.22, 0.16, 0.15]} castShadow><sphereGeometry args={[1, 16, 14]} /><M c={BROWN} r={0.8} /></mesh>
          <mesh ref={nose} position={[0.22, -0.02, 0]}><sphereGeometry args={[lead ? 0.065 : 0.045, 12, 12]} /><M c={lead ? '#ff2a2a' : '#2b1608'} e={lead ? '#ff0000' : undefined} /></mesh>
          <mesh position={[0.06, 0.06, 0.12]}><sphereGeometry args={[0.025, 8, 8]} /><M c={BLACK} /></mesh>
          <mesh position={[0.06, 0.06, -0.12]}><sphereGeometry args={[0.025, 8, 8]} /><M c={BLACK} /></mesh>
          {[0.08, -0.08].map((z) => (
            <group key={z} position={[-0.05, 0.14, z]} rotation={[z > 0 ? 0.3 : -0.3, 0, 0.2]}>
              <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.018, 0.025, 0.3, 6]} /><M c="#e9d3a2" /></mesh>
              <mesh position={[0.07, 0.22, 0]} rotation={[0, 0, -0.9]}><cylinderGeometry args={[0.014, 0.018, 0.14, 6]} /><M c="#e9d3a2" /></mesh>
              <mesh position={[-0.06, 0.18, 0]} rotation={[0, 0, 0.9]}><cylinderGeometry args={[0.014, 0.018, 0.12, 6]} /><M c="#e9d3a2" /></mesh>
            </group>
          ))}
        </group>
        <mesh position={[-0.52, 0.12, 0]} scale={[0.1, 0.08, 0.08]}><sphereGeometry args={[1, 10, 10]} /><M c={WHITE} r={1} /></mesh>
        <mesh position={[0.1, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 1.3]}><torusGeometry args={[0.26, 0.035, 8, 24]} /><M c={RED} /></mesh>
        <mesh position={[0.1, -0.2, 0.2]}><sphereGeometry args={[0.045, 10, 10]} /><M c={GOLD} m={0.9} r={0.2} e="#7a5a00" /></mesh>
        {[[0.32, 0.12], [0.32, -0.12], [-0.32, 0.12], [-0.32, -0.12]].map(([lx, lz], i) => (
          <group key={i} ref={(el) => { legs.current[i] = el; }} position={[lx, -0.18, lz]}>
            <mesh position={[0, -0.22, 0]}><cylinderGeometry args={[0.045, 0.04, 0.42, 8]} /><M c={BROWN} r={0.8} /></mesh>
            <mesh position={[0, -0.44, 0]}><cylinderGeometry args={[0.05, 0.05, 0.06, 8]} /><M c="#2b1608" /></mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function Sleigh() {
  return (
    <group position={[0, -0.55, 0]}>
      <mesh position={[0, 0.25, 0]} castShadow><boxGeometry args={[1.5, 0.55, 0.95]} /><M c="#b3121f" r={0.35} m={0.2} /></mesh>
      <mesh position={[-0.7, 0.55, 0]} castShadow><boxGeometry args={[0.18, 0.7, 0.95]} /><M c="#b3121f" r={0.35} m={0.2} /></mesh>
      <mesh position={[0.78, 0.42, 0]} rotation={[0, 0, -0.5]} castShadow><boxGeometry args={[0.16, 0.5, 0.95]} /><M c="#b3121f" r={0.35} m={0.2} /></mesh>
      <mesh position={[0, 0.53, 0.48]}><boxGeometry args={[1.5, 0.06, 0.03]} /><M c={GOLD} m={0.9} r={0.2} e="#7a5a00" /></mesh>
      <mesh position={[0, 0.53, -0.48]}><boxGeometry args={[1.5, 0.06, 0.03]} /><M c={GOLD} m={0.9} r={0.2} e="#7a5a00" /></mesh>
      {[0.42, -0.42].map((z) => (
        <group key={z}>
          <mesh position={[0, -0.18, z]}><boxGeometry args={[1.9, 0.05, 0.06]} /><M c={GOLD} m={0.9} r={0.2} e="#7a5a00" /></mesh>
          <mesh position={[1.0, -0.06, z]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.13, 0.028, 8, 16, Math.PI]} /><M c={GOLD} m={0.9} r={0.2} /></mesh>
          <mesh position={[-0.45, -0.05, z]}><cylinderGeometry args={[0.025, 0.025, 0.25, 6]} /><M c={GOLD} m={0.9} r={0.2} /></mesh>
          <mesh position={[0.45, -0.05, z]}><cylinderGeometry args={[0.025, 0.025, 0.25, 6]} /><M c={GOLD} m={0.9} r={0.2} /></mesh>
        </group>
      ))}
      <mesh position={[-0.45, 0.72, 0.15]} castShadow><boxGeometry args={[0.35, 0.3, 0.3]} /><M c="#16a34a" /></mesh>
      <mesh position={[-0.45, 0.72, 0.15]}><boxGeometry args={[0.07, 0.31, 0.31]} /><M c={GOLD} m={0.8} /></mesh>
      <mesh position={[-0.42, 0.68, -0.22]} castShadow><boxGeometry args={[0.28, 0.24, 0.24]} /><M c="#2563eb" /></mesh>
      <mesh position={[1.45, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.012, 0.012, 1.1, 4]} /><M c="#7c2d12" /></mesh>
    </group>
  );
}

function Ride({ dir }) {
  const g = useRef();
  useFrame(({ clock }) => { g.current.position.y = Math.sin(clock.elapsedTime * 11) * 0.05 + 0.15; g.current.rotation.z = Math.sin(clock.elapsedTime * 5.5) * 0.03; });
  return (
    <group ref={g} rotation={[0.15, dir > 0 ? -0.35 : Math.PI + 0.35, 0]}>
      <Sleigh />
      <group position={[-0.1, 0.25, 0]} rotation={[0, dir > 0 ? 0.9 : -0.9, 0]} scale={0.8}><SantaModel dance="ride" /></group>
      <Reindeer x={2.05} phase={0} />
      <Reindeer x={3.35} phase={0.9} lead />
    </group>
  );
}

// Real-time 3D Santa (procedural, no model files). dance: idle|twist|spin|moonwalk|disco|belly|wave|kick|ride|try
export default function Santa3D({ dance = 'idle', dir = 1, className = '', testId = 'santa-3d' }) {
  const dpr = useMemo(() => Math.min(2, window.devicePixelRatio || 1), []);
  const riding = dance === 'ride';
  return (
    <div className={className} data-testid={testId} data-dance={dance}>
      <Canvas key={riding ? 'ride' : 'stand'} shadows dpr={dpr} resize={{ offsetSize: true, scroll: false }} camera={riding ? { position: [0, 1.2, 8.5], fov: 32 } : { position: [0, 0.5, 4.6], fov: 38 }} gl={{ alpha: true, antialias: true }} style={{ background: 'transparent' }}>
        <ambientLight intensity={0.75} />
        <hemisphereLight args={['#fff6e0', '#3b1d5e', 0.6]} />
        <directionalLight position={[2.5, 4, 3]} intensity={1.6} castShadow shadow-mapSize={[512, 512]} />
        <pointLight position={[-2, 1, 2]} intensity={0.8} color="#ffd27a" />
        {riding ? <Ride dir={dir} /> : <SantaModel dance={dance} />}
      </Canvas>
    </div>
  );
}
