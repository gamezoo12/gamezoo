/**
 * Particles — fireflies + butterflies. Cheap point-based motion, sinusoidal
 * paths keyed off deterministic seed so nothing is jittering the CPU.
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function seed(x) { const s = Math.sin(x * 91.7 + 3.14) * 43758.5453; return s - Math.floor(s); }

export default function Particles() {
  const fireflies = useRef();
  const butterflies = useRef();

  const F = 40, B = 18;

  const fireflyGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(F * 3);
    for (let i = 0; i < F; i++) { pos[i * 3] = 20 + seed(i) * 30; pos[i * 3 + 1] = 0.6 + seed(i + 1) * 3; pos[i * 3 + 2] = -6 + seed(i + 2) * 18; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  const butterflyGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(B * 3);
    for (let i = 0; i < B; i++) { pos[i * 3] = 5 + seed(i + 5) * 30; pos[i * 3 + 1] = 1.0 + seed(i + 6) * 1.5; pos[i * 3 + 2] = -2 + seed(i + 7) * 12; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (fireflies.current) {
      const p = fireflies.current.geometry.attributes.position;
      for (let i = 0; i < F; i++) {
        p.array[i * 3 + 1] = 0.6 + seed(i + 1) * 3 + Math.sin(t * 1.5 + i) * 0.4;
        p.array[i * 3] += Math.sin(t * 0.7 + i * 2) * 0.005;
      }
      p.needsUpdate = true;
    }
    if (butterflies.current) {
      const p = butterflies.current.geometry.attributes.position;
      for (let i = 0; i < B; i++) {
        p.array[i * 3 + 1] = 1.0 + seed(i + 6) * 1.5 + Math.sin(t * 2.4 + i) * 0.6;
        p.array[i * 3 + 2] += Math.cos(t * 0.9 + i) * 0.006;
      }
      p.needsUpdate = true;
    }
  });

  return (
    <group>
      <points ref={fireflies} geometry={fireflyGeom}>
        <pointsMaterial color="#FFD54A" size={0.14} sizeAttenuation transparent opacity={0.95} />
      </points>
      <points ref={butterflies} geometry={butterflyGeom}>
        <pointsMaterial color="#f472b6" size={0.18} sizeAttenuation transparent opacity={0.9} />
      </points>
    </group>
  );
}
