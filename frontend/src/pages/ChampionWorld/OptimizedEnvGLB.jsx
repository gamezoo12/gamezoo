/**
 * OptimizedEnvGLB — renderer for a Meshy AI GLB from the production
 * `world3dOptimizedRegistry.js`.
 *
 * Responsibilities:
 *   1. Resolve an asset by (category, id) — never a hardcoded path.
 *   2. Clone the scene via SkeletonUtils (safe against drei's shared cache).
 *   3. Enable shadows + envMapIntensity — never overrides materials/colours.
 *   4. Auto-normalize wildly-varying Meshy asset sizes to a canonical size
 *      per "family" (house, tree, gate, prop, ...). Result: no more houses
 *      the size of castles or trees the size of shrubs.
 *   5. Ground-clamp using terrain elevation so props stand on the ground.
 *
 * Two rendering modes:
 *   <OptimizedEnvGLB category="gate" id="kingdom_entrance_gate"
 *                    position={[x,y,z]} rotationY={0} scaleMultiplier={1} />
 *   <OptimizedEnvGLB category="house" id="village_cottage" instances={[
 *      { x, z, rotY?, scale? }, ...
 *   ]} />
 *
 * Caveats:
 *   • Uses `useGLTF` under the hood — MUST be wrapped in <Suspense/>.
 *   • Materials are LEFT UNTOUCHED. We only mutate presentation flags.
 */
import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';
import { getOptimizedWorld3dAsset } from '@/world/assets/world3dOptimizedRegistry.js';
import { sampleElevation } from './Terrain';

/**
 * Canonical target sizes (largest axis, in world meters). We normalize to
 * these so a Meshy tree that exports at 200 units and a Meshy tree that
 * exports at 3 units both end up ~3.5m tall in-world.
 *
 * These numbers are hand-picked for a semi-stylised fantasy scale where
 * the champion is ~1.7m tall.
 */
const CANONICAL_SIZE = {
  gate: 6.5,
  castle: 14.0,
  house: 3.4,         // ~2× champion height — reads as home, not manor
  bridge: 5.0,
  windmill: 6.5,
  watchtower: 6.5,
  waterfall: 6.0,
  garden: 4.0,
  tree: 5.5,          // 3× champion → real tree canopy
  vegetation: 0.9,
  nature: 3.0,
  prop: 1.2,
  rock: 2.5,
  ruins: 4.0,
  road: 2.0,
  unclassified: 2.0,
};

// Cache: url -> { normalizeScale, yOffset } so we compute once per asset.
const NORMALIZED_CACHE = new Map();

function analyzeAsset(scene, category) {
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const largestAxis = Math.max(size.x, size.y, size.z, 0.0001);
  const target = CANONICAL_SIZE[category] ?? 2.0;
  const normalizeScale = target / largestAxis;
  // Lift so the bounding box min-y is at 0 after normalization.
  const yOffset = -box.min.y * normalizeScale;
  return { normalizeScale, yOffset };
}

function prepareSceneMeshes(scene) {
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material) {
        // Keep Meshy PBR/textures verbatim. Only tune presentation.
        if ('envMapIntensity' in o.material) o.material.envMapIntensity = 0.85;
        // Hair / thin foliage often has BackSide. Force DoubleSide for foliage.
        if (/leaf|foliage|hair|flower|petal|grass/i.test(o.name)) {
          o.material.side = THREE.DoubleSide;
          o.material.transparent = o.material.transparent || false;
        }
      }
    }
  });
}

export default function OptimizedEnvGLB(props) {
  const { category, id } = props;
  const asset = getOptimizedWorld3dAsset(category, id);
  if (!asset || !asset.enabled) {
    // Silent: the world stays intact even if one asset is missing.
    return null;
  }
  return props.instances && props.instances.length > 0
    ? <InstancedEnv asset={asset} category={category} {...props} />
    : <SingleEnv asset={asset} category={category} {...props} />;
}

function useNormalized(asset, category) {
  const gltf = useGLTF(asset.path);
  return useMemo(() => {
    // Use a probe clone so measurement doesn't disturb the live scene.
    const cached = NORMALIZED_CACHE.get(asset.path);
    if (cached) return { gltf, ...cached };
    const probe = SkeletonUtils.clone(gltf.scene);
    const info = analyzeAsset(probe, category);
    NORMALIZED_CACHE.set(asset.path, info);
    return { gltf, ...info };
  }, [gltf, asset.path, category]);
}

function SingleEnv({ asset, category, position = [0, 0, 0], rotationY = 0, scaleMultiplier = 1, groundClamp = true, extraYOffset = 0 }) {
  const { gltf, normalizeScale, yOffset } = useNormalized(asset, category);
  const scene = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  useEffect(() => { prepareSceneMeshes(scene); }, [scene]);

  const [x, y, z] = position;
  const groundY = groundClamp ? sampleElevation(x, z) : y;
  const finalScale = normalizeScale * scaleMultiplier;

  return (
    <primitive
      object={scene}
      position={[x, groundY + yOffset * scaleMultiplier + extraYOffset, z]}
      rotation={[0, rotationY, 0]}
      scale={finalScale}
    />
  );
}

function InstancedEnv({ asset, category, instances, scaleMultiplier = 1, groundClamp = true, extraYOffset = 0 }) {
  const { gltf, normalizeScale, yOffset } = useNormalized(asset, category);
  // Clone once per instance — instances number is small (<30 per asset) so
  // this is affordable. Move to InstancedMesh only for very-large fills.
  const scenes = useMemo(
    () => instances.map(() => SkeletonUtils.clone(gltf.scene)),
    [gltf.scene, instances.length],
  );
  useEffect(() => { scenes.forEach(prepareSceneMeshes); }, [scenes]);

  return (
    <group>
      {instances.map((inst, i) => {
        const groundY = groundClamp ? sampleElevation(inst.x, inst.z) : (inst.y ?? 0);
        const s = normalizeScale * scaleMultiplier * (inst.scale ?? 1);
        return (
          <primitive
            key={i}
            object={scenes[i]}
            position={[inst.x, groundY + yOffset * (inst.scale ?? 1) * scaleMultiplier + extraYOffset, inst.z]}
            rotation={[0, inst.rotY ?? 0, 0]}
            scale={s}
          />
        );
      })}
    </group>
  );
}

/** Preload a list of `{ category, id }` refs so the next chunk is ready. */
export function preloadOptimizedRefs(refs) {
  refs.forEach(({ category, id }) => {
    const a = getOptimizedWorld3dAsset(category, id);
    if (a?.path) useGLTF.preload(a.path);
  });
}
