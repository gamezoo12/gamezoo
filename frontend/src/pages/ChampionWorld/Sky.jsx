/**
 * Sky — stylized gradient dome + drifting stylized clouds.
 * Cheap: just meshes with unlit materials so no shadow cost.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sky as DreiSky } from '@react-three/drei';

export default function Sky() {
  return (
    <>
      <DreiSky
        distance={450000}
        sunPosition={[80, 40, -30]}
        inclination={0.48}
        azimuth={0.25}
        mieCoefficient={0.005}
        mieDirectionalG={0.85}
        rayleigh={2}
        turbidity={5}
      />
      <DriftingClouds />
    </>
  );
}

function DriftingClouds() {
  // Simple cheap procedural puffs — 8 stacked white spheres drifting X.
  const ref = useRef();
  useFrame((_, dt) => { if (ref.current) ref.current.position.x = ((ref.current.position.x - dt * 0.5) % 200); });
  const puffs = Array.from({ length: 10 }, (_, i) => ({ x: i * 12 - 30, y: 15 + (i % 3) * 4, z: -10 - (i % 2) * 6, s: 2 + (i % 3) }));
  return (
    <group ref={ref}>
      {puffs.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[p.s, 8, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.55} />
        </mesh>
      ))}
    </group>
  );
}
