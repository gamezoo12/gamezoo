/**
 * Terrain — cinematic rolling landscape built at runtime from a single
 * displaced PlaneGeometry. No terrain GLBs are downloaded.
 *
 * Ground topology (championship 1 vertical slice):
 *   - Flat road corridor along the spline (kept walkable / no clipping)
 *   - Raised village plateau to both sides of the road at x ∈ [3..15]
 *   - Valley / river bed at x ∈ [20..30], z ∈ [3..7]
 *   - Distant mountain ring at |x| > 55 or |z| > 30 (up to ~24m)
 *   - Micro fbm noise everywhere for a hand-sculpted feel
 *
 * Vertex-coloured so we get natural meadow → forest → rock → snow bands
 * WITHOUT texture downloads.
 *
 * `sampleElevation(x, z)` is the authoritative height for grounding
 * roads, props and the champion. Callers must use it.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { PATH_CURVE } from './worldConfig';

// -- Deterministic value noise / fbm --------------------------------------
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
function fbm(x, z, oct = 4) {
  let s = 0, amp = 1, freq = 0.09, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += noise(x * freq, z * freq) * amp;
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return s / norm;
}

// -- Distance from the road spline (in XZ). Cached lookup table -----------
const ROAD_SAMPLES = 240;
const _roadCache = [];
for (let i = 0; i < ROAD_SAMPLES; i++) {
  const t = i / (ROAD_SAMPLES - 1);
  const p = PATH_CURVE.getPointAt(t);
  _roadCache.push([p.x, p.z]);
}
function distFromRoad(x, z) {
  let best = 1e9;
  for (let i = 0; i < ROAD_SAMPLES; i++) {
    const dx = x - _roadCache[i][0], dz = z - _roadCache[i][1];
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// -- Region masks (0..1, smooth) ------------------------------------------
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function villagePlateau(x, z) {
  // Raised ground on both sides of the road for the village to sit on.
  const inX = smoothstep(2, 4, x) - smoothstep(14, 16, x);
  const inZ = smoothstep(-8, -3, z) * smoothstep(8, 3, z);
  return Math.max(0, inX) * Math.max(0, inZ);
}
function riverValley(x, z) {
  // Long depression that curves under the road further along the spline.
  const inX = smoothstep(18, 22, x) - smoothstep(30, 34, x);
  const inZ = smoothstep(1, 4, z) * smoothstep(9, 5, z);
  return Math.max(0, inX) * Math.max(0, inZ);
}
function mountainRing(x, z) {
  // Distance from world centre → grow high mountains only far away.
  const dx = Math.max(0, Math.abs(x - 25) - 45);
  const dz = Math.max(0, Math.abs(z - 0) - 22);
  const d = Math.sqrt(dx * dx + dz * dz);
  return smoothstep(0, 20, d);
}

export function sampleElevation(x, z) {
  // Road corridor: keep near-flat so the road ribbon reads cleanly.
  const road = distFromRoad(x, z);
  const roadFlat = smoothstep(3.0, 6.0, road);       // 1.0 far, 0.0 on road

  const base    = (fbm(x + 100, z + 100) - 0.4) * 3.2 * roadFlat;
  const plateau = villagePlateau(x, z) * 1.5;         // raise village by up to 1.5m
  const river   = -riverValley(x, z) * 1.8;           // dip up to 1.8m under water
  const mnt     = mountainRing(x, z) * 24;            // distant peaks

  return base + plateau + river + mnt;
}

export default function Terrain() {
  const geom = useMemo(() => {
    // 200 × 160 world plane. Segment count balances hill readability vs
    // headless-WebGL rasterization cost. 180×120 = 21k verts is comfortable
    // for CPU-WebGL and still gives smooth silhouettes.
    const g = new THREE.PlaneGeometry(200, 160, 180, 120);
    g.rotateX(-Math.PI / 2);
    g.translate(30, 0, 0);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const road    = new THREE.Color('#d1b382');   // sandy road shoulders
    const meadow  = new THREE.Color('#5eb055');   // fresh grass
    const grass2  = new THREE.Color('#3f8e46');   // deeper grass
    const forest  = new THREE.Color('#2a6a34');   // forest floor
    const rock    = new THREE.Color('#7a6f5c');   // exposed rock
    const rockDk  = new THREE.Color('#54493e');   // shaded rock
    const snow    = new THREE.Color('#f4f2ea');   // snow caps

    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = sampleElevation(x, z);
      pos.setY(i, y);

      const drd  = distFromRoad(x, z);
      const mtn  = mountainRing(x, z);   // 0..1

      // ---- colour bands ---------------------------------------------------
      if (mtn > 0.15) {
        // Mountain zone: rock → snow with elevation
        const alt = smoothstep(6, 20, y);
        c.lerpColors(rockDk, rock, 0.5);
        c.lerp(snow, alt);
      } else if (y < -0.6) {
        // River bed
        c.copy(road);
      } else if (drd < 1.9) {
        // Directly beside road — sandy shoulder
        c.lerpColors(road, meadow, smoothstep(0.8, 1.9, drd));
      } else if (y > 3.0) {
        // Hilltop rocks
        c.lerpColors(rock, rockDk, 0.5);
      } else if (drd < 8) {
        // Meadow zone around village
        c.lerpColors(meadow, grass2, smoothstep(2, 8, drd));
      } else {
        // Outer forest ring
        c.lerpColors(grass2, forest, smoothstep(8, 22, drd));
      }
      // Slight noise-based mottling
      const mott = (fbm(x + 500, z + 500, 3) - 0.5) * 0.14;
      c.offsetHSL(0, 0, mott);

      colors[i * 3]     = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
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
