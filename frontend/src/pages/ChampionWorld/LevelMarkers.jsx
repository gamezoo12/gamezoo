/**
 * LevelMarkers — subtle fantasy game nodes.
 *
 * Composition per marker:
 *   - Glowing disc platform (~1.4m diameter)
 *   - Rotating gold ring above the disc
 *   - Small billboarded floating number (drei <Text>) that fades in
 *     ONLY when the champion is within ~10m
 *   - State treatment:
 *       current   → gold pulse + light column
 *       available → warm amber ring, no beacon
 *       locked    → dim cool ring + a subtle floating cross
 *       completed → soft green ring
 *
 * The player is never dominated by a giant billboard sign.
 */
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { LEVELS, PATH_CURVE } from './worldConfig';

const PALETTE = {
  locked:    { ring: '#7c85a8', disc: '#3a3f52', beacon: null,      label: '#a7afc9' },
  completed: { ring: '#3fd18a', disc: '#20402d', beacon: null,      label: '#dcfbe8' },
  current:   { ring: '#FFD54A', disc: '#5a3d10', beacon: '#FFD54A', label: '#fff2ae' },
  available: { ring: '#FFA53A', disc: '#3a2a10', beacon: null,      label: '#ffd68a' },
};

function LevelMarker({ level, position, championRef }) {
  const c = PALETTE[level.status] || PALETTE.available;
  const ring = useRef();
  const beacon = useRef();
  const [near, setNear] = useState(false);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    if (ring.current) {
      ring.current.rotation.y += dt * 0.7;
      const p = 1 + Math.sin(t * (level.status === 'current' ? 3 : 1.5)) * (level.status === 'current' ? 0.08 : 0.03);
      ring.current.scale.set(p, 1, p);
    }
    if (beacon.current && level.status === 'current') {
      beacon.current.material.opacity = 0.35 + Math.sin(t * 3.6) * 0.15;
    }
    // Toggle near label based on distance to champion.
    const champ = championRef?.current;
    if (champ && champ.getWorldPos) {
      const cp = champ.getWorldPos();
      if (cp) {
        tmp.set(position[0] - cp.x, 0, position[2] - cp.z);
        const dist = tmp.length();
        const should = dist < 9.5;
        if (should !== near) setNear(should);
      }
    }
  });

  return (
    <group position={position}>
      {/* Glowing disc platform */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[0.85, 0.95, 0.10, 20]} />
        <meshStandardMaterial color={c.disc} emissive={c.disc} emissiveIntensity={0.35} roughness={0.7} />
      </mesh>
      {/* Gold rim ring */}
      <mesh position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.75, 0.03, 8, 40]} />
        <meshStandardMaterial color="#FFD54A" emissive="#FF9A3C" emissiveIntensity={0.55} roughness={0.35} metalness={0.5} />
      </mesh>
      {/* State ring (spins) */}
      <mesh ref={ring} position={[0, 0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.55, 0.05, 8, 32]} />
        <meshStandardMaterial color={c.ring} emissive={c.ring} emissiveIntensity={level.status === 'current' ? 1.4 : 0.55} />
      </mesh>

      {/* Current: soft light column */}
      {level.status === 'current' && (
        <>
          <mesh ref={beacon} position={[0, 2.0, 0]}>
            <cylinderGeometry args={[0.25, 0.10, 4.0, 14, 1, true]} />
            <meshBasicMaterial color={c.beacon} transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <pointLight position={[0, 1.3, 0]} color="#FFE082" intensity={2.2} distance={4.5} decay={2} />
        </>
      )}

      {/* Locked: small floating cross */}
      {level.status === 'locked' && (
        <group position={[0, 1.15, 0]}>
          <mesh>
            <torusGeometry args={[0.22, 0.03, 6, 20]} />
            <meshStandardMaterial color={c.ring} emissive={c.ring} emissiveIntensity={0.4} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.32, 0.03, 0.03]} />
            <meshStandardMaterial color={c.ring} />
          </mesh>
          <mesh rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.32, 0.03, 0.03]} />
            <meshStandardMaterial color={c.ring} />
          </mesh>
        </group>
      )}

      {/* Floating billboarded number — always the level index, small &
          understated. When "near" (champion within 9.5m) we ALSO show the
          "Level N" label above it for readability. */}
      <Billboard position={[0, 1.55, 0]}>
        <Text
          fontSize={0.45}
          color={c.label}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
          fontWeight="bold"
        >
          {String(level.number)}
        </Text>
        {near && (
          <Text
            position={[0, -0.42, 0]}
            fontSize={0.15}
            color={c.label}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.008}
            outlineColor="#000000"
            fontWeight="bold"
          >
            {`Level ${level.number}`}
          </Text>
        )}
      </Billboard>
    </group>
  );
}

export default function LevelMarkers({ range, championRef }) {
  const visible = range
    ? LEVELS.filter((l) => l.t >= range[0] - 0.02 && l.t <= range[1] + 0.02)
    : LEVELS;
  return (
    <group>
      {visible.map((lvl) => {
        const p = PATH_CURVE.getPointAt(lvl.t);
        return <LevelMarker key={lvl.id} level={lvl} position={[p.x, p.y + 0.02, p.z]} championRef={championRef} />;
      })}
    </group>
  );
}
