import { Suspense, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { drawStudioAPI } from '../../../lib/api';
import { Scenery } from './Scenery';
import { CENTER, Machine } from './Machine';
import { StudioHud } from './StudioHud';
import { loadCanvasFonts, makeSlide } from './textures';

function CameraRig({ S }) {
  const { camera, size } = useThree();
  useFrame(({ clock }) => {
    const aspect = size.width / size.height;
    const base = 10.2 * Math.max(1, 1.45 / aspect);
    const push = S.current.stage === 'drawing' || S.current.stage === 'drawn' ? 0.88 : 1;
    const t = clock.elapsedTime;
    if (!camera.userData.framed) { camera.position.z = base * push; camera.userData.framed = true; }
    camera.position.x += (Math.sin(t * 0.12) * 0.5 - camera.position.x) * 0.03;
    camera.position.y += (2.8 + Math.sin(t * 0.09) * 0.12 - camera.position.y) * 0.03;
    camera.position.z += (base * push - camera.position.z) * 0.03;
    camera.lookAt(0, CENTER.y + 1.0, 0);
  });
  return null;
}

async function buildSlides() {
  await loadCanvasFonts();
  const data = await drawStudioAPI.backdrops().catch(() => ({ items: [] }));
  return Promise.all(data.items.map(async (item) => {
    let image = null;
    if (item.image_url) {
      try { image = await createImageBitmap(await drawStudioAPI.backdropImage(item.image_url)); } catch { image = null; }
    }
    return { ...item, texture: makeSlide(item, image) };
  }));
}

export function Studio3D({ S, view, numbers, onCanvas }) {
  const [slides, setSlides] = useState([]);
  useEffect(() => { let live = true; buildSlides().then((s) => live && setSlides(s)); return () => { live = false; }; }, []);
  return (
    <Canvas dpr={[1, 1.6]} camera={{ position: [0, 2.6, 11], fov: 40 }} gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false }}
      onCreated={({ gl }) => onCanvas?.(gl.domElement)} data-testid="draw-stage-canvas">
      <Suspense fallback={null}>
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={4} color="#ffffff" position={[0, 5, 4]} scale={[8, 2, 1]} />
          <Lightformer form="rect" intensity={3} color="#a36bff" position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
          <Lightformer form="rect" intensity={3} color="#4f8bff" position={[6, 2, 2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
          <Lightformer form="ring" intensity={2.5} color="#ffd36b" position={[0, 2, -5]} scale={3} />
        </Environment>
        <Scenery slides={slides} />
        <Machine S={S} numbers={numbers} roundIndex={view.round} />
        <CameraRig S={S} />
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={1.05} luminanceThreshold={0.62} luminanceSmoothing={0.2} />
          <Vignette eskil={false} offset={0.2} darkness={0.75} />
        </EffectComposer>
        <StudioHud S={S} view={view} />
      </Suspense>
    </Canvas>
  );
}
