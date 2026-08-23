/**
 * Chunk1_Village — assembles the Royal Village Entrance (Levels 1-2).
 *
 * Progressive-loading:
 *   HERO block is rendered immediately (Suspense-wrapped by ChunkManager).
 *   DECOR block is mounted 1200ms AFTER the hero finishes loading, using
 *   a lazy timer so it never blocks the first world frame.
 *
 * The two blocks share the same OptimizedEnvGLB loader — decor still
 * suspends its own tree, but only inside its own Suspense boundary so the
 * hero village stays visible during decor fetching.
 */
import { Suspense, useEffect, useState } from 'react';
import OptimizedEnvGLB, { preloadOptimizedRefs } from '../OptimizedEnvGLB';
import {
  CHUNK1_HERO_GATE, CHUNK1_HERO_HOUSES, CHUNK1_HERO_TREES,
  CHUNK1_DECOR_HOUSES, CHUNK1_DECOR_TREES, CHUNK1_DECOR_LANTERNS,
  CHUNK1_DECOR_PROPS, CHUNK1_DECOR_GROUND, CHUNK1_DECOR_REFS,
} from './chunk1_village';

function HeroBlock() {
  return (
    <group>
      <OptimizedEnvGLB
        category={CHUNK1_HERO_GATE.category}
        id={CHUNK1_HERO_GATE.id}
        position={CHUNK1_HERO_GATE.position}
        rotationY={CHUNK1_HERO_GATE.rotationY}
        scaleMultiplier={CHUNK1_HERO_GATE.scaleMultiplier}
      />
      {CHUNK1_HERO_HOUSES.map((h, i) => (
        <OptimizedEnvGLB key={`hh${i}`} category={h.category} id={h.id} instances={h.instances} />
      ))}
      {CHUNK1_HERO_TREES.map((t, i) => (
        <OptimizedEnvGLB key={`ht${i}`} category={t.category} id={t.id} instances={t.instances} />
      ))}
    </group>
  );
}

function DecorBlock({ density = 1 }) {
  const sliceVeg = (arr) => arr.slice(0, Math.max(1, Math.round(arr.length * density)));
  return (
    <group>
      {CHUNK1_DECOR_HOUSES.map((h, i) => (
        <OptimizedEnvGLB key={`dh${i}`} category={h.category} id={h.id} instances={h.instances} />
      ))}
      {CHUNK1_DECOR_TREES.map((t, i) => (
        <OptimizedEnvGLB key={`dt${i}`} category={t.category} id={t.id} instances={t.instances} />
      ))}
      {CHUNK1_DECOR_LANTERNS.map((l, i) => (
        <OptimizedEnvGLB key={`dl${i}`} category={l.category} id={l.id} instances={l.instances} />
      ))}
      {CHUNK1_DECOR_PROPS.map((p, i) => (
        <OptimizedEnvGLB key={`dp${i}`} category={p.category} id={p.id} instances={p.instances} />
      ))}
      {CHUNK1_DECOR_GROUND.map((g, i) => (
        <OptimizedEnvGLB key={`dg${i}`} category={g.category} id={g.id} instances={sliceVeg(g.instances)} />
      ))}
    </group>
  );
}

export default function Chunk1_Village({ density = 1 }) {
  const [showDecor, setShowDecor] = useState(false);

  // 1200ms after mount (i.e. after hero paints), kick off decoration.
  // Also prefetch decor GLBs on that same timer so the decoration reveal
  // doesn't stall the RAF loop.
  useEffect(() => {
    const t = setTimeout(() => {
      preloadOptimizedRefs(CHUNK1_DECOR_REFS);
      setShowDecor(true);
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <group>
      <HeroBlock />
      {showDecor && (
        <Suspense fallback={null}>
          <DecorBlock density={density} />
        </Suspense>
      )}
    </group>
  );
}
