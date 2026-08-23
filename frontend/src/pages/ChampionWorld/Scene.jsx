/**
 * Scene — root of the R3F canvas for Championship 1.
 *
 * Composition (near → far):
 *   Foreground: Champion, level markers, road, chunk-1 GLBs, water
 *   Midground : rolling terrain (procedural), village plateau, valley
 *   Background: distant mountain ridges, canopy line, distant castle,
 *               drifting clouds, atmospheric fog
 *
 * The full Championship-1 route is present but only Chunk-1 (Levels 1-2)
 * is currently mounted. Chunks 3+ will register later.
 */
import { useRef, Suspense } from 'react';
import * as THREE from 'three';
import Sky from './Sky';
import Terrain from './Terrain';
import Path from './Path';
import Water from './Water';
import DistantWorld from './DistantWorld';
import GLTFChampion from './GLTFChampion';
import CameraRig from './CameraRig';
import LevelMarkers from './LevelMarkers';
import ChunkManager from './chunks/ChunkManager';
import { getPerfPolicy } from './perfPolicy';

export default function Scene({ gender, championRef, onWorldReady }) {
  const _localRef = useRef();
  const ref = championRef || _localRef;
  const policy = getPerfPolicy();

  return (
    <>
      {/* Sky dome — atmospheric, warm sun */}
      <Sky />

      {/* Warm cinematic sunlight — bright premium fantasy daylight */}
      <directionalLight
        position={[30, 45, 12]}
        intensity={3.0}
        color="#fff4d0"
        castShadow
        shadow-mapSize-width={policy.shadowMapSize}
        shadow-mapSize-height={policy.shadowMapSize}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.0004}
      />
      {/* Warm ground bounce + cool sky fill */}
      <hemisphereLight args={['#cfe2ff', '#e8c48f', 1.15]} />
      <ambientLight intensity={0.28} />

      {/* Atmospheric haze — creates distance, doesn't wash out mid-view */}
      <fog attach="fog" args={['#dce7f5', 45, 150]} />

      {/* Far world: mountains, canopy silhouettes, distant castle, clouds */}
      <DistantWorld />

      {/* Mid/near world */}
      <Terrain />
      <Path />
      <Water />

      {/* Only Level-1 and Level-2 markers mount for the vertical slice. */}
      <LevelMarkers range={[0.00, 0.13]} championRef={ref} />

      {/* Chunked, streaming environment. Only Chunk 1 is registered. */}
      <Suspense fallback={null}>
        <ChunkManager championRef={ref} />
      </Suspense>

      {/* Real Meshy GLB champion — spawned AT Level 1 so the first frame
          shows Champion standing on the current-level marker. */}
      <Suspense fallback={null}>
        <GLTFChampion ref={ref} gender={gender} initialT={0.03} />
      </Suspense>
      <CameraRig target={ref} />

      <FrameOnce onReady={onWorldReady} />
    </>
  );
}

function FrameOnce({ onReady }) {
  const done = useRef(false);
  if (!done.current && onReady) { done.current = true; setTimeout(onReady, 60); }
  return null;
}
