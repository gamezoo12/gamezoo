/**
 * Path — the winding road built from a TubeGeometry ribbon along the spline.
 * Renders a warm sandstone road with a subtle emissive gold trim so it
 * always reads clearly against the meadow / forest.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { PATH_CURVE } from './worldConfig';

export default function Path() {
  const [roadGeom, trimGeom] = useMemo(() => {
    // Extract points, then build a flat ribbon by offsetting perpendicular
    // to the tangent in world XZ. TubeGeometry gives us a rounded cylinder,
    // but we want a flat road — so we sample the curve manually.
    const N = 240;
    const roadWidth = 1.35;
    const trimWidth = 1.55;
    const roadV = new Float32Array((N * 2) * 3);
    const trimV = new Float32Array((N * 2) * 3);
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const p = PATH_CURVE.getPointAt(t);
      const tan = PATH_CURVE.getTangentAt(t).setY(0).normalize();
      const side = new THREE.Vector3().crossVectors(up, tan).normalize();
      const a = p.clone().addScaledVector(side, roadWidth);
      const b = p.clone().addScaledVector(side, -roadWidth);
      const ea = p.clone().addScaledVector(side, trimWidth);
      const eb = p.clone().addScaledVector(side, -trimWidth);
      // hover a hair above terrain so we don't z-fight
      a.y += 0.06; b.y += 0.06; ea.y += 0.02; eb.y += 0.02;
      roadV.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      trimV.set([ea.x, ea.y, ea.z, eb.x, eb.y, eb.z], i * 6);
    }

    const buildStrip = (verts) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      const idx = [];
      for (let i = 0; i < N - 1; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    return [buildStrip(roadV), buildStrip(trimV)];
  }, []);

  return (
    <group>
      {/* Gold glowing trim underneath */}
      <mesh geometry={trimGeom}>
        <meshStandardMaterial
          color="#e8b566"
          emissive="#c78a2a"
          emissiveIntensity={0.25}
          roughness={0.6}
        />
      </mesh>
      {/* Warm stone road */}
      <mesh geometry={roadGeom} receiveShadow>
        <meshStandardMaterial color="#b39169" roughness={0.9} metalness={0} />
      </mesh>
    </group>
  );
}
