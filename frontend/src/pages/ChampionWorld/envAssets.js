/**
 * Environment asset registry.
 *
 * Same pattern as `avatars.js`: paste a GLB URL and the world picks it up.
 * Each entry is either `null` (falls back to the placeholder primitive
 * component still in the scene) or an object describing a loaded GLB.
 *
 * SCHEMA per entry:
 *   {
 *     url:      string,   // GLB URL (Meshy artifact URL or any CDN)
 *     scale:    number,   // uniform scale to bring to gameplay meters
 *     yOffset:  number,   // per-asset ground offset (feet on 0)
 *     rotY:     number,   // radians, base facing correction
 *     instances?: Array<{ x:number, z:number, rot?:number, scale?:number }>
 *              // when present the loader will instance the asset at these
 *              // positions along the world plane. Elevation is auto-sampled
 *              // from Terrain.
 *   }
 *
 * IMPORTANT — Championship 1 slot list (per user directive, iteration 49):
 *   castle, entryGate, house_A, house_B, house_C, bridge, windmill,
 *   marketTent, waterfall, spruceTree, cherryTree, ruinArch, watchtower,
 *   fountain, rocks, riverModule
 *
 * Pilot set (fill first — user-approved order): castle, entryGate, house_A,
 * bridge, cherryTree. The remaining slots stay null until pilot is approved.
 */

// ---------- Pilot set (5 assets user is generating first) ----------
// Paste the Meshy GLB URLs here as soon as they upload.
export const ENV_ASSETS = {
  castle: null,       // → { url: 'https://.../castle.glb', scale: 1.0, yOffset: 0, rotY: 0 }
  entryGate: null,    // → { url: '…', scale: 1.0, yOffset: 0, rotY: Math.PI }
  house_A: null,      // → { url: '…', scale: 1.0, yOffset: 0, rotY: 0,
                      //     instances: [{ x:14, z:-1, rot: 0.3 }, { x:16, z:-3, rot: -0.5 }] }
  bridge: null,       // → { url: '…', scale: 1.0, yOffset: 0.35, rotY: 0.15 }
  cherryTree: null,   // → { url: '…', scale: 1.0, yOffset: 0, rotY: 0,
                      //     instances: [/* 24 positions from BiomeExtras */] }

  // ---------- Full slot list — fill after pilot is approved ----------
  house_B: null,
  house_C: null,
  windmill: null,
  marketTent: null,
  waterfall: null,
  spruceTree: null,
  ruinArch: null,
  watchtower: null,
  fountain: null,
  rocks: null,
  riverModule: null,
};

/**
 * Single anchor for each unique (non-instanced) asset in Championship 1.
 * Feeds `<EnvGLB slot="castle" .../>` etc. Positions match the current
 * placeholder placements so the swap is seamless.
 */
export const ENV_ANCHORS = {
  castle:     { position: [44, 3.2, 6],   rotY: 0 },
  entryGate:  { position: [0, 0, 0],       rotY: 0 },
  bridge:     { position: [24, 0.4, 4],    rotY: 0.15 },
  windmill:   { position: [17, 0, 8],      rotY: 0 },
  waterfall:  { position: [36, 0, -3],     rotY: -0.4 },
  ruinArch:   { position: [30, 0, -6],     rotY: 0.2 },
  watchtower: { position: [38, 0, -8],     rotY: 0 },
  fountain:   { position: [30, 0, 12],     rotY: 0 },
};

/**
 * Instance-set positions for repeated assets. Reused deterministically each
 * mount so trees / houses / tents / rocks don't rearrange between renders.
 */
export const ENV_INSTANCES = {
  house_A: [
    { x: 14, z: -1, rot: 0.3, scale: 1.0 },
    { x: 18, z: 0, rot: -0.2, scale: 1.05 },
  ],
  house_B: [
    { x: 16, z: -3, rot: -0.5, scale: 1.1 },
    { x: 12, z: 1, rot: 0.9, scale: 0.9 },
  ],
  house_C: [
    { x: 14, z: 3, rot: 1.4, scale: 0.95 },
  ],
  marketTent: [
    { x: 10, z: 10, rot: 0.0, scale: 1.0 },
    { x: 11.8, z: 11.5, rot: 0.7, scale: 1.0 },
    { x: 9.2, z: 12.2, rot: -0.3, scale: 1.0 },
    { x: 11, z: 9, rot: 1.1, scale: 1.0 },
  ],
  cherryTree: [
    // 4 clusters × ~6 trees each — matches current BiomeExtras placement.
    { x: 13, z: 4, rot: 0.0, scale: 1.0 }, { x: 14, z: 5, rot: 1.0, scale: 0.95 }, { x: 15, z: 3, rot: 2.1, scale: 1.05 },
    { x: 20, z: 6, rot: 0.4, scale: 1.0 }, { x: 21, z: 7, rot: 2.7, scale: 1.05 }, { x: 22, z: 5, rot: 1.3, scale: 0.9 },
    { x: 40, z: 3, rot: 0.6, scale: 1.0 }, { x: 41, z: 5, rot: 3.0, scale: 1.05 }, { x: 42, z: 2, rot: 1.9, scale: 0.9 },
    { x: 46, z: 9, rot: 0.2, scale: 1.0 }, { x: 47, z: 10, rot: 2.4, scale: 0.95 },
  ],
  spruceTree: [
    // Populated at runtime — see `Vegetation.jsx` for the 130 seed positions.
    // When the spruce GLB is uploaded, we'll route those seeds through here.
  ],
  rocks: [],
};
