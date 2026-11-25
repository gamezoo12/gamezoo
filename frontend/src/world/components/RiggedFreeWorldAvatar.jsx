import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Box3, DoubleSide, SRGBColorSpace, TextureLoader } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import FreeWorldAvatar, { getFreeWorldAvatarData } from './FreeWorldAvatar';

const ASSET_REVISION = '0a3e77659d16ab152486f54013d453c4344509e7';
const ASSET_ROOT = `https://raw.githubusercontent.com/gamezoo12/gamezoo/${ASSET_REVISION}/unity-assets/LowPolyMedievalFantasyHeroes/LowPolyMedievalFantasyHeroes`;
const NPC_ROOT = `${ASSET_ROOT}/NPCs/NPC`;
const TEXTURE_ROOT = `${ASSET_ROOT}/Materials_Shaders_Textures`;
const MALE_MODELS = ['M_Commoner', 'M_Blacksmith', 'M_Cook', 'M_Healer', 'M_King', 'M_Merchant', 'M_Noble', 'M_Priest'];
const FEMALE_MODELS = ['F_Commoner', 'F_Blacksmith', 'F_Cook', 'F_Healer', 'F_Merchant', 'F_Noble', 'F_Nun', 'F_Queen'];

function assetVariant(avatar) {
  const number = Number(avatar.id.match(/\d+$/)?.[0] || 1);
  const models = avatar.gender === 'Female' ? FEMALE_MODELS : MALE_MODELS;
  const model = models[(number - 1) % models.length];
  const bodyColor = ((number - 1) % 8) + 1;
  const objectColor = ((number * 3 + (avatar.actionStyle || 0)) % 16) + 1;
  return {
    modelUrl: `${NPC_ROOT}/${model}.fbx`,
    bodyTextureUrl: `${TEXTURE_ROOT}/BodyPreColors/medievalTexture_bodyColor${bodyColor}.png`,
    objectTextureUrl: `${TEXTURE_ROOT}/ObjectPreColors/medievalTexture_objectColor${objectColor}.png`,
  };
}

function AvatarProp({ type, accent }) {
  if (type === 'sword') return <group rotation={[0.15, 0, -0.22]}>
    <mesh position={[0, 0.23, 0]}><boxGeometry args={[0.055, 0.5, 0.025]} /><meshStandardMaterial color="#d9e3ed" metalness={0.78} roughness={0.22} /></mesh>
    <mesh position={[0, -0.06, 0]}><boxGeometry args={[0.2, 0.045, 0.04]} /><meshStandardMaterial color={accent} metalness={0.6} roughness={0.3} /></mesh>
    <mesh position={[0, -0.17, 0]}><cylinderGeometry args={[0.028, 0.028, 0.19, 8]} /><meshStandardMaterial color="#76503a" roughness={0.8} /></mesh>
  </group>;
  if (type === 'hammer') return <group rotation={[0, 0, -0.2]}>
    <mesh><cylinderGeometry args={[0.025, 0.03, 0.48, 9]} /><meshStandardMaterial color="#76503a" roughness={0.8} /></mesh>
    <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.25, 0.12, 0.13]} /><meshStandardMaterial color={accent} metalness={0.35} roughness={0.42} /></mesh>
  </group>;
  if (type === 'guitar') return <group rotation={[0, 0, -0.28]}>
    <mesh position={[0, -0.13, 0]} scale={[0.16, 0.2, 0.055]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={accent} roughness={0.4} /></mesh>
    <mesh position={[0.09, 0.11, 0]} rotation={[0, 0, -0.35]}><boxGeometry args={[0.065, 0.39, 0.045]} /><meshStandardMaterial color="#76503a" roughness={0.7} /></mesh>
    <mesh position={[0.09, 0.11, 0.03]} rotation={[0, 0, -0.35]}><boxGeometry args={[0.008, 0.37, 0.006]} /><meshStandardMaterial color="#f6e8c9" metalness={0.2} /></mesh>
  </group>;
  if (type === 'shield') return <mesh><sphereGeometry args={[0.2, 16, 12]} /><meshStandardMaterial color={accent} metalness={0.42} roughness={0.38} /></mesh>;
  if (type === 'flute' || type === 'saxophone') return <group rotation={[0, 0, -0.35]}>
    <mesh><cylinderGeometry args={[0.035, 0.035, 0.42, 12]} /><meshStandardMaterial color="#d8b665" metalness={0.55} roughness={0.28} /></mesh>
    {type === 'saxophone' && <mesh position={[0, -0.18, 0]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.1, 0.025, 8, 14]} /><meshStandardMaterial color="#d8b665" metalness={0.55} roughness={0.28} /></mesh>}
  </group>;
  return <group rotation={[0, 0, -0.18]}>
    <mesh><cylinderGeometry args={[0.03, 0.03, 0.48, 10]} /><meshStandardMaterial color="#79563a" roughness={0.8} /></mesh>
    <mesh position={[0, 0.27, 0]}><sphereGeometry args={[0.075, 12, 10]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.18} /></mesh>
  </group>;
}

