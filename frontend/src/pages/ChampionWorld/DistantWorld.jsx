/**
 * DistantWorld — cheap far-scenery layers that give the kingdom scale
 * WITHOUT downloading any GLBs.
 *
 * Four visual layers behind the play area:
 *   • Championship Castle silhouette — prominent horizon landmark
 *   • Three fog-blended mountain ridges (near / mid / far)
 *   • Soft canopy silhouette line (dome-shaped, not primitive cones)
 *   • Drifting cloud slab
 *
 * All meshes are unlit basic materials so there is zero shadow cost.
 * Fog handles the depth cue.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// --- Jagged extruded mountain ridge --------------------------------------
function buildRidge({ length = 200, height = 18, jitter = 6, segments = 40, seed = 1, baseY = 0, color = '#4a5a7a' }) {
  const rng = (i) => {
    const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const positions = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = (t - 0.5) * length;
    const h = height * (0.55 + rng(i) * 0.35 + rng(i * 7 + 3) * 0.1);
    const midBoost = 1 + Math.sin(t * Math.PI) * 0.3;
    positions.push([x, baseY + h * midBoost * 0.5, (rng(i * 3) - 0.5) * jitter]);
    positions.push([x, baseY - 2, (rng(i * 3) - 0.5) * jitter]);
  }
  const verts = [];
  for (let i = 0; i < segments; i++) {
    const a = positions[i * 2], b = positions[i * 2 + 1];
    const c = positions[(i + 1) * 2], d = positions[(i + 1) * 2 + 1];
    verts.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color, fog: true });
  return { g, mat };
}

function Ridge(props) {
  const { g, mat } = useMemo(() => buildRidge(props), []);      // eslint-disable-line
  return <mesh geometry={g} material={mat} position={props.position} rotation={props.rotation} />;
}

// --- Championship Castle silhouette — prominent horizon landmark ---------
// It's placed FAR enough that the player at Level 1 sees it clearly as
// "the destination" without it dominating the composition. Its size &
// tint are tuned to sit inside the world fog and read as far distance.
function DistantCastle({ position = [55, 8, -55], scale = 2.0, tint = '#4a537a' }) {
  return (
    <group position={position} scale={scale}>
      {/* rocky plateau base */}
      <mesh position={[0, -2.5, 0]}>
        <cylinderGeometry args={[10, 12, 5, 20]} />
        <meshBasicMaterial color="#3d4147" fog />
      </mesh>
      {/* main keep */}
      <mesh position={[0, 4, 0]}>
        <boxGeometry args={[7, 9, 7]} />
        <meshBasicMaterial color={tint} fog />
      </mesh>
      {/* wide crenellated wall */}
      <mesh position={[0, 1.5, 3.6]}>
        <boxGeometry args={[10, 3.6, 0.8]} />
        <meshBasicMaterial color="#5a6284" fog />
      </mesh>
      {/* left tower + spire */}
      <mesh position={[-4.5, 5, -0.5]}>
        <cylinderGeometry args={[1.4, 1.7, 11, 12]} />
        <meshBasicMaterial color={tint} fog />
      </mesh>
      <mesh position={[-4.5, 12, -0.5]}>
        <coneGeometry args={[1.8, 3.5, 14]} />
        <meshBasicMaterial color="#6b7597" fog />
      </mesh>
      {/* right tower + spire */}
      <mesh position={[4.5, 5.5, -0.4]}>
        <cylinderGeometry args={[1.6, 1.9, 12, 12]} />
        <meshBasicMaterial color={tint} fog />
      </mesh>
      <mesh position={[4.5, 13, -0.4]}>
        <coneGeometry args={[2.0, 3.8, 14]} />
        <meshBasicMaterial color="#6b7597" fog />
      </mesh>
      {/* central spire — the "goal" beacon */}
      <mesh position={[0, 11, 0]}>
        <cylinderGeometry args={[1.2, 1.4, 7, 12]} />
        <meshBasicMaterial color={tint} fog />
      </mesh>
      <mesh position={[0, 16, 0]}>
        <coneGeometry args={[1.6, 4.2, 14]} />
        <meshBasicMaterial color="#FFD54A" fog />
      </mesh>
      {/* tiny gold pennants glow */}
      <mesh position={[0, 18.5, 0]}>
        <sphereGeometry args={[0.3, 8, 6]} />
        <meshBasicMaterial color="#FFE082" fog={false} />
      </mesh>
    </group>
  );
}

// --- Soft canopy silhouette (dome-shaped, NOT primitive cones) -----------
// Uses hemispheres blended into the fog so it reads as a tree line, not
// as isolated primitives.
function CanopyLine({ count = 60, radius = 42, height = 3.6, tint = '#2c5836' }) {
  const items = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 1.8 - Math.PI * 0.9;
      const jitter = (Math.sin(i * 12.9) * 0.5 - 0.25) * 6;
      const x = Math.cos(a) * (radius + jitter);
      const z = Math.sin(a) * (radius + jitter) - 6;
      const s = 0.85 + ((i * 7) % 5) / 5 * 0.55;
      arr.push([x, height * s * 0.35, z, s]);
    }
    return arr;
  }, [count, radius, height]);

  return (
    <group>
      {items.map(([x, y, z, s], i) => (
        <group key={i} position={[x, y, z]}>
          {/* dome canopy */}
          <mesh scale={[s * 1.6, s * 0.9, s * 1.6]}>
            <sphereGeometry args={[1.2, 10, 8]} />
            <meshBasicMaterial color={tint} fog />
          </mesh>
          {/* subtle trunk stub — barely visible in fog */}
          <mesh position={[0, -s * 0.6, 0]} scale={[s * 0.18, s * 0.6, s * 0.18]}>
            <cylinderGeometry args={[1, 1, 1, 6]} />
            <meshBasicMaterial color="#2a382b" fog />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// --- Drifting cloud slab -------------------------------------------------
function CloudBand() {
  const ref = useRef();
  useFrame((_, dt) => {
    if (ref.current) ref.current.position.x = ((ref.current.position.x - dt * 0.6) % 400);
  });
  const puffs = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    x: i * 22 - 60, y: 24 + (i % 3) * 5, z: -50 - (i % 4) * 8, s: 3 + (i % 4),
  })), []);
  return (
    <group ref={ref}>
      {puffs.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[p.s, 10, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.75} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

export default function DistantWorld() {
  return (
    <group>
      {/* Far snow-cap ridge */}
      <Ridge position={[30, 0, -95]} rotation={[0, 0, 0]}
             length={320} height={32} jitter={12} segments={54} seed={3} baseY={-2} color="#8f97ae" />
      {/* Mid ridge — sits behind the castle */}
      <Ridge position={[30, 0, -70]} rotation={[0, 0, 0]}
             length={280} height={24} jitter={9} segments={46} seed={11} baseY={-2} color="#556080" />
      {/* Near forested ridge — creates the "next horizon" */}
      <Ridge position={[30, 0, -45]} rotation={[0, 0, 0]}
             length={220} height={12} jitter={7} segments={40} seed={19} baseY={-2} color="#3b5b3f" />

      {/* Championship Castle — the horizon "goal". Positioned along the
          road's forward axis, low enough that its silhouette reads as a
          single distant fortress rather than tall clipped spires. */}
      <DistantCastle position={[50, 3, -32]} scale={1.35} tint="#4d5680" />

      {/* Distance canopy — soft blended silhouette, no primitive cones */}
      <CanopyLine count={64} radius={40} height={3.6} tint="#2c5836" />

      <CloudBand />
    </group>
  );
}
