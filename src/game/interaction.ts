import * as THREE from 'three';
import type { Interactable, World } from './world';

/** Context selection is stable around adjacent objects and never passes through walls. */
export class InteractionSystem {
  private current?: Interactable;
  private origin = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private projected = new THREE.Vector3();
  private hits: THREE.Intersection[] = [];
  private ray = new THREE.Raycaster();

  find(position: THREE.Vector3, grounded: boolean, world: World) {
    if (!grounded) return this.current = undefined;
    let best: Interactable | undefined; let score = Infinity;
    this.origin.copy(position); this.origin.y += 1.0;
    for (const item of world.interactions) {
      const distance = Math.hypot(position.x - item.position.x, position.z - item.position.z);
      if (distance > item.radius || Math.abs(position.y - item.position.y) > .6) continue;
      this.direction.set(item.position.x, 1.0, item.position.z).sub(this.origin);
      const length = this.direction.length(); this.direction.normalize();
      this.ray.set(this.origin, this.direction); this.ray.far = Math.max(0, length - .15);
      this.hits.length = 0; this.ray.intersectObjects(world.cameraMeshes, false, this.hits);
      if (this.hits.length) continue;
      const candidate = distance - (this.current?.id === item.id ? .18 : 0);
      if (candidate < score) { score = candidate; best = item; }
    }
    return this.current = best;
  }

  screenAnchor(item: Interactable, camera: THREE.Camera) {
    this.projected.copy(item.anchor).project(camera);
    return this.projected;
  }
  clear() { this.current = undefined; }
}
