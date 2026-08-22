/**
 * Champion — procedural stylized humanoid with a callable animation state
 * machine. This is a placeholder that renders WELL (proper proportions,
 * hair, cape, tunic, faceplate accents) so the world reads correctly.
 *
 * FINAL AVATAR PIPELINE: swap this component's mesh with a `useGLTF()` +
 * `useAnimations()` from any premium GLB (Ready Player Me, Sketchfab,
 * commissioned model). The state names below map 1:1 to Mixamo clip names
 * so retargeting is trivial:
 *   idle → 'Idle'       walk → 'Walking'      run → 'Running'
 *   wave → 'Waving'     victory → 'Victory'   defeat → 'Defeated'
 *   arrive → 'Idle Look Around'               championship-victory → 'Cheering'
 */
import { useRef, useMemo, useImperativeHandle, forwardRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PATH_CURVE } from './worldConfig';

const SKIN_MALE   = { skin: '#e8b892', hair: '#3a2416', tunic: '#3B2AA8', accent: '#FFD54A', cape: '#6C2BFF' };
const SKIN_FEMALE = { skin: '#ebc0a5', hair: '#a04a20', tunic: '#2A6A9C', accent: '#FFD54A', cape: '#10b981' };

const Champion = forwardRef(function Champion({ gender = 'male', initialT = 0.03 }, ref) {
  const group = useRef();
  const leftArm = useRef(); const rightArm = useRef();
  const leftLeg = useRef(); const rightLeg = useRef();
  const torso = useRef(); const head = useRef(); const cape = useRef();
  const glow = useRef();
  const [action, setAction] = useState('idle');
  const stateT = useRef({
    // path progress
    t: initialT,
    // target progress the walk logic is moving toward
    targetT: initialT,
    // internal animation clock, doesn't reset between transitions
    clock: 0,
    // for the celebration cycle
    celebClock: 0,
  });

  const palette = gender === 'female' ? SKIN_FEMALE : SKIN_MALE;

  // Expose imperative API for the parent (Scene) to drive states + movement.
  useImperativeHandle(ref, () => ({
    setAction: (name) => setAction(name),
    walkTo: (t) => { stateT.current.targetT = Math.max(0, Math.min(1, t)); setAction('walk'); },
    runTo:  (t) => { stateT.current.targetT = Math.max(0, Math.min(1, t)); setAction('run'); },
    getT:   () => stateT.current.t,
    getWorldPos: () => group.current?.position.clone(),
  }), []);

  // Movement update loop
  useFrame((s, dt) => {
    if (!group.current) return;
    const st = stateT.current;
    st.clock += dt;

    // Move toward targetT when in walk/run/arrive states
    const isMoving = action === 'walk' || action === 'run';
    if (isMoving && Math.abs(st.targetT - st.t) > 0.001) {
      const speed = action === 'run' ? 0.055 : 0.03; // normalized progress per second
      const dir = Math.sign(st.targetT - st.t);
      st.t += dir * speed * dt;
      // clamp when we cross
      if ((dir > 0 && st.t >= st.targetT) || (dir < 0 && st.t <= st.targetT)) {
        st.t = st.targetT;
        setAction('arrive');
        st.celebClock = 0;
      }
    }

    // Position + heading on the spline
    const p = PATH_CURVE.getPointAt(Math.max(0.001, Math.min(0.999, st.t)));
    const tan = PATH_CURVE.getTangentAt(Math.max(0.001, Math.min(0.999, st.t)));
    group.current.position.set(p.x, p.y, p.z);
    const yaw = Math.atan2(tan.x, tan.z);
    group.current.rotation.y = yaw;

    // Animation per state
    animate(action, st, dt, {
      leftArm, rightArm, leftLeg, rightLeg, torso, head, cape, glow,
    });
  });

  // Auto-return arrive/victory back to idle after a beat
  useEffect(() => {
    if (['arrive', 'victory', 'championship-victory', 'defeat', 'wave'].includes(action)) {
      const dur = action === 'championship-victory' ? 4500 : action === 'victory' ? 2500 : action === 'defeat' ? 2200 : action === 'wave' ? 2000 : 1800;
      const id = setTimeout(() => setAction('idle'), dur);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [action]);

  return (
    <group ref={group}>
      {/* subtle golden ground glow so the champion always reads */}
      <pointLight ref={glow} position={[0, 0.3, 0]} color="#FFD54A" intensity={0.6} distance={2.5} decay={2} />
      <group scale={0.55}>
        {/* torso */}
        <mesh ref={torso} position={[0, 1.55, 0]} castShadow>
          <boxGeometry args={[0.75, 0.95, 0.5]} />
          <meshStandardMaterial color={palette.tunic} roughness={0.6} />
        </mesh>
        {/* belt with gold buckle */}
        <mesh position={[0, 1.1, 0.001]} castShadow>
          <boxGeometry args={[0.8, 0.14, 0.52]} />
          <meshStandardMaterial color="#3a2416" roughness={0.85} />
        </mesh>
        <mesh position={[0, 1.1, 0.27]}>
          <boxGeometry args={[0.2, 0.14, 0.02]} />
          <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.4} />
        </mesh>
        {/* cape */}
        <mesh ref={cape} position={[0, 1.55, -0.28]} rotation={[0.1, 0, 0]}>
          <planeGeometry args={[0.85, 1.1, 1, 4]} />
          <meshStandardMaterial color={palette.cape} roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
        {/* head */}
        <mesh ref={head} position={[0, 2.25, 0]} castShadow>
          <sphereGeometry args={[0.3, 16, 14]} />
          <meshStandardMaterial color={palette.skin} roughness={0.6} />
        </mesh>
        {/* hair (top cap) */}
        <mesh position={[0, 2.42, gender === 'female' ? -0.05 : 0]} castShadow>
          <sphereGeometry args={[0.32, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={palette.hair} roughness={0.75} />
        </mesh>
        {/* female ponytail */}
        {gender === 'female' && (
          <mesh position={[0, 2.1, -0.32]} rotation={[0.5, 0, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.4, 4, 8]} />
            <meshStandardMaterial color={palette.hair} roughness={0.75} />
          </mesh>
        )}
        {/* eyes */}
        <mesh position={[-0.09, 2.28, 0.27]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshBasicMaterial color="#1a1330" />
        </mesh>
        <mesh position={[0.09, 2.28, 0.27]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshBasicMaterial color="#1a1330" />
        </mesh>
        {/* forehead accent gem */}
        <mesh position={[0, 2.5, 0.24]}>
          <sphereGeometry args={[0.055, 8, 8]} />
          <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.6} />
        </mesh>
        {/* arms — pivot at shoulder */}
        <group ref={leftArm} position={[-0.42, 1.9, 0]}>
          <mesh position={[0, -0.35, 0]} castShadow>
            <capsuleGeometry args={[0.11, 0.55, 4, 8]} />
            <meshStandardMaterial color={palette.tunic} roughness={0.7} />
          </mesh>
          {/* hand */}
          <mesh position={[0, -0.72, 0]}>
            <sphereGeometry args={[0.13, 10, 8]} />
            <meshStandardMaterial color={palette.skin} roughness={0.6} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.42, 1.9, 0]}>
          <mesh position={[0, -0.35, 0]} castShadow>
            <capsuleGeometry args={[0.11, 0.55, 4, 8]} />
            <meshStandardMaterial color={palette.tunic} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.72, 0]}>
            <sphereGeometry args={[0.13, 10, 8]} />
            <meshStandardMaterial color={palette.skin} roughness={0.6} />
          </mesh>
        </group>
        {/* legs — pivot at hip */}
        <group ref={leftLeg} position={[-0.18, 1.05, 0]}>
          <mesh position={[0, -0.45, 0]} castShadow>
            <capsuleGeometry args={[0.14, 0.7, 4, 8]} />
            <meshStandardMaterial color="#1a1330" roughness={0.85} />
          </mesh>
          {/* boot */}
          <mesh position={[0, -0.92, 0.06]} castShadow>
            <boxGeometry args={[0.24, 0.16, 0.36]} />
            <meshStandardMaterial color="#3a2416" roughness={0.85} />
          </mesh>
        </group>
        <group ref={rightLeg} position={[0.18, 1.05, 0]}>
          <mesh position={[0, -0.45, 0]} castShadow>
            <capsuleGeometry args={[0.14, 0.7, 4, 8]} />
            <meshStandardMaterial color="#1a1330" roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.92, 0.06]} castShadow>
            <boxGeometry args={[0.24, 0.16, 0.36]} />
            <meshStandardMaterial color="#3a2416" roughness={0.85} />
          </mesh>
        </group>
      </group>
    </group>
  );
});

