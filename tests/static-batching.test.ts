import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { batchStaticColors } from '../src/game/static-batching';

describe('static surface batching', () => {
  it('preserves world-space geometry, linear tints, texture mapping and shadow flags', () => {
    const root = new THREE.Group(); root.position.set(3, 0, 2);
    const map = new THREE.Texture(), geos = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    const meshes = ['#56777b', '#ad6951'].map((color, i) => {
      const geo = new THREE.BoxGeometry(1, 2, 3); geos.add(geo);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, map, roughness: .76, bumpMap: map, bumpScale: .006 }));
      mesh.position.set(i * 4, 1, 0); mesh.rotation.y = i * .4; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh;
    });
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root), colors = meshes.map(m => m.material.color.clone());
    const original = meshes.map(m => m.geometry.toNonIndexed().applyMatrix4(m.matrix));
    batchStaticColors(root, new Set(), geos, materials);
    expect(root.children).toHaveLength(1);
    const merged = root.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    expect(new THREE.Box3().setFromObject(root).min.distanceTo(bounds.min)).toBeLessThan(.00001);
    expect(new THREE.Box3().setFromObject(root).max.distanceTo(bounds.max)).toBeLessThan(.00001);
    expect(merged.castShadow && merged.receiveShadow).toBe(true);
    expect(merged.material.map).toBe(map); expect(merged.material.bumpMap).toBe(map);
    expect(merged.material.roughness).toBe(.76); expect(merged.material.bumpScale).toBe(.006);
    expect(merged.material.color.toArray()).toEqual([1, 1, 1]);
    let vertex = 0;
    for (let j = 0; j < original.length; j++) for (let i = 0; i < original[j].getAttribute('position').count; i++, vertex++) {
      for (const name of ['position', 'normal', 'uv']) {
        const before = original[j].getAttribute(name), after = merged.geometry.getAttribute(name);
        expect(after.getX(vertex)).toBeCloseTo(before.getX(i), 5); expect(after.getY(vertex)).toBeCloseTo(before.getY(i), 5);
        if (name !== 'uv') expect(after.getZ(vertex)).toBeCloseTo(before.getZ(i), 5);
      }
      const color = merged.geometry.getAttribute('color');
      expect(color.getX(vertex)).toBeCloseTo(colors[j].r, 6); expect(color.getY(vertex)).toBeCloseTo(colors[j].g, 6); expect(color.getZ(vertex)).toBeCloseTo(colors[j].b, 6);
    }
    expect(geos.size).toBe(1); expect(materials.size).toBe(1);
  });
  it('keeps collision meshes and incompatible surfaces separate, retaining shared live geometry', () => {
    const root = new THREE.Group(), geo = new THREE.BoxGeometry(), geos = new Set([geo]), materials = new Set<THREE.Material>();
    const dispose = vi.spyOn(geo, 'dispose');
    const props = [0, 0, 0, .4].map(roughness => new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness })));
    props.forEach(p => root.add(p));
    batchStaticColors(root, new Set([props[2]]), geos, materials);
    expect(root.children).toHaveLength(3); expect(root.children).toContain(props[2]); expect(root.children).toContain(props[3]);
    expect(dispose).not.toHaveBeenCalled();
  });
  it('does not merge differing shadow participation', () => {
    const root = new THREE.Group(), geos = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    for (const cast of [true, false]) { const geo = new THREE.BoxGeometry(); geos.add(geo); const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial()); mesh.castShadow = cast; root.add(mesh); }
    batchStaticColors(root, new Set(), geos, materials); expect(root.children).toHaveLength(2);
  });
});
