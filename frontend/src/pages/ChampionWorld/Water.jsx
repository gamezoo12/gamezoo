/**
 * Water — animated river, waterfall, and lake. All GPU-side shader work,
 * so the CPU only pays for a single draw call per water body.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const vs = `
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// River water — depth-tinted blue with animated wave-crest highlights.
const riverFs = `
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
varying vec2 vUv;
varying vec3 vWorldPos;

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));vec2 u=f*f*(3.0-2.0*f);return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;}

void main() {
  float t = uTime * 0.4;
  float w1 = n(vWorldPos.xz * 0.6 + vec2(t, t*0.7));
  float w2 = n(vWorldPos.xz * 1.3 - vec2(t*0.5, t));
  float waves = smoothstep(0.55, 0.85, w1 * 0.7 + w2 * 0.4);
  vec3 base = mix(uDeep, uShallow, w2);
  vec3 col = mix(base, vec3(1.0), waves * 0.6);
  gl_FragColor = vec4(col, 0.88);
}
`;

// Waterfall — vertical streaks with downward-drifting bright cells.
const fallFs = `
uniform float uTime;
varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));vec2 u=f*f*(3.-2.*f);return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;}
void main() {
  vec2 uv = vUv;
  float streak = pow(smoothstep(0.35, 0.5, n(uv * vec2(24.0, 3.0) + vec2(0.0, -uTime * 3.0))), 1.6);
  float side = smoothstep(0.0, 0.15, uv.x) * smoothstep(0.0, 0.15, 1.0 - uv.x);
  vec3 col = mix(vec3(0.42, 0.78, 0.92), vec3(1.0), streak);
  gl_FragColor = vec4(col, 0.85 * side);
}
`;

export default function Water() {
  const river = useRef();
  const fall = useRef();
  const lake = useRef();

  const riverMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vs, fragmentShader: riverFs, transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color('#8ffae2') },
      uDeep:    { value: new THREE.Color('#0f9b8a') },
    },
  }), []);
  const fallMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vs, fragmentShader: fallFs, transparent: true,
  uniforms: { uTime: { value: 0 } },
  }), []);

  useFrame((state, dt) => {
    riverMat.uniforms.uTime.value += dt;
    fallMat.uniforms.uTime.value += dt;
  });

  return (
    <group>
      {/* River bed running through the valley — matches the terrain dip */}
      <mesh ref={river} position={[24, 0.15, 4]} rotation={[-Math.PI / 2, 0, 0.15]} material={riverMat}>
        <planeGeometry args={[24, 4, 2, 2]} />
      </mesh>

      {/* Small lake near village */}
      <mesh ref={lake} position={[15, 0.14, 6]} rotation={[-Math.PI / 2, 0, 0]} material={riverMat}>
        <circleGeometry args={[3.2, 32]} />
      </mesh>

      {/* Waterfall dropping from cliff into river */}
      <mesh ref={fall} position={[36, 2.4, -3]} rotation={[0, -0.4, 0]} material={fallMat}>
        <planeGeometry args={[2.4, 5.2]} />
      </mesh>
      {/* Waterfall base mist */}
      <mesh position={[36, 0.2, -2.7]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.6, 24]} />
        <meshBasicMaterial color="#e0f4ff" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}