/**
 * State machine — pure functions that drive the joint refs each frame.
 * Deliberately verbose: each state's motion is legible enough that dropping
 * in a real animation clip later is a mechanical swap (state → clip name).
 */
function animate(state, st, dt, r) {
  const t = st.clock;
  const gently = (v) => v * 0.6; // eases dampening of return-to-rest

  // Reset baselines
  const resetLimbs = () => {
    if (r.leftArm.current)  { r.leftArm.current.rotation.set(0, 0, 0); }
    if (r.rightArm.current) { r.rightArm.current.rotation.set(0, 0, 0); }
    if (r.leftLeg.current)  { r.leftLeg.current.rotation.set(0, 0, 0); }
    if (r.rightLeg.current) { r.rightLeg.current.rotation.set(0, 0, 0); }
    if (r.head.current)     { r.head.current.rotation.set(0, 0, 0); }
    if (r.torso.current)    { r.torso.current.rotation.set(0, 0, 0); }
    if (r.cape.current)     { r.cape.current.rotation.set(0.1, 0, 0); }
  };

  switch (state) {
    case 'idle': {
      const breath = Math.sin(t * 1.6) * 0.02;
      if (r.torso.current) r.torso.current.position.y = 1.55 + breath;
      if (r.head.current)  r.head.current.rotation.y = Math.sin(t * 0.5) * 0.15;
      if (r.leftArm.current)  r.leftArm.current.rotation.z = 0.05 + Math.sin(t * 1.2) * 0.02;
      if (r.rightArm.current) r.rightArm.current.rotation.z = -0.05 - Math.sin(t * 1.2) * 0.02;
      if (r.cape.current)  r.cape.current.rotation.x = 0.1 + Math.sin(t * 0.8) * 0.04;
      if (r.glow.current)  r.glow.current.intensity = 0.5 + Math.sin(t * 1.6) * 0.1;
      break;
    }
    case 'walk':
    case 'arrive': {
      const speed = state === 'walk' ? 5.5 : 3.2;
      const cycle = t * speed;
      if (r.leftLeg.current)  r.leftLeg.current.rotation.x = Math.sin(cycle) * 0.7;
      if (r.rightLeg.current) r.rightLeg.current.rotation.x = -Math.sin(cycle) * 0.7;
      if (r.leftArm.current)  r.leftArm.current.rotation.x = -Math.sin(cycle) * 0.6;
      if (r.rightArm.current) r.rightArm.current.rotation.x = Math.sin(cycle) * 0.6;
      if (r.torso.current)    r.torso.current.rotation.y = Math.sin(cycle) * 0.06;
      if (r.head.current)     r.head.current.rotation.y = -Math.sin(cycle) * 0.03;
      if (r.cape.current)     r.cape.current.rotation.x = 0.2 + Math.sin(cycle) * 0.12;
      break;
    }
    case 'run': {
      const cycle = t * 9;
      if (r.leftLeg.current)  r.leftLeg.current.rotation.x = Math.sin(cycle) * 1.0;
      if (r.rightLeg.current) r.rightLeg.current.rotation.x = -Math.sin(cycle) * 1.0;
      if (r.leftArm.current)  r.leftArm.current.rotation.x = -Math.sin(cycle) * 1.0;
      if (r.rightArm.current) r.rightArm.current.rotation.x = Math.sin(cycle) * 1.0;
      if (r.torso.current)    { r.torso.current.rotation.y = Math.sin(cycle) * 0.08; r.torso.current.rotation.x = 0.1; }
      if (r.cape.current)     r.cape.current.rotation.x = 0.4 + Math.sin(cycle) * 0.2;
      break;
    }
    case 'victory': {
      st.celebClock += dt;
      const c = st.celebClock;
      // arms up, small hop
      if (r.leftArm.current)  r.leftArm.current.rotation.z = 2.6 - Math.min(0.4, c) * 0.5;
      if (r.rightArm.current) r.rightArm.current.rotation.z = -2.6 + Math.min(0.4, c) * 0.5;
      if (r.leftArm.current)  r.leftArm.current.rotation.x = -0.3;
      if (r.rightArm.current) r.rightArm.current.rotation.x = -0.3;
      if (r.head.current)     r.head.current.rotation.x = -0.3;
      if (r.torso.current)    r.torso.current.position.y = 1.55 + Math.abs(Math.sin(c * 4)) * 0.15;
      if (r.glow.current)     r.glow.current.intensity = 1.6 + Math.sin(c * 8) * 0.4;
      break;
    }
    case 'championship-victory': {
      st.celebClock += dt;
      const c = st.celebClock;
      if (r.leftArm.current)  { r.leftArm.current.rotation.z = 2.8; r.leftArm.current.rotation.x = -0.5; }
      if (r.rightArm.current) { r.rightArm.current.rotation.z = -2.8; r.rightArm.current.rotation.x = -0.5; }
      if (r.head.current)     r.head.current.rotation.x = -0.4;
      if (r.torso.current)    r.torso.current.position.y = 1.55 + Math.abs(Math.sin(c * 3)) * 0.28;
      if (r.cape.current)     r.cape.current.rotation.x = 0.6 + Math.sin(c * 2) * 0.2;
      if (r.glow.current)     r.glow.current.intensity = 2.6 + Math.sin(c * 5) * 0.6;
      break;
    }
    case 'defeat': {
      resetLimbs();
      if (r.head.current)  r.head.current.rotation.x = gently(0.6);
      if (r.torso.current) r.torso.current.rotation.x = 0.25;
      if (r.leftArm.current)  r.leftArm.current.rotation.x = 0.3;
      if (r.rightArm.current) r.rightArm.current.rotation.x = 0.3;
      break;
    }
    case 'wave': {
      resetLimbs();
      if (r.rightArm.current) {
        r.rightArm.current.rotation.z = -2.2;
        r.rightArm.current.rotation.x = Math.sin(t * 6) * 0.4;
      }
      break;
    }
    default: resetLimbs();
  }
}

export default Champion;
