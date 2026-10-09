import * as THREE from 'three';
import type { Input } from './input';
import { ROOM_BOUNDS, type Collider, type WorldBounds } from './world';
import { CharacterRig } from './character';
export class Player {
  group = new THREE.Group();
  velocity = new THREE.Vector3();
  grounded = true;
  groundHeight = 0;
  private stepTime = 0;
  private coyoteTime = 0;
  private jumpBuffer = 0;
  private rig = new CharacterRig();
  constructor() {
    this.group.add(this.rig.group);
  }
  private blocked(x: number, z: number, colliders: Collider[], bounds: WorldBounds) {
    const r = .28;
    return x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ || colliders.some(c => this.group.position.y < c.height && x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ);
  }
  update(dt: number, input: Input, yaw: number, colliders: Collider[], footstep: () => void, bounds: WorldBounds = ROOM_BOUNDS) {
    const k = input.keys; const x = Number(k.has('KeyD')) - Number(k.has('KeyA')); const z = Number(k.has('KeyS')) - Number(k.has('KeyW'));
    const length = Math.hypot(x, z) || 1; const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? 4.5 : 2.65;
    const dx = (x * Math.cos(yaw) + z * Math.sin(yaw)) / length * speed;
    const dz = (-x * Math.sin(yaw) + z * Math.cos(yaw)) / length * speed;
    const ease = 1 - Math.exp(-(x || z ? this.grounded ? 15 : 7 : 21) * dt);
    this.velocity.x += (dx - this.velocity.x) * ease; this.velocity.z += (dz - this.velocity.z) * ease;
    this.coyoteTime = this.grounded ? .09 : Math.max(0, this.coyoteTime - dt);
    if (k.has('Space')) { this.jumpBuffer = .11; k.delete('Space'); } else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyoteTime > 0) { this.velocity.y = 5.4; this.grounded = false; this.coyoteTime = 0; this.jumpBuffer = 0; }
    this.velocity.y -= 16 * dt;
    const p = this.group.position;
    const nx = p.x + this.velocity.x * dt; if (!this.blocked(nx, p.z, colliders, bounds)) p.x = nx; else this.velocity.x = 0;
    const nz = p.z + this.velocity.z * dt; if (!this.blocked(p.x, nz, colliders, bounds)) p.z = nz; else this.velocity.z = 0;
    const prevY = p.y; p.y += this.velocity.y * dt;
    let floor = 0;
    for (const c of colliders) if (p.x > c.minX - .2 && p.x < c.maxX + .2 && p.z > c.minZ - .2 && p.z < c.maxZ + .2 && prevY >= c.height - .02) floor = Math.max(floor, c.height);
    this.groundHeight = floor;
    if (p.y <= floor) { if (!this.grounded && this.velocity.y < -1) this.rig.land(-this.velocity.y); p.y = floor; this.velocity.y = 0; this.grounded = true; } else this.grounded = false;
    const moving = Math.hypot(this.velocity.x, this.velocity.z);
    let turn = 0;
    if (moving > .05) { const target = Math.atan2(-this.velocity.x, -this.velocity.z); turn = Math.atan2(Math.sin(target - this.group.rotation.y), Math.cos(target - this.group.rotation.y)); this.group.rotation.y += turn * (1 - Math.exp(-15 * dt)); }
    this.rig.update(dt, moving, this.grounded, this.velocity.y, turn);
    if (moving > .3 && this.grounded) { this.stepTime += dt; if (this.stepTime > (speed > 3 ? .28 : .43)) { this.stepTime = 0; footstep(); } } else this.stepTime = 0;
  }
  reset(position: THREE.Vector3, yaw = 0) { this.group.position.copy(position); this.velocity.set(0, 0, 0); this.group.rotation.y = yaw; this.groundHeight = position.y; this.grounded = true; this.jumpBuffer = this.coyoteTime = 0; }
  dispose() { this.rig.dispose(); }
}
