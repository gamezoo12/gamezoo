/**
 * EnvGLB — generic environment asset loader driven by the `ENV_ASSETS`
 * registry. Handles two modes:
 *
 *   <EnvGLB slot="castle" />                 // single anchor from ENV_ANCHORS
 *   <EnvGLB slot="cherryTree" instanced />   // instanced from ENV_INSTANCES
 *
 * When the registry entry is `null`, this component renders NOTHING and the
 * scene's existing placeholder primitive keeps rendering — so removing a
 * placeholder in favour of a Meshy GLB is a two-line edit:
 *   1) paste the URL into `envAssets.js`
 *   2) delete the primitive import in Scene.jsx
 *
 * Materials are preserved verbatim (same policy as GLTFChampion) — we only
 * enable shadow flags and set envMapIntensity.
 */
import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';
import { ENV_ASSETS, ENV_ANCHORS, ENV_INSTANCES } from './envAssets';
import { sampleElevation } from './Terrain';

function prepareScene(scene) {
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material && 'envMapIntensity' in o.material) {
        o.material.envMapIntensity = 0.85;
      }
    }
  });
}

export default function EnvGLB({ slot, instanced = false }) {
  const entry = ENV_ASSETS[slot];
  if (!entry) return null;

  // Hooks below MUST be called unconditionally, so we short-circuit only
  // BEFORE any hook. Fine — the early return above guarantees it.
  return instanced
    ? <InstancedEnv entry={entry} slot={slot} />
    : <SingleEnv entry={entry} slot={slot} />;
}

function SingleEnv({ entry, slot }) {
  const gltf = useGLTF(entry.url);
  const scene = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  useEffect(() => { prepareScene(scene); }, [scene]);

  const anchor = ENV_ANCHORS[slot] || { position: [0, 0, 0], rotY: 0 };
  const [x, y, z] = anchor.position;
  const groundY = y > 0 ? y : sampleElevation(x, z);
  return (
    <primitive
      object={scene}
      position={[x, groundY + (entry.yOffset || 0), z]}
      rotation={[0, (anchor.rotY || 0) + (entry.rotY || 0), 0]}
      scale={entry.scale || 1}
    />
  );
}

function InstancedEnv({ entry, slot }) {
  const gltf = useGLTF(entry.url);
  const list = entry.instances || ENV_INSTANCES[slot] || [];
  // We clone the scene once per instance so materials & animations can be
  // per-instance customised later. For static props this is O(instances)
  // memory — cheap at ~10-30 items. Move to InstancedMesh for 100+.
  const scenes = useMemo(
    () => list.map(() => SkeletonUtils.clone(gltf.scene)),
    [gltf.scene, list.length],
  );
  useEffect(() => { scenes.forEach(prepareScene); }, [scenes]);

  return (
    <group>
      {list.map((inst, i) => (
        <primitive
          key={`${slot}-${i}`}
          object={scenes[i]}
          position={[inst.x, sampleElevation(inst.x, inst.z) + (entry.yOffset || 0), inst.z]}
          rotation={[0, (inst.rot || 0) + (entry.rotY || 0), 0]}
          scale={(inst.scale || 1) * (entry.scale || 1)}
        />
      ))}
    </group>
  );
}

// Preload as URLs arrive. Called from Scene.jsx once at mount.
export function preloadEnvAssets() {
  Object.values(ENV_ASSETS).forEach((e) => { if (e?.url) useGLTF.preload(e.url); });
}
