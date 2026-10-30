import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { makeAtlas, makeWinnerTicket } from './textures';
import { drawPhase, elapsed } from './timeline';

export const CENTER = new THREE.Vector3(0, 2.05, 0);
const R = 1.5;
const TINTS = ['#ffe9a3', '#ffc4e1', '#c9d8ff', '#ffffff', '#ffd3a8', '#d9c4ff'];
const ease = (x) => 1 - (1 - x) ** 3;

function rand(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function useTicketParams(count) {
  return useMemo(() => {
    const rnd = rand(97);
    return Array.from({ length: count }, () => {
      let p;
      do { p = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); } while (p.length() > 1);
      p.multiplyScalar(R * 0.86);
      if (p.y > -0.1) p.y = -0.1 - rnd() * 0.6;
      if (p.length() > R * 0.88) p.setLength(R * 0.88);
      return { rest: p, rr: [rnd() * 6, rnd() * 6, rnd() * 6], r: 0.35 + rnd() * 0.95, phase: rnd() * Math.PI * 2,
        speed: 0.6 + rnd() * 0.9, tilt: rnd() * 1.4 - 0.7, yAmp: 0.3 + rnd() * 0.8, spinR: rnd() * 3 + 1 };
    });
  }, [count]);
}

function Tickets({ S, numbers }) {
  const ref = useRef();
  const params = useTicketParams(numbers.length);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const orb = useMemo(() => new THREE.Vector3(), []);
  const texture = useMemo(() => makeAtlas(numbers), [numbers]);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.36, 0.18);
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(numbers.map((_, i) => i)), 1));
    return g;
  }, [numbers]);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05, emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: 0.16 });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aCell;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = (vMapUv + vec2(mod(aCell, 16.0), 31.0 - floor(aCell / 16.0))) / vec2(16.0, 32.0);');
    };
    return m;
  }, [texture]);
  useEffect(() => {
    const c = new THREE.Color();
    numbers.forEach((_, i) => ref.current.setColorAt(i, c.set(TINTS[i % TINTS.length])));
    ref.current.instanceColor.needsUpdate = true;
    return () => { texture.dispose(); geometry.dispose(); material.dispose(); };
  }, [numbers, texture, geometry, material]);

  const local = useRef({ mix: 0, spin: 0 });
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = S.current;
    const L = local.current;
    const t = elapsed(s);
    const K = numbers.length;
    let target = 0;
    let speed = 0.4;
    if (s.stage === 'mixing') { const p = Math.min(1, t / s.cfg.mix_duration_s); target = 1; speed = 1.2 + 4.2 * Math.min(1, p * 2.5) * (p > 0.85 ? 1 - (p - 0.85) * 2 : 1); }
    if (s.stage === 'mixed') { target = 0.75; speed = 1.4; }
    if (s.stage === 'drawing') { target = 1; speed = 5.6 - 3.2 * drawPhase(s).local; }
    if (s.stage === 'drawn') { target = 0.6; speed = 0.9; }
    L.mix += (target - L.mix) * Math.min(1, dt * 1.6);
    L.spin += dt * speed;
    s.machineSpin = L.spin;
    const loadT = s.cfg?.load_duration_s || 1;
    for (let i = 0; i < K; i += 1) {
      const p = params[i];
      let visible = true;
      if (s.stage === 'ready') visible = false;
      tmp.copy(p.rest);
      let rx = p.rr[0]; let ry = p.rr[1]; let rz = p.rr[2];
      if (s.stage === 'loading') {
        const age = t - (i / K) * loadT * 0.92;
        if (age < 0) visible = false;
        else if (age < 0.85) {
          const k = ease(age / 0.85);
          tmp.set(p.rest.x * k, R + 1.9 - (R + 1.9 - p.rest.y) * k, p.rest.z * k);
          rx += age * 14; rz += age * 9;
        }
      }
      if (L.mix > 0.001) {
        const a = p.phase + L.spin * p.speed;
        const ox = Math.cos(a) * p.r;
        const oz = Math.sin(a) * p.r;
        const oy = Math.sin(a * 1.7 + p.phase) * p.yAmp - 0.1;
        const cy = Math.cos(p.tilt); const sy = Math.sin(p.tilt);
        const orbit = orb.set(ox, oy * cy - oz * sy, oy * sy + oz * cy);
        if (orbit.length() > R * 0.9) orbit.setLength(R * 0.9);
        tmp.lerp(orbit, L.mix);
        rx += L.spin * p.spinR * L.mix; ry += L.spin * 1.3 * L.mix;
      }
      dummy.position.copy(tmp).add(CENTER);
      dummy.rotation.set(rx, ry, rz);
      dummy.scale.setScalar(visible ? 1 : 0.0001);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geometry, material, numbers.length]} frustumCulled={false} />;
}

