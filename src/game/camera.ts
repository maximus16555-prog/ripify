import * as THREE from 'three';
import type { Input } from './input';

/** A damped follow rig with a small collision volume around the camera lens. */
export class FollowCamera {
  camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .06, 60);
  yaw = 0;
  pitch = .46;
  transitioning = false;
  private target = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private origin = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private hits: THREE.Intersection[] = [];
  private boom = 7.1;
  private wasFocused = false;
  private readonly offsets = [[0, 0], [-.18, 0], [.18, 0], [0, .16], [0, -.16]];

  private clearDistance(target: THREE.Vector3, direction: THREE.Vector3, distance: number, walls: THREE.Mesh[]) {
    this.right.set(direction.z, 0, -direction.x).normalize();
    this.up.crossVectors(direction, this.right).normalize();
    let safe = distance;
    for (const [x, y] of this.offsets) {
      this.origin.copy(target).addScaledVector(this.right, x).addScaledVector(this.up, y);
      this.ray.set(this.origin, direction); this.ray.far = distance + .18;
      this.hits.length = 0; this.ray.intersectObjects(walls, false, this.hits);
      if (this.hits.length) safe = Math.min(safe, Math.max(.22, this.hits[0].distance - .22));
    }
    return safe;
  }

  update(dt: number, position: THREE.Vector3, input: Input, sensitivity: number, walls: THREE.Mesh[], snap = false) {
    this.yaw -= input.lookX * .0025 * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.lookY * .002 * sensitivity, .13, .95);
    input.lookX = input.lookY = 0;
    this.aim.copy(position); this.aim.y += 1.2;
    if (snap) this.target.copy(this.aim); else this.target.lerp(this.aim, 1 - Math.exp(-14 * dt));
    this.direction.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const safe = this.clearDistance(this.target, this.direction, 7.1, walls);
    // Retract immediately; release gently when the obstruction clears.
    this.boom = snap || safe < this.boom ? safe : THREE.MathUtils.damp(this.boom, safe, 5, dt);
    this.desired.copy(this.target).addScaledVector(this.direction, this.boom);
    if (snap) this.camera.position.copy(this.desired);
    else this.camera.position.lerp(this.desired, 1 - Math.exp(-(this.wasFocused ? 5 : 16) * dt));
    // Smoothing must never carry the lens through a wall or furniture corner.
    this.direction.subVectors(this.camera.position, this.target);
    const distance = this.direction.length(); this.direction.normalize();
    const corrected = this.clearDistance(this.target, this.direction, distance, walls);
    if (corrected < distance) this.camera.position.copy(this.target).addScaledVector(this.direction, corrected);
    this.camera.lookAt(this.target);
    this.transitioning = this.camera.position.distanceToSquared(this.desired) > .003;
    if (!this.transitioning) this.wasFocused = false;
  }

  focusDesk(dt: number) {
    this.wasFocused = true;
    this.desired.set(-.35, 3.85, -1.6); this.aim.set(-.4, 1.18, -3.25);
    this.camera.position.lerp(this.desired, 1 - Math.exp(-6 * dt));
    this.target.lerp(this.aim, 1 - Math.exp(-6 * dt)); this.camera.lookAt(this.target);
    this.transitioning = this.camera.position.distanceToSquared(this.desired) > .003;
  }
}
