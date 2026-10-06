import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Bake constant linear-space tints into vertices, sharing only identical surfaces.
 * Collision meshes and moving objects must be excluded by the caller. */
export function batchStaticColors(root: THREE.Group, excluded: ReadonlySet<THREE.Mesh>, geometries: Set<THREE.BufferGeometry>, materials: Set<THREE.Material>) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[]>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || object instanceof THREE.SkinnedMesh || excluded.has(object)) return;
    const m = object.material;
    if (!(m instanceof THREE.MeshStandardMaterial) || m.type !== 'MeshStandardMaterial' || m.vertexColors || m.transparent || m.alphaTest || m.clippingPlanes || object.morphTargetInfluences) return;
    if (m.normalMap || m.alphaMap || m.emissiveMap || m.displacementMap || m.roughnessMap || m.metalnessMap || m.lightMap || m.aoMap || m.envMap) return;
    if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return;
    const key = JSON.stringify([m.map?.uuid, m.bumpMap?.uuid, m.bumpScale, m.roughness, m.metalness, m.emissive.getHex(), m.emissiveIntensity, m.side, m.flatShading, m.fog, m.depthWrite, m.depthTest, m.colorWrite, object.castShadow, object.receiveShadow, object.renderOrder]);
    const list = batches.get(key) ?? []; list.push(object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>); batches.set(key, list);
  });
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(mesh => {
      const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      const count = geo.getAttribute('position').count, tint = mesh.material.color;
      const color = new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3);
      for (let i = 0; i < count; i++) color.setXYZ(i, tint.r, tint.g, tint.b);
      geo.setAttribute('color', color); return geo;
    });
    const geo = mergeGeometries(parts); parts.forEach(part => part.dispose());
    if (!geo) continue;
    const source = meshes[0], material = source.material.clone(); material.color.setRGB(1, 1, 1); material.vertexColors = true;
    geometries.add(geo); materials.add(material);
    const mesh = new THREE.Mesh(geo, material); mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow; mesh.renderOrder = source.renderOrder;
    root.add(mesh); meshes.forEach(part => part.removeFromParent());
  }
  // Source meshes are gone; retain only geometries still used by the room.
  const live = new Set<THREE.BufferGeometry>(); root.traverse(o => { if (o instanceof THREE.Mesh) live.add(o.geometry); });
  for (const geo of geometries) if (!live.has(geo)) { geo.dispose(); geometries.delete(geo); }
}
