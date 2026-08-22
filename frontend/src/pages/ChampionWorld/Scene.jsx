/**
 * Scene — root of the R3F canvas. Assembles all pieces of Championship 1
 * and stages Championship 2 fog behind Castle 1.
 */
import { useRef, Suspense } from 'react';
import Sky from './Sky';
import Terrain from './Terrain';
import Path from './Path';
import Water from './Water';
import Vegetation from './Vegetation';
import Village from './Village';
import Castle from './Castle';
import LevelNodes from './LevelNodes';
import GLTFChampion from './GLTFChampion';
import Particles from './Particles';
import BiomeExtras from './BiomeExtras';
import EnvGLB, { preloadEnvAssets } from './EnvGLB';
import CameraRig from './CameraRig';

// Preload any Meshy GLBs that have URLs in the registry
preloadEnvAssets();

export default function Scene({ gender, championRef, onWorldReady }) {
  const _localRef = useRef();
  const ref = championRef || _localRef;

  return (
    <>
      <Sky />

      {/* Warm golden-hour sun + soft fill */}
      <directionalLight
        position={[30, 30, 10]}
        intensity={2.4}
        color="#fff2c8"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />
      <hemisphereLight args={['#b7cfff', '#4b3a2b', 0.7]} />
      <ambientLight intensity={0.15} />

      {/* Distant mystery fog for Championship 2 tease */}
      <fog attach="fog" args={['#a8b8d8', 30, 90]} />

      <Terrain />
      <Vegetation />
      <Water />
      <Village />
      <Path />
      <LevelNodes />

      {/* Championship 1 Castle at t=0.65 */}
      <Castle position={[44, 3.2, 6]} variant="gold" />

      {/* Championship 2 — locked, further away, half-shrouded */}
      <group position={[56, 2.4, 16]} scale={0.85}>
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[3, 2.4, 3]} />
          <meshStandardMaterial color="#8f8898" roughness={0.9} />
        </mesh>
        {/* barrier fog */}
        <mesh position={[0, 0.6, -1.5]}>
          <planeGeometry args={[4, 3]} />
          <meshBasicMaterial color="#c8c4dc" transparent opacity={0.6} />
        </mesh>
      </group>

      <Particles />
      <BiomeExtras />

      {/*
        MESHY ENVIRONMENT SLOTS.
        Each <EnvGLB slot="..."/> renders NOTHING until its URL lands in
        `envAssets.js` — placeholders above keep the world alive during
        asset generation. Order below matches user's pilot list:
        castle → gate → house → bridge → cherryTree.
      */}
      <EnvGLB slot="castle" />
      <EnvGLB slot="entryGate" />
      <EnvGLB slot="house_A" instanced />
      <EnvGLB slot="house_B" instanced />
      <EnvGLB slot="house_C" instanced />
      <EnvGLB slot="bridge" />
      <EnvGLB slot="windmill" />
      <EnvGLB slot="marketTent" instanced />
      <EnvGLB slot="waterfall" />
      <EnvGLB slot="cherryTree" instanced />
      <EnvGLB slot="spruceTree" instanced />
      <EnvGLB slot="ruinArch" />
      <EnvGLB slot="watchtower" />
      <EnvGLB slot="fountain" />
      <EnvGLB slot="rocks" instanced />

      {/* Real Meshy GLB champion — wrapped in Suspense because useGLTF()
          suspends until the model + animations are ready. The rest of the
          world keeps rendering behind the loader. */}
      <Suspense fallback={null}>
        <GLTFChampion ref={ref} gender={gender} initialT={0.30} />
      </Suspense>
      <CameraRig target={ref} />

      {/* Notify parent once first frame renders */}
      <FrameOnce onReady={onWorldReady} />
    </>
  );
}

function FrameOnce({ onReady }) {
  const done = useRef(false);
  // A tiny inline invalidation just fires the ready callback on mount
  if (!done.current && onReady) { done.current = true; setTimeout(onReady, 60); }
  return null;
}