function WinnerTicket({ S, roundIndex }) {
  const ref = useRef();
  const light = useRef();
  const cache = useRef({});
  useFrame(({ clock }) => {
    const s = S.current;
    const mesh = ref.current;
    let show = false;
    if ((s.stage === 'drawing' || s.stage === 'drawn') && s.winners?.length) {
      const ph = drawPhase(s);
      const w = s.stage === 'drawn' ? s.winners.length - 1 : ph.w;
      const k = s.stage === 'drawn' ? 1 : Math.max(0, (ph.local - 0.72) / 0.28);
      if (k > 0) {
        show = true;
        const num = s.winners[w].ticket_number;
        if (!cache.current[num]) cache.current[num] = makeWinnerTicket(num, roundIndex);
        if (mesh.material.map !== cache.current[num]) { mesh.material.map = cache.current[num]; mesh.material.needsUpdate = true; }
        const e = ease(Math.min(1, k));
        mesh.position.set(0, CENTER.y + 1.0 - 0.6 * e + Math.sin(clock.elapsedTime * 2) * 0.04 * e, 2.6 * e);
        mesh.rotation.set(0, (1 - e) * Math.PI * 4, 0);
        mesh.scale.setScalar(0.15 + 0.85 * e);
        light.current.intensity = 8 + 30 * Math.max(0, 1 - Math.abs(k - 0.9) * 4);
      }
    }
    mesh.visible = show;
    light.current.visible = show;
  });
  return (
    <>
      <mesh ref={ref} visible={false}><planeGeometry args={[1.7, 0.85]} /><meshBasicMaterial side={THREE.DoubleSide} color="#d8d8d8" /></mesh>
      <pointLight ref={light} position={[0, CENTER.y + 0.6, 3.4]} color="#ffd36b" distance={8} visible={false} />
    </>
  );
}

export function Machine({ S, numbers, roundIndex }) {
  const rings = useRef();
  const core = useRef();
  useFrame(({ clock }) => {
    const spin = S.current.machineSpin || 0;
    if (rings.current) { rings.current.rotation.y = spin * 0.6; rings.current.children[1].rotation.z = spin * 0.4; }
    if (core.current) core.current.intensity = 18 + Math.sin(clock.elapsedTime * 3) * 6 + (S.current.stage === 'drawing' ? 30 : 0);
  });
  const gold = { color: '#ffcf3a', emissive: '#a86a00', emissiveIntensity: 0.8, metalness: 1, roughness: 0.2 };
  return (
    <group>
      <mesh position={CENTER}>
        <sphereGeometry args={[R, 64, 64]} />
        <meshPhysicalMaterial color="#d9e6ff" transparent opacity={0.16} roughness={0.02} metalness={0.1} clearcoat={1} clearcoatRoughness={0}
          reflectivity={1} envMapIntensity={2.4} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group ref={rings} position={CENTER}>
        <mesh rotation-x={Math.PI / 2}><torusGeometry args={[R + 0.04, 0.045, 16, 128]} /><meshStandardMaterial {...gold} /></mesh>
        <group><mesh><torusGeometry args={[R + 0.06, 0.035, 16, 128]} /><meshStandardMaterial {...gold} /></mesh></group>
      </group>
      <pointLight ref={core} position={CENTER} color="#b48cff" distance={5} />
      <mesh position={[0, CENTER.y + R + 0.45, 0]}><cylinderGeometry args={[0.24, 0.24, 1.0, 32, 1, true]} /><meshPhysicalMaterial color="#cfe0ff" transparent opacity={0.22} roughness={0.05} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      <mesh position={[0, CENTER.y + R + 0.96, 0]}><torusGeometry args={[0.26, 0.04, 12, 48]} /><meshStandardMaterial {...gold} /></mesh>
      <mesh position={[0, 0.42, 0]}><cylinderGeometry args={[0.55, 1.15, 0.55, 48]} /><meshStandardMaterial {...gold} /></mesh>
      <mesh position={[0, 0.72, 0]}><cylinderGeometry args={[0.22, 0.3, 0.3, 32]} /><meshStandardMaterial {...gold} /></mesh>
      <mesh position={[0, 0.69, 0]} rotation-x={-Math.PI / 2}><torusGeometry args={[1.0, 0.05, 12, 64]} /><meshStandardMaterial color="#fff" emissive="#c47bff" emissiveIntensity={3.5} /></mesh>
      {numbers.length > 0 && <Tickets S={S} numbers={numbers} />}
      <WinnerTicket S={S} roundIndex={roundIndex} />
    </group>
  );
}
