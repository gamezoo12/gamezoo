/**
 * BiomeExtras — additional props that push the world closer to the user's
 * reference image: cherry blossom trees (pink canopy), an entry stone gate
 * with heraldic banners, and a scattered fruit/flower field.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleElevation } from './Terrain';

function seed(x) { const s = Math.sin(x * 71.3 + 0.7) * 43758.5453; return s - Math.floor(s); }

const BLOSSOM_COUNT = 24;

function CherryBlossoms() {
  const trunkRef = useRef();
  const canopyRef = useRef();

  const positions = useMemo(() => {
    const out = [];
    // Cluster them near village + on castle approach for visual richness.
    const clusters = [
      { cx: 13, cz: 4, spread: 4 },  // near village
      { cx: 20, cz: 6, spread: 3 },  // village edge
      { cx: 40, cz: 3, spread: 3 },  // castle approach
      { cx: 46, cz: 9, spread: 2.5 }, // beside castle
    ];
    let idx = 0;
    for (const cl of clusters) {
      const count = Math.round(BLOSSOM_COUNT / clusters.length);
      for (let i = 0; i < count; i++) {
        const a = seed(idx * 3.1) * Math.PI * 2;
        const r = seed(idx * 5.7) * cl.spread;
        const x = cl.cx + Math.cos(a) * r;
        const z = cl.cz + Math.sin(a) * r;
        // avoid path corridor
        if (Math.abs(z - 2) < 1.6 && x > 8 && x < 42) { idx++; continue; }
        out.push({
          x, y: sampleElevation(x, z), z,
          s: 0.7 + seed(idx * 9.3) * 0.5,
          rot: seed(idx * 11.7) * Math.PI * 2,
        });
        idx++;
      }
    }
    return out;
  }, []);

  useMemo(() => {
    const m = new THREE.Matrix4();
    positions.forEach((p, i) => {
      m.compose(
        new THREE.Vector3(p.x, p.y, p.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot),
        new THREE.Vector3(p.s, p.s * 1.1, p.s),
      );
      trunkRef.current?.setMatrixAt(i, m);
      canopyRef.current?.setMatrixAt(i, m);
    });
    if (trunkRef.current) trunkRef.current.instanceMatrix.needsUpdate = true;
    if (canopyRef.current) canopyRef.current.instanceMatrix.needsUpdate = true;
  }, [positions]);

  // subtle sway
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (canopyRef.current) canopyRef.current.rotation.z = Math.sin(t * 0.6) * 0.03;
  });

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, positions.length]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 1.0, 6]} />
        <meshStandardMaterial color="#6a4028" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, positions.length]} castShadow>
        <sphereGeometry args={[0.75, 12, 8]} />
        <meshStandardMaterial color="#f9c8e0" roughness={0.8} emissive="#f9c8e0" emissiveIntensity={0.05} />
      </instancedMesh>
    </group>
  );
}

function EntryGate() {
  // A stone archway at the very start of the road (per reference image).
  const pos = [0, 0, 0];
  return (
    <group position={pos}>
      {/* left pillar */}
      <mesh position={[-1.6, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 2.4, 0.6]} />
        <meshStandardMaterial color="#a89880" roughness={0.9} />
      </mesh>
      <mesh position={[-1.6, 2.55, 0]} castShadow>
        <coneGeometry args={[0.45, 0.8, 4]} />
        <meshStandardMaterial color="#294b8f" />
      </mesh>
      {/* right pillar */}
      <mesh position={[1.6, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 2.4, 0.6]} />
        <meshStandardMaterial color="#a89880" roughness={0.9} />
      </mesh>
      <mesh position={[1.6, 2.55, 0]} castShadow>
        <coneGeometry args={[0.45, 0.8, 4]} />
        <meshStandardMaterial color="#294b8f" />
      </mesh>
      {/* top crossbeam */}
      <mesh position={[0, 2.4, 0]} castShadow>
        <boxGeometry args={[3.6, 0.35, 0.4]} />
        <meshStandardMaterial color="#948676" roughness={0.9} />
      </mesh>
      {/* central shield emblem (lion) */}
      <mesh position={[0, 2.4, 0.22]}>
        <planeGeometry args={[0.7, 0.8]} />
        <meshStandardMaterial color="#294b8f" />
      </mesh>
      <mesh position={[0, 2.4, 0.23]}>
        <ringGeometry args={[0.14, 0.22, 12]} />
        <meshStandardMaterial color="#FFD54A" emissive="#FFD54A" emissiveIntensity={0.6} />
      </mesh>
      {/* hanging royal-blue banners with lion */}
      {[-1.6, 1.6].map((x, i) => (
        <group key={i} position={[x, 1.5, 0.35]}>
          <mesh castShadow>
            <planeGeometry args={[0.5, 1.4]} />
            <meshStandardMaterial color="#294b8f" roughness={0.7} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0, 0.01]}>
            <planeGeometry args={[0.22, 0.32]} />
            <meshStandardMaterial color="#FFD54A" emissive="#FFD54A" emissiveIntensity={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function BiomeExtras() {
  return (
    <group>
      <EntryGate />
      <CherryBlossoms />
      <WheatFarm />
      <CircusTents />
      <FountainPlaza />
      <DistantCrystalCastle />
    </group>
  );
}

/** Fenced yellow wheat/rapeseed farmland (bottom-right in reference). */
function WheatFarm() {
  // Grid of tiny yellow tufts inside a wooden fence, next to a windmill.
  const tufts = [];
  const cols = 10, rows = 6;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    tufts.push([-15 + c * 0.5, 0.2, 14 + r * 0.6]);
  }
  const fenceX = -15.3, fenceZ = 14 - 0.3;
  const W = cols * 0.5, H = rows * 0.6;
  return (
    <group>
      {/* soil bed */}
      <mesh position={[fenceX + W / 2, 0.02, fenceZ + H / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W + 0.5, H + 0.5]} />
        <meshStandardMaterial color="#8f6b3a" roughness={0.95} />
      </mesh>
      {/* wheat tufts */}
      {tufts.map((p, i) => (
        <mesh key={i} position={p}>
          <coneGeometry args={[0.12, 0.35, 4]} />
          <meshStandardMaterial color="#f0c246" roughness={0.9} />
        </mesh>
      ))}
      {/* fence posts along the perimeter */}
      {Array.from({ length: cols + 1 }).map((_, i) => (
        <mesh key={`fN${i}`} position={[fenceX + i * 0.5, 0.35, fenceZ]}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
          <meshStandardMaterial color="#5a3a20" />
        </mesh>
      ))}
      {Array.from({ length: cols + 1 }).map((_, i) => (
        <mesh key={`fS${i}`} position={[fenceX + i * 0.5, 0.35, fenceZ + H]}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
          <meshStandardMaterial color="#5a3a20" />
        </mesh>
      ))}
      {/* windmill next to farm (matches reference) */}
      <FarmWindmill pos={[-16.5, 0, 14 + H / 2]} />
    </group>
  );
}

function FarmWindmill({ pos }) {
  const blades = useRef();
  useFrame((_, dt) => { if (blades.current) blades.current.rotation.z += dt * 0.35; });
  return (
    <group position={pos}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.7, 2.6, 12]} />
        <meshStandardMaterial color="#c1a074" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.9, 0]} castShadow>
        <coneGeometry args={[0.65, 0.8, 12]} />
        <meshStandardMaterial color="#294b8f" />
      </mesh>
      <group ref={blades} position={[0, 2.3, 0.5]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <boxGeometry args={[0.14, 1.8, 0.05]} />
            <meshStandardMaterial color="#f0e5cc" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Circus tents cluster near village (bottom-left in reference). */
function CircusTents() {
  const tents = [
    { pos: [10, 0.05, 10], color: '#c33', flip: '#f2eee5' },
    { pos: [11.8, 0.05, 11.5], color: '#294b8f', flip: '#f2eee5' },
    { pos: [9.2, 0.05, 12.2], color: '#c33', flip: '#f2eee5' },
    { pos: [11, 0.05, 9], color: '#294b8f', flip: '#f2eee5' },
  ];
  return (
    <group>
      {tents.map((t, i) => (
        <group key={i} position={t.pos}>
          {/* tent body — cone with striped ring approximated by two stacked cones */}
          <mesh position={[0, 0.6, 0]} castShadow>
            <coneGeometry args={[0.8, 1.2, 12]} />
            <meshStandardMaterial color={t.color} roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.3, 0]} castShadow>
            <coneGeometry args={[0.9, 0.6, 12]} />
            <meshStandardMaterial color={t.flip} roughness={0.75} />
          </mesh>
          {/* tent flag */}
          <mesh position={[0, 1.35, 0]}>
            <planeGeometry args={[0.18, 0.14]} />
            <meshStandardMaterial color="#FFD54A" emissive="#FFD54A" emissiveIntensity={0.4} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Round fountain plaza (right side of reference). */
function FountainPlaza() {
  return (
    <group position={[30, 0.05, 12]}>
      {/* stone plaza disc */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3, 32]} />
        <meshStandardMaterial color="#d8c9a0" roughness={0.9} />
      </mesh>
      {/* outer ring */}
      <mesh position={[0, 0.08, 0]}>
        <torusGeometry args={[2.5, 0.08, 8, 32]} />
        <meshStandardMaterial color="#a89880" roughness={0.9} />
      </mesh>
      {/* fountain basin */}
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.9, 1.0, 0.45, 24]} />
        <meshStandardMaterial color="#b8a680" roughness={0.9} />
      </mesh>
      {/* water */}
      <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.8, 24]} />
        <meshStandardMaterial color="#5cbde0" emissive="#5cbde0" emissiveIntensity={0.3} />
      </mesh>
      {/* central jet column */}
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.06, 0.09, 0.8, 8]} />
        <meshStandardMaterial color="#a5d9ec" emissive="#a5d9ec" emissiveIntensity={0.6} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

