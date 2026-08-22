/**
 * Castle — procedural cinematic Championship Castle.
 *   • central keep + 4 corner towers
 *   • gate with warm light
 *   • animated banners (vertex sway) + flag on the highest spire
 *   • ring of glow lights around the plateau
 *   • plateau steps leading up from the road
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Banner: plane with a vertex-shader wind sway
const bannerVS = `
uniform float uTime;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  float sway = sin(uTime * 2.0 + p.y * 3.5) * 0.06 * smoothstep(0.0, 1.0, uv.y);
  p.z += sway;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;
const bannerFS = `
varying vec2 vUv;
uniform vec3 uColor;
void main() {
  // vertical stripe with an emblem cross
  float bar = step(0.3, vUv.x) * step(vUv.x, 0.7);
  float horiz = step(0.42, vUv.y) * step(vUv.y, 0.58);
  vec3 col = mix(uColor, vec3(1.0, 0.85, 0.3), bar * horiz);
  gl_FragColor = vec4(col, 1.0);
}
`;

function Banner({ position, rotation, color = '#6C2BFF' }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: bannerVS,
    fragmentShader: bannerFS,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
  }), [color]);
  useFrame((_, dt) => { mat.uniforms.uTime.value += dt; });
  return (
    <mesh position={position} rotation={rotation} material={mat}>
      <planeGeometry args={[0.6, 1.4, 1, 8]} />
    </mesh>
  );
}

function Tower({ position, height = 3, color = '#d4c9a8' }) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.75, height, 10]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* crenellations ring */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.55, height + 0.08, Math.sin(a) * 0.55]} castShadow>
            <boxGeometry args={[0.14, 0.22, 0.14]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}
      {/* royal-blue steep spire (reference image) */}
      <mesh position={[0, height + 0.9, 0]} castShadow>
        <coneGeometry args={[0.6, 1.8, 10]} />
        <meshStandardMaterial color="#3457a6" roughness={0.6} />
      </mesh>
      {/* flag on spire */}
      <Banner position={[0.3, height + 1.1, 0]} rotation={[0, 0, 0]} color="#294b8f" />
    </group>
  );
}

export default function Castle({ position = [44, 3.2, 6], variant = 'gold' }) {
  const light = useRef();
  useFrame((state) => {
    if (light.current) {
      // warm gate light pulse
      light.current.intensity = 2.5 + Math.sin(state.clock.elapsedTime * 2) * 0.4;
    }
  });

  // Royal-blue palette from the reference image
  const wallColor = '#d4c9a8';         // warm cream stone
  const roofColor = '#3457a6';         // royal-blue slate spires
  const gateColor = variant === 'gold' ? '#3a1f0f' : '#221513';
  const lionBannerBlue = '#294b8f';

  return (
    <group position={position}>
      {/* plateau */}
      <mesh position={[0, -0.3, 0]} receiveShadow>
        <cylinderGeometry args={[5.5, 6, 0.6, 24]} />
        <meshStandardMaterial color="#a89880" roughness={0.9} />
      </mesh>

      {/* steps up from the road side */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, -0.15 + i * 0.14, -3.8 + i * 0.3]} receiveShadow>
          <boxGeometry args={[2.4 - i * 0.2, 0.14, 0.35]} />
          <meshStandardMaterial color="#a89880" />
        </mesh>
      ))}

      {/* outer walls */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const x = Math.cos(a) * 2.6, z = Math.sin(a) * 2.6;
        return (
          <mesh key={i} position={[x, 0.9, z]} rotation={[0, -a + Math.PI / 2, 0]} castShadow>
            <boxGeometry args={[3.2, 1.8, 0.4]} />
            <meshStandardMaterial color={wallColor} roughness={0.85} />
          </mesh>
        );
      })}

      {/* central keep */}
      <mesh position={[0, 1.6, 0]} castShadow>
        <boxGeometry args={[2.4, 3.2, 2.4]} />
        <meshStandardMaterial color={wallColor} roughness={0.85} />
      </mesh>
      {/* keep top row */}
      {Array.from({ length: 8 }).map((_, i) => {
        const side = Math.floor(i / 2);
        const off = i % 2 === 0 ? -0.7 : 0.7;
        const positions = [[off, 3.35, 1.25], [off, 3.35, -1.25], [1.25, 3.35, off], [-1.25, 3.35, off]];
        return (
          <mesh key={i} position={positions[side]} castShadow>
            <boxGeometry args={[0.35, 0.35, 0.35]} />
            <meshStandardMaterial color={wallColor} />
          </mesh>
        );
      })}
      {/* keep spire (royal blue, tall) */}
      <mesh position={[0, 4.9, 0]} castShadow>
        <coneGeometry args={[1.0, 2.4, 4]} />
        <meshStandardMaterial color="#3457a6" roughness={0.6} />
      </mesh>
      <Banner position={[0.55, 5.5, 0]} rotation={[0, 0, 0]} color="#FFD54A" />

      {/* corner towers */}
      <Tower position={[-2.6, 0, 2.6]} height={3.2} />
      <Tower position={[2.6, 0, 2.6]} height={3.2} />
      <Tower position={[-2.6, 0, -2.6]} height={3.2} />
      <Tower position={[2.6, 0, -2.6]} height={3.2} />

      {/* gate */}
      <mesh position={[0, 0.8, -2.6]} castShadow>
        <boxGeometry args={[1.4, 1.6, 0.15]} />
        <meshStandardMaterial color={gateColor} roughness={0.85} />
      </mesh>
      {/* gate arch light */}
      <pointLight ref={light} position={[0, 0.6, -2.35]} color="#ffaf3c" intensity={2.5} distance={6} decay={2} />

      {/* Championship emblem — golden ring above gate */}
      <mesh position={[0, 2.1, -2.5]}>
        <torusGeometry args={[0.35, 0.06, 8, 24]} />
        <meshStandardMaterial color="#FFD54A" emissive="#FF9A3C" emissiveIntensity={0.9} />
      </mesh>

      {/* Twin heraldic lion banners flanking the gate — the reference's
          signature blue drapes with a gold lion emblem. */}
      {[-0.9, 0.9].map((x, i) => (
        <group key={i} position={[x, 1.5, -2.62]}>
          <mesh castShadow>
            <planeGeometry args={[0.6, 1.7]} />
            <meshStandardMaterial color={lionBannerBlue} roughness={0.7} side={THREE.DoubleSide} />
          </mesh>
          {/* gold lion silhouette approximated with two triangles */}
          <mesh position={[0, 0.05, 0.01]}>
            <planeGeometry args={[0.28, 0.4]} />
            <meshStandardMaterial color="#FFD54A" emissive="#FF9A3C" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ))}

      {/* Side wall banners */}
      <Banner position={[-2.4, 1.6, 0]} rotation={[0, Math.PI / 2, 0]} color={lionBannerBlue} />
      <Banner position={[2.4, 1.6, 0]} rotation={[0, -Math.PI / 2, 0]} color={lionBannerBlue} />
    </group>
  );
}
