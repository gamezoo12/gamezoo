/**
 * GLTFChampion — the "real" Champion that loads a user-provided GLB, binds
 * a second GLB of animations to its skeleton, and drives them through the
 * same imperative API the world engine already speaks to:
 *
 *   setAction('idle'|'walk'|'run'|'arrive'|'wave'|'victory'|'championship-victory'|'defeat')
 *   walkTo(t) / runTo(t) / getT() / getWorldPos()
 *
 * Preservation contract (per spec):
 *   • Do NOT override materials/colours/faces/hair.
 *   • Only mutate presentation flags — castShadow, receiveShadow,
 *     envMapIntensity, tone mapping is set at renderer level upstream.
 *   • Preserve original proportions — scale is a whole-model uniform scale.
 *   • Feet stay on the road: we anchor to path elevation each frame.
 *
 * Fallback: if the GLB fails to load, we render nothing (Suspense handles
 * the loading state; the world remains fully functional).
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { PATH_CURVE } from './worldConfig';
import { AVATARS, ACTION_CLIP_HINTS } from './avatars';

// Preload both genders so switching feels instant.
useGLTF.preload(AVATARS.male.model);
useGLTF.preload(AVATARS.male.animations);
useGLTF.preload(AVATARS.female.model);
useGLTF.preload(AVATARS.female.animations);

/** Pick the best matching clip name in the pool for a given action label. */
function resolveClipName(actionKey, pool) {
  const hints = ACTION_CLIP_HINTS[actionKey] || [actionKey];
  for (const h of hints) {
    const hit = pool.find((n) => n.toLowerCase().includes(h.toLowerCase()));
    if (hit) return hit;
  }
  // Absolute fallback: first available clip so something plays
  return pool[0];
}

const GLTFChampion = forwardRef(function GLTFChampion({ gender = 'male', initialT = 0.30 }, ref) {
  const cfg = AVATARS[gender] || AVATARS.male;
  const group = useRef();

  // Load base model + separate animations GLB.
  const modelGltf = useGLTF(cfg.model);
  const animGltf = useGLTF(cfg.animations);

  // CLONE the scene per-instance using SkeletonUtils so multiple champions
  // (or a re-mount) don't share skinned-mesh state with the drei cache.
  const scene = useMemo(() => SkeletonUtils.clone(modelGltf.scene), [modelGltf.scene]);

  // Merge base animations (if any embedded in the model) + the merged clips.
  const allClips = useMemo(() => {
    const clips = [];
    (modelGltf.animations || []).forEach((c) => clips.push(c));
    (animGltf.animations || []).forEach((c) => {
      if (!clips.find((x) => x.name === c.name)) clips.push(c);
    });
    return clips;
  }, [modelGltf.animations, animGltf.animations]);

  const { actions, names } = useAnimations(allClips, scene);

  // Enable shadows + gentle envMap response WITHOUT redesigning materials.
  useEffect(() => {
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material && 'envMapIntensity' in o.material) {
          o.material.envMapIntensity = 0.9;
        }
        // Meshy occasionally exports with `side: THREE.BackSide` on hair.
        // Force `DoubleSide` on any mesh flagged as hair so it reads from
        // both directions. Skin/clothes are untouched.
        if (o.material && /hair|eye/i.test(o.name)) {
          o.material.side = THREE.DoubleSide;
        }
      }
    });
  }, [scene]);

  const [actionKey, setActionKey] = useState('idle');
  const st = useRef({ t: initialT, targetT: initialT });
  const activeAction = useRef(null);

  // Crossfade between actions using the mixer.
  const play = (key) => {
    if (!actions || Object.keys(actions).length === 0) return;
    const clipName = resolveClipName(key, names);
    if (!clipName) return;
    const next = actions[clipName];
    if (!next || next === activeAction.current) return;
    if (activeAction.current) {
      next.reset().fadeIn(0.25).play();
      activeAction.current.fadeOut(0.25);
    } else {
      next.reset().fadeIn(0.15).play();
    }
    activeAction.current = next;
  };

  useEffect(() => { play(actionKey); }, [actionKey, actions, names]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    setAction: (name) => setActionKey(name),
    walkTo: (t) => { st.current.targetT = clamp01(t); setActionKey('walk'); },
    runTo:  (t) => { st.current.targetT = clamp01(t); setActionKey('run'); },
    getT: () => st.current.t,
    getWorldPos: () => group.current?.position.clone(),
    getForwardTangent: () => {
      const tan = PATH_CURVE.getTangentAt(clamp01(st.current.t));
      return new THREE.Vector3(tan.x, 0, tan.z).normalize();
    },
  }), []);

  useFrame((_, dt) => {
    if (!group.current) return;
    const s = st.current;
    const moving = actionKey === 'walk' || actionKey === 'run';
    if (moving && Math.abs(s.targetT - s.t) > 0.001) {
      const speed = actionKey === 'run' ? 0.055 : 0.03;
      const dir = Math.sign(s.targetT - s.t);
      s.t += dir * speed * dt;
      if ((dir > 0 && s.t >= s.targetT) || (dir < 0 && s.t <= s.targetT)) {
        s.t = s.targetT;
        setActionKey('arrive');
        setTimeout(() => setActionKey('idle'), 1400);
      }
    }
    const p = PATH_CURVE.getPointAt(clamp01(s.t));
    const tan = PATH_CURVE.getTangentAt(clamp01(s.t));
    group.current.position.set(p.x, p.y + cfg.groundOffset, p.z);
    const yaw = Math.atan2(tan.x, tan.z);
    group.current.rotation.y = yaw;
  });

  // Auto-return one-shot celebrations to idle
  useEffect(() => {
    if (['wave', 'victory', 'championship-victory', 'defeat'].includes(actionKey)) {
      const dur = actionKey === 'championship-victory' ? 4500 : actionKey === 'victory' ? 2500 : actionKey === 'defeat' ? 2200 : 2000;
      const id = setTimeout(() => setActionKey('idle'), dur);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [actionKey]);

  return (
    <group ref={group}>
      {/* golden ground glow keeps character reading against the terrain */}
      <pointLight position={[0, 0.6, 0]} color="#FFD54A" intensity={0.6} distance={2.5} decay={2} />
      <primitive object={scene} scale={cfg.scale} />
    </group>
  );
});

function clamp01(v) { return Math.max(0.001, Math.min(0.999, v)); }

export default GLTFChampion;
