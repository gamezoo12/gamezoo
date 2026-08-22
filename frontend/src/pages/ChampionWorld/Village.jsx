/**
 * Village — procedural houses, well, watermill, a stone bridge.
 * Each house is a simple box + pitched roof + door + windows. Small but
 * unique enough to read as a real medieval-fantasy hamlet.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VILLAGE_HOUSES } from './worldConfig';
import { sampleElevation } from './Terrain';

function House({ pos, r, scale, roofColor }) {
  return (
    <group position={pos} rotation={[0, r, 0]} scale={scale}>
      {/* body */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.9, 1]} />
        <meshStandardMaterial color="#e6d3a8" roughness={0.9} />
      </mesh>
      {/* roof */}
      <mesh position={[0, 1.15, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <coneGeometry args={[1.05, 0.75, 4]} />
        <meshStandardMaterial color={roofColor} roughness={0.8} />
      </mesh>
      {/* door */}
      <mesh position={[0, 0.28, 0.51]}>
        <planeGeometry args={[0.28, 0.55]} />
        <meshStandardMaterial color="#5a3620" roughness={0.85} />
      </mesh>
      {/* glowing windows */}
      <mesh position={[-0.42, 0.55, 0.51]}>
        <planeGeometry args={[0.22, 0.22]} />
        <meshStandardMaterial color="#ffdc7a" emissive="#ffa833" emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0.42, 0.55, 0.51]}>
        <planeGeometry args={[0.22, 0.22]} />
        <meshStandardMaterial color="#ffdc7a" emissive="#ffa833" emissiveIntensity={0.9} />
      </mesh>
      {/* chimney */}
      <mesh position={[0.4, 1.35, -0.3]} castShadow>
        <boxGeometry args={[0.18, 0.5, 0.18]} />
        <meshStandardMaterial color="#8f6a54" />
      </mesh>
    </group>
  );
}

// A slowly rotating windmill visible from the road
function Windmill({ pos }) {
  const blades = useRef();
  useFrame((_, dt) => { if (blades.current) blades.current.rotation.z += dt * 0.5; });
  return (
    <group position={pos}>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.75, 2.4, 12]} />
        <meshStandardMaterial color="#d9c496" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.6, 0]} castShadow>
        <coneGeometry args={[0.7, 0.7, 12]} />
        <meshStandardMaterial color="#8a4a2c" />
      </mesh>
      <group ref={blades} position={[0, 2.0, 0.55]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <boxGeometry args={[0.15, 1.6, 0.05]} />
            <meshStandardMaterial color="#f0e5cc" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// Stone arch bridge across the river
function Bridge() {
  return (
    <group position={[24, 0.5, 4]}>
      {/* deck */}
      <mesh position={[0, 0.35, 0]} rotation={[0, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[5, 0.25, 1.8]} />
        <meshStandardMaterial color="#a99475" roughness={0.9} />
      </mesh>
      {/* arch */}
      <mesh position={[0, 0.1, 0]} rotation={[0, 0.15, 0]} castShadow>
        <torusGeometry args={[1.6, 0.22, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#918070" roughness={0.9} />
      </mesh>
      {/* railings */}
      {[-0.85, 0.85].map((z, i) => (
        <mesh key={i} position={[0, 0.75, z]} rotation={[0, 0.15, 0]}>
          <boxGeometry args={[5, 0.15, 0.08]} />
          <meshStandardMaterial color="#7a6a5a" />
        </mesh>
      ))}
    </group>
  );
}

// Old watchtower / ruin near the mountain
function Ruin() {
  return (
    <group position={[38, sampleElevation(38, -8), -8]}>
      <mesh position={[0, 1.4, 0]} castShadow>
        <cylinderGeometry args={[1.0, 1.15, 2.8, 8]} />
        <meshStandardMaterial color="#847a70" roughness={0.95} />
      </mesh>
      {/* broken top */}
      <mesh position={[0.4, 2.9, 0]} rotation={[0, 0, 0.3]} castShadow>
        <cylinderGeometry args={[0.6, 0.9, 0.6, 8]} />
        <meshStandardMaterial color="#7a716a" roughness={0.95} />
      </mesh>
    </group>
  );
}

export default function Village() {
  return (
    <group>
      {VILLAGE_HOUSES.map((h, i) => (
        <House
          key={i}
          pos={[h.x, sampleElevation(h.x, h.z), h.z]}
          r={h.r}
          scale={h.scale}
          roofColor={h.roof}
        />
      ))}
      <Windmill pos={[17, sampleElevation(17, 8), 8]} />
      <Bridge />
      <Ruin />
    </group>
  );
}
