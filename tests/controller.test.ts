import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Player } from '../src/game/player';
import { FollowCamera } from '../src/game/camera';
import { InteractionSystem } from '../src/game/interaction';
import type { Input } from '../src/game/input';
import type { Collider, Interactable, World } from '../src/game/world';

const input = () => ({ keys: new Set<string>(), lookX: 0, lookY: 0 }) as Input;
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(f => f()); vi.unstubAllGlobals(); });
function player() { const p = new Player(); cleanup.push(() => p.dispose()); return p; }
function move(p: Player, i: Input, frames: number, colliders: Collider[] = []) { for (let n = 0; n < frames; n++) p.update(1 / 60, i, 0, colliders, () => {}); }
function obstacle(x: number, y: number, z: number, w: number, h: number, d: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); m.position.set(x, y, z); m.updateMatrixWorld(true);
  cleanup.push(() => { m.geometry.dispose(); m.material.dispose(); }); return m;
}
function camera() { vi.stubGlobal('innerWidth', 1440); vi.stubGlobal('innerHeight', 900); return new FollowCamera(); }
function item(id: string, x: number, z: number): Interactable { return { id, label: id, action: 'desk', radius: 3, position: new THREE.Vector3(x, 0, z), anchor: new THREE.Vector3(x, 1.2, z) }; }
function world(interactions: Interactable[], cameraMeshes: THREE.Mesh[] = []) { return { interactions, cameraMeshes } as World; }

describe('grounded movement', () => {
  it('uses scene bounds outdoors while retaining room bounds by default', () => {
    const p = player(); const i = input(); i.keys.add('KeyD');
    const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
    for (let n = 0; n < 600; n++) p.update(1 / 60, i, 0, [], () => {}, bounds);
    expect(p.group.position.x).toBeGreaterThan(19.9); expect(p.group.position.x).toBeLessThanOrEqual(20);
    expect(p.velocity.x).toBe(0); expect(p.group.position.y).toBe(0);
    p.reset(new THREE.Vector3(), -Math.PI / 2); move(p, i, 300);
    expect(p.group.position.x).toBeLessThanOrEqual(5.65);
    expect(p.group.rotation.y).toBeCloseTo(-Math.PI / 2); expect(p.groundHeight).toBe(0);
  });
  it('accelerates, stops promptly, and normalizes diagonal speed', () => {
    const p = player(); const i = input(); i.keys.add('KeyW'); move(p, i, 60);
    expect(-p.velocity.z).toBeCloseTo(2.65, 3);
    i.keys.add('KeyD'); move(p, i, 60); expect(Math.hypot(p.velocity.x, p.velocity.z)).toBeCloseTo(2.65, 3);
    i.keys.clear(); const before = p.group.position.clone(); move(p, i, 30);
    expect(p.group.position.distanceTo(before)).toBeLessThan(.15); expect(p.velocity.length()).toBeLessThan(.001);
  });
  it('slides along furniture and stays within the room at sprint speed', () => {
    const p = player(); const i = input(); i.keys.add('KeyW'); i.keys.add('KeyD'); i.keys.add('ShiftLeft');
    const wall = { minX: -.3, maxX: 5.8, minZ: -2, maxZ: -1, height: 2 };
    move(p, i, 180, [wall]); expect(p.group.position.z).toBeGreaterThanOrEqual(-.72); expect(p.group.position.x).toBeGreaterThan(4);
    expect(p.group.position.x).toBeLessThanOrEqual(5.65); expect(p.group.position.y).toBe(0);
  });
  it('jumps once, lands on a low surface and returns to the floor when walking off', () => {
    const p = player(); const i = input(); const stool = { minX: -.4, maxX: .4, minZ: -.4, maxZ: .4, height: .65 };
    i.keys.add('Space'); move(p, i, 25); expect(p.group.position.y).toBeGreaterThan(.75); expect(p.grounded).toBe(false);
    move(p, i, 40, [stool]); expect(p.group.position.y).toBe(.65); expect(p.grounded).toBe(true);
    i.keys.add('KeyD'); move(p, i, 100, [stool]); expect(p.group.position.y).toBe(0); expect(p.grounded).toBe(true);
  });
  it('buffers a jump pressed just before landing without creating an automatic second jump', () => {
    const p = player(); const i = input(); p.group.position.y = .03; p.grounded = false; p.velocity.y = -2;
    i.keys.add('Space'); move(p, i, 1); expect(p.grounded).toBe(true);
    move(p, i, 1); expect(p.velocity.y).toBeGreaterThan(4); expect(p.grounded).toBe(false);
    move(p, i, 90); expect(p.group.position.y).toBe(0); expect(p.grounded).toBe(true);
  });
});

describe('follow camera collision', () => {
  it('retracts immediately before a wall and releases smoothly when it clears', () => {
    const c = camera(); c.pitch = .13; const i = input(); const target = new THREE.Vector3();
    c.update(0, target, i, 1, [], true); expect(c.camera.position.z).toBeGreaterThan(6);
    const wall = obstacle(0, 2, 2, 5, 4, .1); c.update(1 / 60, target, i, 1, [wall]);
    expect(c.camera.position.z).toBeLessThan(1.8); const near = c.camera.position.z;
    c.update(1 / 60, target, i, 1, []); expect(c.camera.position.z).toBeGreaterThan(near); expect(c.camera.position.z).toBeLessThan(3);
  });
  it('protects the lens edges even when the center ray misses a furniture corner', () => {
    const c = camera(); c.pitch = .13; const i = input(); const corner = obstacle(.18, 2, 2, .12, 4, .1);
    c.update(0, new THREE.Vector3(), i, 1, [corner], true); expect(c.camera.position.z).toBeLessThan(1.8);
  });
  it('clamps vertical orbit and smoothly returns from the desk to the player', () => {
    const c = camera(); const i = input(); const target = new THREE.Vector3(0, 0, 1);
    c.update(0, target, i, 1, [], true);
    for (let n = 0; n < 90; n++) c.focusDesk(1 / 60);
    expect(c.camera.position.distanceTo(new THREE.Vector3(-.35, 3.85, -1.6))).toBeLessThan(.01);
    const previous = c.camera.position.clone(); i.lookY = -9999; c.update(1 / 60, target, i, 1, []);
    expect(c.pitch).toBe(.13); expect(c.camera.position.distanceTo(previous)).toBeLessThan(1); expect(c.transitioning).toBe(true);
  });
});

describe('contextual interactions', () => {
  it('rejects objects beyond reach, through a wall, and while jumping', () => {
    const system = new InteractionSystem(); const desk = item('desk', 0, -2); const room = world([desk]);
    expect(system.find(new THREE.Vector3(), true, room)).toBe(desk);
    expect(system.find(new THREE.Vector3(), false, room)).toBeUndefined();
    expect(system.find(new THREE.Vector3(0, 0, 2), true, room)).toBeUndefined();
    room.cameraMeshes = [obstacle(0, 1, -1, 3, 2, .15)];
    expect(system.find(new THREE.Vector3(), true, room)).toBeUndefined();
  });
  it('keeps adjacent targets stable until the player clearly approaches the other object', () => {
    const system = new InteractionSystem(); const a = item('binder', -1, 0); const b = item('display', 1, 0); const room = world([a, b]);
    expect(system.find(new THREE.Vector3(-.1, 0, 0), true, room)).toBe(a);
    expect(system.find(new THREE.Vector3(.04, 0, 0), true, room)).toBe(a);
    expect(system.find(new THREE.Vector3(.2, 0, 0), true, room)).toBe(b);
  });
});
