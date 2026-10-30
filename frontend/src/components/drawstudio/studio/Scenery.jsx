import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial, SpotLight, Text } from '@react-three/drei';
import * as THREE from 'three';
import { FONTS } from './textures';

const GOLD = { color: '#ffcf3a', emissive: '#b37400', emissiveIntensity: 0.9, metalness: 1, roughness: 0.22 };

function Crown({ position }) {
  return (
    <group position={position}>
      <mesh><cylinderGeometry args={[0.42, 0.36, 0.16, 32]} /><meshStandardMaterial {...GOLD} /></mesh>
      {[-0.34, -0.17, 0, 0.17, 0.34].map((x, i) => (
        <group key={x} position={[x, 0.2 + (i === 2 ? 0.08 : 0), 0]}>
          <mesh><coneGeometry args={[0.08, i === 2 ? 0.42 : 0.3, 4]} /><meshStandardMaterial {...GOLD} /></mesh>
          <mesh position={[0, i === 2 ? 0.25 : 0.18, 0]}><sphereGeometry args={[0.045, 12, 12]} /><meshStandardMaterial color="#fff" emissive="#ffe38a" emissiveIntensity={2} /></mesh>
        </group>
      ))}
    </group>
  );
}

function MovingSpot({ position, color, speed, phase }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed + phase;
    ref.current?.target.position.set(Math.sin(t) * 3.2, 0, Math.cos(t * 0.7) * 1.8);
    ref.current?.target.updateMatrixWorld();
  });
  return <SpotLight ref={ref} position={position} color={color} angle={0.32} penumbra={0.6} distance={16} attenuation={9} anglePower={4} intensity={60} opacity={0.32} />;
}

function LedPillars() {
  const mats = useRef([]);
  useFrame(({ clock }) => mats.current.forEach((m, i) => {
    if (m) m.emissiveIntensity = 1.2 + Math.sin(clock.elapsedTime * 2.2 + i * 0.9) * 0.9;
  }));
  const pillars = [-7.4, -6.2, 6.2, 7.4];
  return pillars.map((x, i) => (
    <mesh key={x} position={[x, 3, -4.2 + Math.abs(x) * 0.12]}>
      <boxGeometry args={[0.55, 6, 0.2]} />
      <meshStandardMaterial ref={(m) => { mats.current[i] = m; }} color="#1a0b45" emissive={i % 2 ? '#3b6bff' : '#9b3bff'} emissiveIntensity={1.4} />
    </mesh>
  ));
}

function Bulbs() {
  const ref = useRef();
  const count = 46;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    for (let i = 0; i < count; i += 1) {
      const a = Math.PI * (i / (count - 1));
      dummy.position.set(Math.cos(a) * 4.6, 0.3 + Math.sin(a) * 4.1, -3.4);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);
  useFrame(({ clock }) => { ref.current.material.emissiveIntensity = 2.2 + Math.sin(clock.elapsedTime * 6) * 0.6; });
  return (
    <instancedMesh ref={ref} args={[null, null, count]}>
      <sphereGeometry args={[0.07, 10, 10]} />
      <meshStandardMaterial color="#fff6d6" emissive="#ffd36b" emissiveIntensity={2.4} />
    </instancedMesh>
  );
}

function Backdrop({ slides }) {
  const [i, setI] = useState(0);
  const textures = useMemo(() => slides.map((s) => s.texture), [slides]);
  useEffect(() => {
    if (slides.length < 2) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 7000);
    return () => clearInterval(t);
  }, [slides.length]);
  const slide = slides[i % Math.max(1, slides.length)];
  return (
    <group position={[0, 2.45, -6.2]} scale={0.85}>
      <mesh position={[0, 0, -0.05]}><planeGeometry args={[11.6, 5.4]} /><meshStandardMaterial color="#120a33" emissive="#2a1470" emissiveIntensity={0.4} /></mesh>
      {slide && <mesh><planeGeometry args={[11.2, 5.0]} /><meshBasicMaterial map={textures[i % textures.length]} toneMapped={false} transparent opacity={0.55} /></mesh>}
      {[[0, 2.72, 11.8, 0.08], [0, -2.72, 11.8, 0.08], [-5.9, 0, 0.08, 5.5], [5.9, 0, 0.08, 5.5]].map(([x, y, w, h]) => (
        <mesh key={`${x}${y}`} position={[x, y, 0.02]}><boxGeometry args={[w, h, 0.06]} /><meshStandardMaterial {...GOLD} emissiveIntensity={1.4} /></mesh>
      ))}
    </group>
  );
}

export function Scenery({ slides }) {
  return (
    <>
      <color attach="background" args={['#050211']} />
      <fog attach="fog" args={['#050211', 14, 30]} />
      <ambientLight intensity={0.35} color="#8a7bff" />
      <pointLight position={[-6, 4, 3]} intensity={40} color="#8b3bff" distance={18} />
      <pointLight position={[6, 4, 3]} intensity={40} color="#3b7bff" distance={18} />
      <pointLight position={[0, 6, 5]} intensity={30} color="#ffd36b" distance={16} />
      <MovingSpot position={[-4, 8, 2]} color="#b06bff" speed={0.45} phase={0} />
      <MovingSpot position={[4, 8, 2]} color="#6b9bff" speed={0.38} phase={2} />
      <MovingSpot position={[0, 9, 3.5]} color="#ffe2a0" speed={0.3} phase={4} />
      <Backdrop slides={slides} />
      <LedPillars />
      <Bulbs />
      <Crown position={[0, 6.25, -1]} />
      <Text font={FONTS.title} fontSize={0.78} position={[0, 5.65, -1]} anchorX="center" anchorY="middle" letterSpacing={0.04} outlineWidth={0.012} outlineColor="#5a3500">
        PRIZE LEAGUE<meshStandardMaterial {...GOLD} emissiveIntensity={1.1} />
      </Text>
      <Text font={FONTS.bold} fontSize={0.26} position={[0, 5.1, -1]} anchorX="center" letterSpacing={0.35} color="#ffffff">DRAW STUDIO</Text>
      <mesh position={[0, 0, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[60, 60]} />
        <MeshReflectorMaterial blur={[320, 90]} resolution={512} mixBlur={1} mixStrength={30} roughness={0.9} depthScale={1.1}
          minDepthThreshold={0.4} maxDepthThreshold={1.4} color="#0b0620" metalness={0.6} mirror={0.65} />
      </mesh>
      <mesh position={[0, 0.08, 0]}><cylinderGeometry args={[3.4, 3.6, 0.16, 64]} /><meshStandardMaterial color="#1b0f45" metalness={0.8} roughness={0.3} /></mesh>
      <mesh position={[0, 0.17, 0]} rotation-x={-Math.PI / 2}><torusGeometry args={[3.45, 0.04, 12, 96]} /><meshStandardMaterial color="#c58bff" emissive="#9b3bff" emissiveIntensity={3} /></mesh>
    </>
  );
}
