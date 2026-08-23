/**
 * Chunk 1 — Kingdom Entrance & Royal Village (Levels 1–2 area).
 *
 * Design intent: assets AVOID the road corridor (z ∈ [-2..2]) so the
 * camera view down the road is never blocked. Houses sit on the raised
 * village plateau (built in Terrain.jsx). Trees ring the plateau on the
 * outer band. The Gate sits at the entrance to Championship 1, at the
 * very start of the spline where the champion enters.
 *
 * Progressive loading:
 *   HERO  — Gate + 1 village cottage + 1 hero tree (≈13 MB)
 *   DECOR — 1 extra cottage + 1 extra tree species + lanterns/fence/bench
 *           + grass — mounted 1200ms after hero paints.
 *
 * Everything auto-normalised to canonical sizes by OptimizedEnvGLB.
 */

/* -----------------------  HERO (Stage 2 ≈ 13 MB)  --------------------------
   Gate is the single hero landmark players cross on entry, so it stays.
   Village cottage is reused twice for the "first houses" the player passes.
   One cherry-blossom tree is instanced 5 times with rotation/scale variance.
 * -------------------------------------------------------------------------- */

// The Kingdom Gate sits BEFORE Level 1 as the entry portal. It's pulled
// back well behind the champion's spawn (t=0.055) so the camera's tail
// stays clear of it and it becomes an "arrival" landmark in the rear-view
// rather than a wall blocking the forward composition.
export const CHUNK1_HERO_GATE = {
  category: 'gate',
  id: 'kingdom_entrance_gate',       // 4.93 MB
  position: [-4.5, 0, 1.5],
  rotationY: Math.PI * 0.5,
  scaleMultiplier: 1.05,
};

// Hero village cottages — placed on the raised plateau WELL OFF the road
// (z ≈ ±8) so they never dominate the camera corridor. Slight rotation
// variance so the row doesn't read as duplicated.
export const CHUNK1_HERO_HOUSES = [
  {
    category: 'house',
    id: 'village_cottage',           // 5.04 MB (normalized to 3.4m tall)
    instances: [
      { x:  8.0, z: -9.0, rotY:  0.5, scale: 1.00 },
      { x:  6.5, z:  9.0, rotY: -1.9, scale: 0.95 },
    ],
  },
];

// Hero tree — cherry blossom, instanced 5x with variance. Placed on the
// outer band of the plateau (z ≈ ±5..7) so they frame the composition
// WITHOUT choking the road.
export const CHUNK1_HERO_TREES = [
  {
    category: 'tree',
    id: 'meshy_ai_tree_cherry_blossom_0823014438_image_to_3d_texture',  // 10.38 MB
    instances: [
      { x:  3.5, z:  5.5, rotY: 0.3,  scale: 1.05 },
      { x: 11.0, z:  6.5, rotY: 2.1,  scale: 0.95 },
      { x:  4.5, z: -5.5, rotY: 0.9,  scale: 1.00 },
      { x: 12.5, z: -6.0, rotY: 2.4,  scale: 0.90 },
      { x: 16.0, z:  6.0, rotY: 1.4,  scale: 1.10 },
    ],
  },
];

export const CHUNK1_HERO_REFS = [
  { category: CHUNK1_HERO_GATE.category, id: CHUNK1_HERO_GATE.id },
  ...CHUNK1_HERO_HOUSES.map(({ category, id }) => ({ category, id })),
  ...CHUNK1_HERO_TREES.map(({ category, id }) => ({ category, id })),
];

/* --------------------  DECORATION (Stage 3 — deferred)  --------------------- */

// A second cottage silhouette so the village doesn't feel like one house.
export const CHUNK1_DECOR_HOUSES = [
  {
    category: 'house',
    id: 'meshy_ai_village_house_0822232640_image_to_3d_texture',    // 7.32 MB
    instances: [
      { x: 10.0, z: -5.8, rotY: -0.35, scale: 1.00 },
      { x:  8.0, z:  6.0, rotY:  2.50, scale: 1.00 },
    ],
  },
];

