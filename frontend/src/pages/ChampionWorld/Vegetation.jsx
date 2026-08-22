/**
 * Vegetation — instanced trees, rocks, grass tufts. Single draw call per
 * asset type keeps the world premium AND cheap. Positions are deterministic
 * (seeded hash) so the world looks identical across renders.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleElevation } from './Terrain';

function seed(x) { const s = Math.sin(x * 43.13 + 17) * 43758.5453; return s - Math.floor(s); }

// Stylized tree = brown trunk + 3 stacked green cones. Two variants for
// visual variety (spruce = tall, oak = round).
function useTreeGeoms() {
  return useMemo(() => {
    const trunkG = new THREE.CylinderGeometry(0.09, 0.14, 0.9, 6);
    trunkG.translate(0, 0.45, 0);
    const spruceG = new THREE.BufferGeometry();
    { // build a merged cone stack manually
      const g1 = new THREE.ConeGeometry(0.55, 1.0, 8); g1.translate(0, 1.2, 0);
      const g2 = new THREE.ConeGeometry(0.45, 0.8, 8); g2.translate(0, 1.7, 0);
      const g3 = new THREE.ConeGeometry(0.32, 0.6, 8); g3.translate(0, 2.15, 0);
      const merged = mergeGeometries([g1, g2, g3]);
      spruceG.copy(merged);
    }
    const oakG = new THREE.SphereGeometry(0.7, 10, 8);
    oakG.translate(0, 1.4, 0);
    oakG.scale(1, 0.9, 1);
    return { trunkG, spruceG, oakG };
  }, []);
}

// Simple merge helper (BufferGeometryUtils is optional in three)
function mergeGeometries(list) {
  const total = list.reduce((s, g) => s + g.attributes.position.count, 0);
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  let offset = 0;
  for (const g of list) {
    positions.set(g.attributes.position.array, offset * 3);
    normals.set(g.attributes.normal.array, offset * 3);
    offset += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return out;
}

const TREE_COUNT = 130;
const ROCK_COUNT = 40;
const GRASS_COUNT = 300;

export default function Vegetation() {
  const { trunkG, spruceG, oakG } = useTreeGeoms();
  const trunkRef = useRef(); const spruceRef = useRef(); const oakRef = useRef();
  const rockRef = useRef(); const grassRef = useRef();

  const trees = useMemo(() => {
    const arr = [];
    for (let i = 0; i < TREE_COUNT; i++) {
      const angle = seed(i * 1.1) * Math.PI * 2;
      const r = 8 + seed(i * 2.3) * 32;
      const x = 24 + Math.cos(angle) * r;
      const z = 4 + Math.sin(angle) * r * 0.6;
      // avoid road corridor
      if (Math.abs(z - 2) < 2.5 && x > 0 && x < 50) continue;
      const y = sampleElevation(x, z);
      const isSpruce = seed(i * 4.7) > 0.35;
      const s = 0.9 + seed(i * 3.3) * 0.9;
      arr.push({ x, y, z, s, rot: seed(i * 7.1) * Math.PI * 2, isSpruce });
    }
    return arr;
  }, []);

  const rocks = useMemo(() => Array.from({ length: ROCK_COUNT }, (_, i) => {
    const angle = seed(i * 5.3) * Math.PI * 2;
    const r = 6 + seed(i * 1.7) * 34;
    const x = 24 + Math.cos(angle) * r;
    const z = 4 + Math.sin(angle) * r * 0.7;
    return { x, y: sampleElevation(x, z), z, s: 0.3 + seed(i * 3.1) * 0.7, rot: seed(i) * Math.PI };
  }), []);

  const grass = useMemo(() => Array.from({ length: GRASS_COUNT }, (_, i) => {
    const angle = seed(i * 0.7) * Math.PI * 2;
    const r = 3 + seed(i * 2.9) * 22;
    const x = 24 + Math.cos(angle) * r;
    const z = 4 + Math.sin(angle) * r * 0.6;
    return { x, y: sampleElevation(x, z), z, s: 0.15 + seed(i * 5.1) * 0.25 };
  }), []);

  // Populate instances once
  useMemo(() => {
    const m = new THREE.Matrix4();
    trees.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, t.y, t.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot),
        new THREE.Vector3(t.s, t.s * 1.1, t.s));
      if (trunkRef.current) trunkRef.current.setMatrixAt(i, m);
      if (t.isSpruce && spruceRef.current) spruceRef.current.setMatrixAt(i, m);
      if (!t.isSpruce && oakRef.current) oakRef.current.setMatrixAt(i, m);
    });
    if (trunkRef.current) trunkRef.current.instanceMatrix.needsUpdate = true;
    if (spruceRef.current) spruceRef.current.instanceMatrix.needsUpdate = true;
    if (oakRef.current) oakRef.current.instanceMatrix.needsUpdate = true;

    rocks.forEach((r, i) => {
      m.compose(new THREE.Vector3(r.x, r.y, r.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.rot),
        new THREE.Vector3(r.s, r.s * 0.7, r.s));
      if (rockRef.current) rockRef.current.setMatrixAt(i, m);
    });
    if (rockRef.current) rockRef.current.instanceMatrix.needsUpdate = true;

    grass.forEach((g, i) => {
      m.compose(new THREE.Vector3(g.x, g.y, g.z),
        new THREE.Quaternion(),
        new THREE.Vector3(g.s, g.s * 1.5, g.s));
      if (grassRef.current) grassRef.current.setMatrixAt(i, m);
    });
    if (grassRef.current) grassRef.current.instanceMatrix.needsUpdate = true;
  }, [trees, rocks, grass]);

  // Gentle sway on trees (single uniform rotation, not per-instance)
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const sway = Math.sin(t * 0.7) * 0.02;
    if (spruceRef.current) spruceRef.current.rotation.z = sway;
    if (oakRef.current) oakRef.current.rotation.z = sway;
  });

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[trunkG, undefined, TREE_COUNT]} castShadow>
        <meshStandardMaterial color="#5a3a20" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={spruceRef} args={[spruceG, undefined, TREE_COUNT]} castShadow>
        <meshStandardMaterial color="#2a5f2a" roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={oakRef} args={[oakG, undefined, TREE_COUNT]} castShadow>
        <meshStandardMaterial color="#3d8f3d" roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={rockRef} args={[undefined, undefined, ROCK_COUNT]} castShadow>
        <dodecahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color="#7a7368" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={grassRef} args={[undefined, undefined, GRASS_COUNT]}>
        <coneGeometry args={[0.18, 0.4, 4]} />
        <meshStandardMaterial color="#4a9040" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
