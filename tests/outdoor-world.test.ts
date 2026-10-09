import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildOutdoorWorld, OUTDOOR_CONFIG } from '../src/game/outdoor-world';
import { InteractionSystem } from '../src/game/interaction';

describe('outdoor foundation', () => {
  it('has real ground, a clear outward-facing spawn and a reachable home entrance', () => {
    const w = buildOutdoorWorld();
    try {
      const ground = w.group.getObjectByName('baseplate') as THREE.Mesh;
      const dimensions = new THREE.Box3().setFromObject(ground);
      expect(dimensions.max.y).toBeCloseTo(0, 7); expect(dimensions.getSize(new THREE.Vector3()).x).toBe(120);
      expect(w.colliders.some(c => c.height > 0 && w.spawn.x >= c.minX - .28 && w.spawn.x <= c.maxX + .28 && w.spawn.z >= c.minZ - .28 && w.spawn.z <= c.maxZ + .28)).toBe(false);
      expect(w.spawnYaw).toBe(0); expect(w.spawn.z).toBeLessThan(w.interactions[0].position.z);
      expect(new InteractionSystem().find(w.interactions[0].position, true, w)?.destination).toBe('home');
      expect(w.group.getObjectByName('world-objects')?.children.map(c => c.name)).toEqual(['player-house']);
      expect(w.cameraMeshes).toHaveLength(2);
    } finally { w.dispose(); }
  });
  it('resizes the baseplate and bounds together without changing the entrance contract', () => {
    const w = buildOutdoorWorld({ ...OUTDOOR_CONFIG, width: 180, depth: 160 });
    expect(w.bounds).toEqual({ minX: -89.65, maxX: 89.65, minZ: -79.65, maxZ: 79.65 });
    expect(w.colliders[0]).toMatchObject({ minX: -90, maxX: 90, minZ: -80, maxZ: 80, height: 0 });
    expect(w.interactions[0]).toMatchObject({ label: 'Go Inside', action: 'door', destination: 'home' });
    w.dispose(); expect(w.group.children).toHaveLength(0);
  });
});
