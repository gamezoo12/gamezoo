/**
 * ChunkManager — decides which world chunks are mounted right now.
 *
 * A chunk is a "zone" along the spline (t range) with its own set of GLB
 * asset placements. Only chunks near the champion should render. Adjacent
 * chunks are preloaded so a walk into the next zone doesn't stutter.
 *
 * Architecture:
 *   • Chunks are registered as { id, tRange:[a,b], Component, assetRefs }.
 *   • On every frame we read the champion's `t` and compute the "current"
 *     chunk index. We keep [current-1, current, current+1] mounted (up to
 *     `maxActiveChunks` from the perf policy).
 *   • Non-active chunks are unmounted so their GPU resources are freed by
 *     drei's cache eventually.
 *   • Adjacent chunks' assets are preloaded via `useGLTF.preload`.
 *
 * Phase B1 note: only CHUNK 1 is registered here — future chunks (2..5)
 * will slot into `CHUNKS` and everything else keeps working.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import Chunk1_Village from './Chunk1_Village';
import { CHUNK1_ASSET_REFS, CHUNK1_T_RANGE } from './chunk1_village';
import { preloadOptimizedRefs } from '../OptimizedEnvGLB';
import { getPerfPolicy } from '../perfPolicy';

// Ordered registry — chunks must be contiguous along the spline.
const CHUNKS = [
  {
    id: 'C1_village',
    tRange: CHUNK1_T_RANGE,
    Component: Chunk1_Village,
    assetRefs: CHUNK1_ASSET_REFS,
  },
];

// Kick off preloads for every chunk on mount so the first tour is smooth.
// (Phase B1: only chunk 1 → tiny preload.)
export function preloadAllChunkAssets() {
  CHUNKS.forEach((c) => preloadOptimizedRefs(c.assetRefs));
}
// NOTE: intentionally NOT called at module top-level. We let Suspense
// demand-load Chunk 1 (which is the visible chunk) and only preload
// neighbour chunks after we've entered a chunk. Eager preload of Chunk 1
// (~150MB) blocked the first paint on mobile.

function findChunkIndexForT(t) {
  for (let i = 0; i < CHUNKS.length; i++) {
    const [a, b] = CHUNKS[i].tRange;
    if (t >= a && t <= b) return i;
  }
  // Before chunk 0 → 0. After last chunk → last.
  if (t < CHUNKS[0].tRange[0]) return 0;
  return CHUNKS.length - 1;
}

/**
 * Reads champion `t` on every frame; when the champion crosses into a new
 * chunk, we update the mounted set. Adjacent chunks are always kept for
 * smooth transitions.
 */
export default function ChunkManager({ championRef, density = 1 }) {
  const policy = useMemo(() => getPerfPolicy(), []);
  const [activeIdx, setActiveIdx] = useState(0);
  const lastIdx = useRef(-1);

  useFrame(() => {
    const c = championRef?.current;
    if (!c || typeof c.getT !== 'function') return;
    const t = c.getT();
    const idx = findChunkIndexForT(t);
    if (idx !== lastIdx.current) {
      lastIdx.current = idx;
      setActiveIdx(idx);
    }
  });

  // Which chunks should be mounted right now?
  const activeIds = useMemo(() => {
    const set = new Set();
    const radius = Math.max(0, Math.floor((policy.maxActiveChunks - 1) / 2));
    // For Phase B1 only chunk 1 exists so this is a no-op in practice, but
    // it becomes real as chunks 2..5 land.
    for (let d = -radius; d <= radius; d++) {
      const i = activeIdx + d;
      if (i >= 0 && i < CHUNKS.length) set.add(CHUNKS[i].id);
    }
    // Always ensure the current chunk is included.
    set.add(CHUNKS[activeIdx].id);
    return set;
  }, [activeIdx, policy]);

  // When we're about to enter a chunk, preload its neighbours' assets.
  useEffect(() => {
    const next = CHUNKS[activeIdx + 1];
    if (next) preloadOptimizedRefs(next.assetRefs);
  }, [activeIdx]);

  return (
    <group>
      {CHUNKS.map((chunk) => {
        if (!activeIds.has(chunk.id)) return null;
        const Comp = chunk.Component;
        // Each chunk is Suspense-wrapped so a loading chunk doesn't blank the
        // rest of the scene.
        return (
          <Suspense key={chunk.id} fallback={null}>
            <Comp density={density * policy.vegetationDensity} />
          </Suspense>
        );
      })}
    </group>
  );
}

export { CHUNKS };