/** Distant emerald crystal castle atop the far mountain (top of reference). */
function DistantCrystalCastle() {
  const glow = useRef();
  useFrame((s) => {
    if (glow.current) glow.current.intensity = 3.5 + Math.sin(s.clock.elapsedTime * 1.2) * 0.6;
  });
  return (
    <group position={[70, 12, -20]} scale={1.6}>
      {/* rocky peak base */}
      <mesh position={[0, -3.5, 0]} castShadow>
        <coneGeometry args={[6, 7, 8]} />
        <meshStandardMaterial color="#6f7688" roughness={0.9} />
      </mesh>
      {/* emerald keep body */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[2.4, 3, 2.4]} />
        <meshStandardMaterial color="#1c8f6a" roughness={0.4} emissive="#0aa876" emissiveIntensity={0.35} />
      </mesh>
      {/* crystal spires */}
      {[[-1.2, 2.2, -1.2], [1.2, 2.2, -1.2], [-1.2, 2.2, 1.2], [1.2, 2.2, 1.2]].map((p, i) => (
        <mesh key={i} position={p} castShadow>
          <coneGeometry args={[0.35, 2.4, 6]} />
          <meshStandardMaterial color="#3ad8a2" emissive="#20e0a8" emissiveIntensity={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* central tall spire */}
      <mesh position={[0, 3.6, 0]} castShadow>
        <coneGeometry args={[0.55, 3.4, 6]} />
        <meshStandardMaterial color="#3ad8a2" emissive="#20e0a8" emissiveIntensity={0.9} roughness={0.25} />
      </mesh>
      {/* emerald aura */}
      <pointLight ref={glow} position={[0, 2, 0]} color="#20e0a8" intensity={3.5} distance={18} decay={2} />
    </group>
  );
}

