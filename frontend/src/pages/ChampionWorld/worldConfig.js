/**
 * Champion World — world/level configuration.
 *
 * The path is a 3D spline the champion walks along; Level nodes ride on the
 * path at fixed normalized `t` values. Championship 1 = t in [0..0.62],
 * Castle 1 sits at t=0.65, then the road continues into Championship 2 (t up
 * to 1.0) which fades into mystery fog for the "next region" tease.
 *
 * IMPORTANT: Level state fields (locked/current/completed/…) here are DEMO
 * only — production wiring will pull authoritative state from the backend.
 */
import * as THREE from 'three';

// Spline control points — hand-tuned for a scenic winding route through the
// Wonderland. Y is elevation, XZ is the ground plane. The path climbs, dips
// through a valley (where the river/bridge sit), then rises to the castle.
export const PATH_POINTS = [
  [0,   0.1, 0],
  [4,   0.2, -3],
  [8,   0.6, -6],
  [12,  1.2, -3],
  [16,  1.5, 2],
  [20,  1.1, 6],   // level 5 area
  [24,  0.6, 4],   // dip into valley (river / bridge)
  [28,  0.4, -2],
  [32,  0.9, -6],
  [36,  1.8, -4],
  [40,  2.6, 1],   // approach to castle
  [44,  3.2, 6],   // Castle 1 plateau
  [48,  3.0, 10],  // road exits toward C2
  [54,  2.4, 14],  // Championship 2 mystery zone
  [62,  2.0, 18],
];

export const PATH_CURVE = new THREE.CatmullRomCurve3(
  PATH_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  false,
  'catmullrom',
  0.5,
);

// 10 Level nodes distributed along Championship 1 range.
export const LEVELS = Array.from({ length: 10 }, (_, i) => ({
  id: `L${i + 1}`,
  number: i + 1,
  // Levels 1..10 sit on t=0.03..0.60 evenly, leaving space for castle at 0.65
  t: 0.03 + (i * (0.60 - 0.03)) / 9,
  status:
    i < 3 ? 'completed'
    : i === 3 ? 'current'
    : i < 6 ? 'available'
    : 'locked',
  attemptsRemaining: i < 3 ? 0 : 3,
}));

// Castle checkpoint 1
export const CASTLE_1 = {
  id: 'C1',
  championshipNumber: 1,
  t: 0.65,
  unlockMode: 'auto',
  isUnlocked: true,
  prize: {
    status: 'revealed',
    title: 'Golden Trophy',
    // Placeholder amount — real values come from admin/backend, never frontend.
    amount: null,
    currency: null,
    description: 'The first Champion of Wonderland',
  },
};

// Championship 2 entrance (locked demo). Path continues visibly toward it.
export const CASTLE_2 = {
  id: 'C2',
  championshipNumber: 2,
  t: 0.92,
  unlockMode: 'manual',
  isUnlocked: false,
  prize: { status: 'coming_soon', title: '???' },
};

// Village houses — instanced positions off-path in a natural cluster.
export const VILLAGE_HOUSES = [
  { x: 14, z: -1, r: 0.3, scale: 1.0, roof: '#c1443a' },
  { x: 16, z: -3, r: -0.5, scale: 1.1, roof: '#8f5b32' },
  { x: 12, z: 1, r: 0.9, scale: 0.9, roof: '#6b7f4a' },
  { x: 18, z: 0, r: -0.2, scale: 1.05, roof: '#c1443a' },
  { x: 14, z: 3, r: 1.4, scale: 0.95, roof: '#836b3a' },
];

// Forest tree seed positions — will be jittered per-frame using deterministic
// hashing so the world stays consistent across re-renders / camera views.
export const FOREST_SEEDS = [
  ...Array.from({ length: 40 }, (_, i) => ({ zone: 'A', i })),  // meadow
  ...Array.from({ length: 60 }, (_, i) => ({ zone: 'B', i })),  // deep forest
  ...Array.from({ length: 30 }, (_, i) => ({ zone: 'C', i })),  // mountain slope
];

// Camera framing per breakpoint. Bigger `distance` = more scenery visible.
export const CAMERA_PRESETS = {
  mobile:  { distance: 7.5, height: 4.0, fov: 55 },
  tablet:  { distance: 9.5, height: 4.5, fov: 50 },
  desktop: { distance: 12.0, height: 5.5, fov: 45 },
};
