/**
 * LevelNodes — runtime Level markers riding on the spline.
 * Each node = glowing platform ring + number-shaped extruded plaque + state
 * ring around the outside (gold=current, emerald=completed, purple=available,
 * dark=locked). Current level gets a pulsing beacon of light.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { LEVELS, PATH_CURVE } from './worldConfig';

const STATE_COLORS = {
  locked:    { ring: '#3a3454', label: '#8a84a4', glow: '#0000',   emissive: 0.0 },
  completed: { ring: '#10b981', label: '#052e1e', glow: '#10b981', emissive: 0.5 },
  current:   { ring: '#FFD54A', label: '#2a1a05', glow: '#FFD54A', emissive: 1.2 },
  available: { ring: '#8B5CFF', label: '#f0e9ff', glow: '#8B5CFF', emissive: 0.6 },
};

function Node({ level, position, tangent }) {
  const state = STATE_COLORS[level.status] || STATE_COLORS.available;
  const beacon = useRef();

  useFrame((s) => {
    if (beacon.current) {
      const t = s.clock.elapsedTime;
      beacon.current.scale.setScalar(1 + Math.sin(t * 2.4) * 0.08);
    }
  });

  // Rotate the plaque to face perpendicular to the path for readability
  const yaw = Math.atan2(tangent.x, tangent.z);

  return (
    <group position={position}>
      {/* base disc */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <cylinderGeometry args={[0.55, 0.6, 0.08, 24]} />
        <meshStandardMaterial color="#241f3a" roughness={0.8} />
      </mesh>
      {/* outer ring — state color */}
      <mesh ref={beacon} position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.5, 0.06, 8, 32]} />
        <meshStandardMaterial color={state.ring} emissive={state.ring} emissiveIntensity={state.emissive} />
      </mesh>
      {/* level number floating above (billboarded so it always reads) */}
      <Billboard position={[0, 1.0, 0]} follow lockX={false} lockY={false} lockZ={false}>
        <mesh position={[0, 0, -0.03]}>
          <planeGeometry args={[0.85, 0.6]} />
          <meshBasicMaterial color={state.label === '#2a1a05' ? '#FFD54A' : '#161433'} transparent opacity={0.9} />
        </mesh>
        <Text
          fontSize={0.32}
          color={state.label}
          anchorX="center"
          anchorY="middle"
        >
          {`Lv ${level.number}`}
        </Text>
      </Billboard>
      {/* current-level beacon of light */}
      {level.status === 'current' && (
        <pointLight position={[0, 1.2, 0]} color="#FFD54A" intensity={2.5} distance={4} decay={2} />
      )}
      {/* locked cross-mark */}
      {level.status === 'locked' && (
        <mesh position={[0, 0.5, 0]} rotation={[0, yaw, 0]}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
          <meshStandardMaterial color="#8a84a4" />
        </mesh>
      )}
    </group>
  );
}

export default function LevelNodes() {
  return (
    <group>
      {LEVELS.map((lvl) => {
        const p = PATH_CURVE.getPointAt(lvl.t);
        const tan = PATH_CURVE.getTangentAt(lvl.t);
        // lift node slightly off the road so it doesn't intersect
        const pos = [p.x, p.y + 0.03, p.z];
        return <Node key={lvl.id} level={lvl} position={pos} tangent={tan} />;
      })}
    </group>
  );
}
