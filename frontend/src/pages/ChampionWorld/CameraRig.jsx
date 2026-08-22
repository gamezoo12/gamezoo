/**
 * CameraRig — smooth 3rd-person follow with a subtle look-ahead. Framing
 * adapts per breakpoint (mobile/tablet/desktop) so 2-4 Level areas are
 * visible depending on device.
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
  const { camera } = useThree();
  const currentTarget = useRef(new THREE.Vector3());
  const desiredCamPos = useRef(new THREE.Vector3());
  const lookAt = useRef(new THREE.Vector3());
  const preset = useRef(pickPreset());

  // Re-check preset on resize
  useFrame((_, dt) => {
    preset.current = pickPreset();
    camera.fov = preset.current.fov;
    camera.updateProjectionMatrix();

    if (!target?.current) return;
    const pos = target.current.getWorldPos?.();
    if (!pos) return;

    // Smooth-follow with look-ahead offset behind the champion
    const p = preset.current;
    desiredCamPos.current.set(pos.x - p.distance * 0.55, pos.y + p.height, pos.z - p.distance * 0.85);
    currentTarget.current.lerp(desiredCamPos.current, Math.min(1, dt * 3.2));
    camera.position.copy(currentTarget.current);

    lookAt.current.set(pos.x + 1.5, pos.y + 1.0, pos.z + 2.0);
    camera.lookAt(lookAt.current);
  });

  return null;
}