function ActionProp({ model, avatar }) {
  const group = useRef();
  useEffect(() => {
    const hand = model.getObjectByName('R_equip_joint') || model.getObjectByName('R_wrist_joint');
    const prop = group.current;
    if (!hand || !prop) return undefined;
    hand.add(prop);
    prop.position.set(0.015, 0.015, 0.02);
    prop.rotation.set(0, 0, -0.25);
    return () => hand.remove(prop);
  }, [model]);
  return <group ref={group} scale={0.7}><AvatarProp type={avatar.actionProp} accent={avatar.accent || '#e5c466'} /></group>;
}

function RiggedModel({ avatar, action, walking }) {
  const assets = useMemo(() => assetVariant(avatar), [avatar]);
  const baseModel = useLoader(FBXLoader, assets.modelUrl);
  const [bodyTexture, objectTexture] = useLoader(TextureLoader, [assets.bodyTextureUrl, assets.objectTextureUrl]);
  const model = useMemo(() => {
    const instance = cloneSkinned(baseModel);
    const box = new Box3().setFromObject(instance);
    const height = box.max.y - box.min.y || 1;
    const scale = 2.15 / height;
    instance.scale.setScalar(scale);
    instance.position.set(-((box.min.x + box.max.x) * scale) / 2, -box.min.y * scale, -((box.min.z + box.max.z) * scale) / 2);
    return instance;
  }, [baseModel]);
  useEffect(() => {
    bodyTexture.colorSpace = SRGBColorSpace;
    objectTexture.colorSpace = SRGBColorSpace;
    bodyTexture.flipY = false;
    objectTexture.flipY = false;
    bodyTexture.anisotropy = 8;
    objectTexture.anisotropy = 8;
    model.traverse((object) => {
      if (!object.isMesh) return;
      const replaceMap = (material) => {
        const mapped = material.clone();
        mapped.map = String(material.name || '').toLowerCase().includes('body') ? bodyTexture : objectTexture;
        mapped.color.set('#ffffff');
        mapped.roughness = 0.78;
        mapped.metalness = 0;
        mapped.side = DoubleSide;
        mapped.alphaTest = 0;
        mapped.transparent = false;
        mapped.needsUpdate = true;
        return mapped;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(replaceMap)
        : replaceMap(object.material);
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;
    });
  }, [bodyTexture, model, objectTexture]);
  const bones = useMemo(() => {
    const findBones = (name) => {
      const matches = [];
      model.traverse((object) => {
        if (object.isBone && object.name === name) matches.push(object);
      });
      return matches;
    };
    return {
      root: findBones('pelvis_joint'),
      chest: findBones('chest_joint'),
      leftArm: findBones('L_shoulder_joint'),
      rightArm: findBones('R_shoulder_joint'),
      leftElbow: findBones('L_elbow_joint'),
      rightElbow: findBones('R_elbow_joint'),
      leftLeg: findBones('L_thigh_joint'),
      rightLeg: findBones('R_thigh_joint'),
      leftKnee: findBones('L_knee_joint'),
      rightKnee: findBones('R_knee_joint'),
    };
  }, [model]);
  const restTransforms = useMemo(() => Object.values(bones).flat().map((bone) => ({
    bone,
    position: bone.position.clone(),
    rotation: bone.rotation.clone(),
  })), [bones]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    const step = Math.sin(time * 10.5) * 0.48;
    const pose = action > 0 ? (action - 1 + (avatar.actionStyle || 0)) % 5 : -1;
    restTransforms.forEach(({ bone, position, rotation }) => {
      bone.position.copy(position);
      bone.rotation.copy(rotation);
    });
    const rotate = (entries, axis, amount) => entries.forEach((bone) => { bone.rotation[axis] += amount; });
    if (walking) {
      rotate(bones.leftLeg, 'x', step);
      rotate(bones.rightLeg, 'x', -step);
      rotate(bones.leftKnee, 'x', Math.max(0, -step) * 0.8);
      rotate(bones.rightKnee, 'x', Math.max(0, step) * 0.8);
      if (bones.leftArm) {
        rotate(bones.leftArm, 'x', 0.52 - step * 0.38);
      }
      if (bones.rightArm) {
        rotate(bones.rightArm, 'x', -(0.52 - step * 0.38));
      }
      bones.root.forEach((bone) => { bone.position.y += Math.abs(step) * 0.035; });
      return;
    }
    rotate(bones.leftArm, 'x', 0.52);
    rotate(bones.rightArm, 'x', -0.52);
    if (pose === -1) {
      rotate(bones.chest, 'z', Math.sin(time * 2.2) * 0.025);
      rotate(bones.root, 'y', Math.sin(time * 0.8) * 0.08);
      rotate(bones.leftArm, 'x', Math.sin(time * 1.5) * 0.025);
      rotate(bones.rightArm, 'x', -Math.sin(time * 1.5) * 0.025);
      return;
    }
    if (pose === 0) rotate(bones.rightArm, 'x', 2.35 + Math.sin(time * 9) * 0.22);
    if (pose === 1) {
      rotate(bones.leftArm, 'x', -2.25);
      rotate(bones.rightArm, 'x', 2.25);
      bones.root.forEach((bone) => { bone.position.y += Math.abs(Math.sin(time * 5)) * 0.12; });
    }
    if (pose === 2) {
      rotate(bones.root, 'y', Math.sin(time * 1.8) * 0.8);
      rotate(bones.leftArm, 'x', -0.35);
      rotate(bones.rightArm, 'x', 0.35);
    }
    if (pose === 3) {
      rotate(bones.chest, 'z', Math.sin(time * 5) * 0.18);
      rotate(bones.leftArm, 'x', -(1.8 + Math.sin(time * 7) * 0.28));
      rotate(bones.rightArm, 'x', 1.8 + Math.sin(time * 7) * 0.28);
    }
    if (pose === 4) {
      rotate(bones.leftArm, 'x', 0.1);
      rotate(bones.rightArm, 'x', -0.1);
      rotate(bones.leftElbow, 'z', 0.55);
      rotate(bones.rightElbow, 'z', -0.35);
    }
  });

  return <group rotation={[0, 0.25, 0]}><primitive object={model} />{action > 0 && !walking && <ActionProp model={model} avatar={avatar} />}</group>;
}

