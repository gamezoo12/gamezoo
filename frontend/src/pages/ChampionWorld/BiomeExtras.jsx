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
        <coneGeometry args={[0.45, 0.7, 4]} />
        <meshStandardMaterial color="#3a5a99" />
      </mesh>
      {/* right pillar */}
      <mesh position={[1.6, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 2.4, 0.6]} />
        <meshStandardMaterial color="#a89880" roughness={0.9} />
      </mesh>
      <mesh position={[1.6, 2.55, 0]} castShadow>
        <coneGeometry args={[0.45, 0.7, 4]} />
        <meshStandardMaterial color="#3a5a99" />
      </mesh>
      {/* top crossbeam */}
      <mesh position={[0, 2.4, 0]} castShadow>
        <boxGeometry args={[3.6, 0.35, 0.4]} />
        <meshStandardMaterial color="#948676" roughness={0.9} />
      </mesh>
      {/* shield emblem */}
      <mesh position={[0, 2.4, 0.22]}>
        <planeGeometry args={[0.6, 0.7]} />
        <meshStandardMaterial color="#3a5a99" />
      </mesh>
      <mesh position={[0, 2.4, 0.23]}>
        <ringGeometry args={[0.14, 0.22, 12]} />
        <meshStandardMaterial color="#FFD54A" emissive="#FFD54A" emissiveIntensity={0.5} />
      </mesh>
      {/* hanging banners */}
      {[-1.6, 1.6].map((x, i) => (
        <mesh key={i} position={[x, 1.6, 0.35]} castShadow>
          <planeGeometry args={[0.35, 1.0]} />
          <meshStandardMaterial color="#3a5a99" roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

export default function BiomeExtras() {
  return (
    <group>
      <EntryGate />
      <CherryBlossoms />
    </group>
  );
}
