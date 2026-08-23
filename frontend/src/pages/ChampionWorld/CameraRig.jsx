/**
 * CameraRig — smooth 3rd-person follow with per-breakpoint framing.
 *
 * Mobile:  shows current + next Level (~2 destinations).
 * Tablet:  ~2-3.
 * Desktop: ~3-4 with cinematic composition.
 *
 * Camera sits behind + above the champion, looks slightly ahead along the
 * spline direction. Smooth damping avoids snap/motion-sickness.
 *
 * Also stores a look-at target that slides forward with the champion so we
 * see WHERE they are heading — matches the "read the next Level" UX rule.
 */
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAMERA_PRESETS } from './worldConfig';

function pickPreset() {
  if (typeof window === 'undefined') return CAMERA_PRESETS.desktop;
  const w = window.innerWidth;
  if (w < 640)  return CAMERA_PRESETS.mobile;
  if (w < 1024) return CAMERA_PRESETS.tablet;
  return CAMERA_PRESETS.desktop;
}

export default function CameraRig({ target }) {
  const { camera, size } = useThree();
  const desiredCamPos = useRef(new THREE.Vector3());
  const smoothedCamPos = useRef(new THREE.Vector3(10, 8, -8));
  const smoothedLook = useRef(new THREE.Vector3(2, 1, 2));
  const desiredLook = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const preset = pickPreset();

    // Portrait mobile → widen the frustum vertically because the useful
    // horizontal information sits in the narrow strip. We nudge FOV up
    // slightly on tall aspect ratios.
    const aspect = size.width / size.height;
    let fov = preset.fov;
    if (aspect < 0.7) fov += 6;              // very narrow portrait
    else if (aspect < 1.0) fov += 3;          // portrait

    camera.fov = fov;
    camera.updateProjectionMatrix();

    if (!target?.current) return;
    const pos = target.current.getWorldPos?.();
    const forward = target.current.getForwardTangent?.();
    if (!pos) return;

    const tan = forward || new THREE.Vector3(1, 0, 1).normalize();

    // Elevated cinematic 3rd-person: camera pulled behind AND above.
    desiredCamPos.current.set(
      pos.x - tan.x * preset.distance,
      preset.height,                             // absolute height (not offset)
      pos.z - tan.z * preset.distance,
    );

    const damp = 1 - Math.exp(-dt * 4.0);
    smoothedCamPos.current.lerp(desiredCamPos.current, damp);
    camera.position.copy(smoothedCamPos.current);

    // Look ahead at ground level so we see the winding road ahead + Level 2.
    desiredLook.current.set(
      pos.x + tan.x * preset.lookAhead,
      pos.y + 0.4,
      pos.z + tan.z * preset.lookAhead,
    );
    smoothedLook.current.lerp(desiredLook.current, damp);
    camera.lookAt(smoothedLook.current);
  });

  return null;
}