export default function RiggedFreeWorldAvatar({ avatarId, action = 0, walking = false, view = 'preview', className = '', style, testId = 'free-world-avatar-3d' }) {
  const avatar = getFreeWorldAvatarData(avatarId);
  const mapView = view === 'map';
  const cameraPosition = mapView ? [0.18, 1.48, 2.45] : [0.15, 1.46, 2.7];
  const cameraTargetY = mapView ? 1.38 : 1.36;
  const fallback = <FreeWorldAvatar avatarId={avatar.id} action={action} className="h-full w-full" />;
  return (
    <div className={className} style={{ position: 'relative', ...style }} data-testid={testId} data-avatar-id={avatar.id} data-avatar-action={action || undefined} data-action-prop={action ? avatar.actionProp : undefined} aria-hidden="true">
      <Canvas dpr={[1, 2]} camera={{ position: cameraPosition, fov: 32 }} onCreated={({ camera }) => { camera.lookAt(0, cameraTargetY, 0); camera.updateProjectionMatrix(); }} gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }} fallback={fallback} style={{ background: 'transparent', pointerEvents: 'none' }}>
        <ambientLight intensity={0.72} />
        <hemisphereLight args={['#f5f0e9', '#58636b', 0.85]} />
        <directionalLight position={[2.8, 4.2, 3.5]} intensity={2.2} castShadow shadow-mapSize={[512, 512]} />
        <directionalLight position={[-3, 1.8, -2]} intensity={1.1} color="#b7d4ff" />
        <pointLight position={[-1.4, 1.5, 2.4]} intensity={0.45} color="#fff1d2" />
        <Suspense fallback={null}><group scale={mapView ? 1.06 : 1}><RiggedModel avatar={avatar} action={action} walking={walking} /></group></Suspense>
      </Canvas>
    </div>
  );
}