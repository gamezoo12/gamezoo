/**
 * Terrain — deterministic rolling hills using a plane geometry deformed by
 * layered value-noise. Ground colour blends with slope + elevation so we get
 * a natural meadow → forest → rocky look without importing a heightmap.
 *
 * Kept CPU-cheap: geometry is generated once on mount, no per-frame work.
 */
import { useMemo } from 'react';
import * as THREE from 'three';

// Deterministic pseudo-noise (hash-based, no external dep)
function h2(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const a = h2(xi, zi), b = h2(xi + 1, zi), c = h2(xi, zi + 1), d = h2(xi + 1, zi + 1);
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, z) {
  let s = 0, amp = 1, freq = 0.08, norm = 0;
  for (let i = 0; i < 4; i++) {
    s += noise(x * freq, z * freq) * amp;
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return s / norm;
}

// Sample world elevation at any (x, z). Exported so Path / Champion / props
// can stay grounded.
export function sampleElevation(x, z) {
  // Along the path corridor (roughly z in [-6..12], x in [0..50]) keep it flat
  // enough for the road to feel readable.
  const base = fbm(x + 100, z + 100) * 4;
  return Math.max(0, base - 1.2);
}

export default function Terrain() {
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(140, 90, 220, 140);
    g.rotateX(-Math.PI / 2);
    g.translate(30, 0, 6);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const grass = new THREE.Color('#3e8f42');
    const forest = new THREE.Color('#1e6b32');
    const rock = new THREE.Color('#6f6a58');
    const sand = new THREE.Color('#d6b98a');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = sampleElevation(x, z);
      pos.setY(i, y);
      // colour by elevation + distance from path corridor
      const distFromRoad = Math.abs(z - 2);
      if (y > 3.2) c.copy(rock);
      else if (y > 1.8) c.lerpColors(forest, rock, (y - 1.8) / 1.4);
      else if (distFromRoad < 1.6) c.lerpColors(sand, grass, distFromRoad / 1.6);
      else c.lerpColors(grass, forest, Math.min(1, distFromRoad / 8));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geom} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </mesh>
  );
}