// Second tree species (broadleaf) to break the cherry-only canopy.
export const CHUNK1_DECOR_TREES = [
  {
    category: 'tree',
    id: 'meshy_ai_tree_broadleaf_b_0823015514_image_to_3d_texture',  // 10.91 MB
    instances: [
      { x:  1.5, z: -4.5, rotY: 3.0,  scale: 1.10 },
      { x: 12.5, z: -7.0, rotY: 1.2,  scale: 1.05 },
      { x: 12.0, z:  8.0, rotY: 0.4,  scale: 1.00 },
    ],
  },
];

// Street lanterns flanking the road at gentle intervals — pushed off-road.
export const CHUNK1_DECOR_LANTERNS = [
  {
    category: 'prop',
    id: 'royal_street_lantern_a',                                    // 0.99 MB
    instances: [
      { x:  0.5, z: -2.4, rotY: 0.2 },
      { x:  6.5, z: -2.4, rotY: 0.4 },
      { x: 11.5, z: -1.2, rotY: 1.0 },
      { x:  0.5, z:  2.4, rotY: 3.4 },
      { x:  6.5, z:  2.6, rotY: 3.6 },
    ],
  },
];

export const CHUNK1_DECOR_PROPS = [
  {
    category: 'prop',
    id: 'wooden_bench_a',                                            // 1.27 MB
    instances: [
      { x:  4.5, z: -2.6, rotY: 0.2, scale: 1.0 },
      { x: 10.0, z:  2.8, rotY: 3.4, scale: 1.0 },
    ],
  },
  {
    category: 'prop',
    id: 'wooden_fence_a',                                            // 1.53 MB
    instances: [
      // Village-side fencing off the road, curves slightly
      { x:  3.5, z: -3.4, rotY: 0.0 },
      { x:  4.1, z: -3.5, rotY: 0.0 },
      { x:  4.7, z: -3.6, rotY: 0.0 },
      { x:  5.3, z: -3.7, rotY: 0.0 },
      { x:  3.5, z:  3.6, rotY: Math.PI },
      { x:  4.1, z:  3.7, rotY: Math.PI },
      { x:  4.7, z:  3.8, rotY: Math.PI },
      { x:  5.3, z:  3.9, rotY: Math.PI },
    ],
  },
];

// Ground cover — grass clusters sprinkled between road and village.
export const CHUNK1_DECOR_GROUND = [
  {
    category: 'vegetation',
    id: 'meshy_ai_grass_cluster_a_0823021137_image_to_3d_texture',   // 2.28 MB
    instances: [
      { x: 2.0, z: -3.0, rotY: 0.1 }, { x: 4.5, z: -3.2, rotY: 0.4 },
      { x: 7.0, z: -3.0, rotY: 0.8 }, { x: 9.5, z: -3.1, rotY: 1.2 },
      { x: 11.5, z: -3.0, rotY: 1.6 },
      { x: 3.0, z:  3.1, rotY: 3.1 }, { x: 5.5, z:  3.3, rotY: 3.4 },
      { x: 7.8, z:  3.4, rotY: 3.7 }, { x: 10.2, z: 3.3, rotY: 4.0 },
    ],
  },
];

export const CHUNK1_DECOR_REFS = [
  ...CHUNK1_DECOR_HOUSES.map(({ category, id }) => ({ category, id })),
  ...CHUNK1_DECOR_TREES.map(({ category, id }) => ({ category, id })),
  ...CHUNK1_DECOR_LANTERNS.map(({ category, id }) => ({ category, id })),
  ...CHUNK1_DECOR_PROPS.map(({ category, id }) => ({ category, id })),
  ...CHUNK1_DECOR_GROUND.map(({ category, id }) => ({ category, id })),
];

export const CHUNK1_ASSET_REFS = [...CHUNK1_HERO_REFS, ...CHUNK1_DECOR_REFS];

// Chunk covers Levels 1-2 → t=[0.00, 0.18]
export const CHUNK1_T_RANGE = [0.00, 0.18];
