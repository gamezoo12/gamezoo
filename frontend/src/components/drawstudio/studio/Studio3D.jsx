import { Suspense, useEffect, useMemo, useState } from 'react';
import { Hosts3D } from './Hosts3D';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { drawStudioAPI } from '../../../lib/api';
import { Scenery } from './Scenery';
import { CENTER, Machine } from './Machine';
import { StudioHud } from './StudioHud';

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

// Admin-uploaded full-screen backdrop (Draw Settings), cropped to cover the canvas like CSS background-size: cover.
function Backdrop({ image }) {
  const { scene, size } = useThree();
  const tex = useMemo(() => { const t = new THREE.Texture(image); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; }, [image]);
  useEffect(() => {
    const ca = size.width / size.height;
    const ia = image.width / image.height;
    if (ca > ia) { tex.repeat.set(1, ia / ca); tex.offset.set(0, (1 - ia / ca) / 2); } else { tex.repeat.set(ca / ia, 1); tex.offset.set((1 - ca / ia) / 2, 0); }
    const prev = scene.background;
    scene.background = tex;
    return () => { scene.background = prev; };
  }, [tex, image, size, scene]);
  useEffect(() => () => tex.dispose(), [tex]);
  return null;
}

export function Studio3D({ S, view, numbers, onCanvas }) {
  const [image, setImage] = useState(null);
  useEffect(() => {
    let live = true;
    drawStudioAPI.backdropBlob().then((b) => createImageBitmap(b, { imageOrientation: 'flipY' })).then((img) => live && setImage(img)).catch(() => {});
    return () => { live = false; };
  }, []);
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
        <Scenery />
        {image && <Backdrop image={image} />}
        <Machine S={S} numbers={numbers} roundIndex={view.round} />
        <Hosts3D S={S} cast={view.cast} />
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
