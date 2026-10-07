import * as THREE from 'three';
import type { OwnedCard } from '../core/types';
import { createPhysicalCard, type PhysicalCard } from './physical-card';

/** Controlled plastic-shell separation. No fracture simulation or inventory changes. */
export class SlabCrackPresentation {
  readonly raw: PhysicalCard;
  private front = new THREE.Group();
  private rear = new THREE.Group();
  constructor(private slab: PhysicalCard, owned: OwnedCard, factories?: Parameters<typeof createPhysicalCard>[1]) {
    this.raw = createPhysicalCard(owned, factories); this.raw.group.visible = false;
    this.front.position.y = -slab.size.height / 2;
    const rim = slab.group.getObjectByName('slab-rim') as THREE.Mesh;
    for (const sign of [-1, 1]) {
      const half = new THREE.Mesh(rim.geometry.clone(), rim.material);
      half.geometry.scale(1, 1, .5); half.geometry.translate(0, 0, sign * slab.size.depth / 4);
      half.name = sign > 0 ? 'slab-front-rim' : 'slab-rear-rim';
      (sign > 0 ? this.front : this.rear).add(half);
      if (sign > 0) half.position.y += slab.size.height / 2;
    }
    rim.removeFromParent(); rim.geometry.dispose();
    for (const name of ['slab-cover-front', 'slab-label-front']) {
      const part = slab.group.getObjectByName(name)!; part.removeFromParent(); this.front.add(part); part.position.y += slab.size.height / 2;
    }
    for (const name of ['slab-cover-back', 'slab-label-back', 'slab-insert']) {
      const part = slab.group.getObjectByName(name)!; part.removeFromParent(); this.rear.add(part);
    }
    slab.group.add(this.front, this.rear);
  }
  update(progress: number) {
    const smooth = (a: number, b: number) => { const t = THREE.MathUtils.clamp((progress - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const pry = smooth(0, .34), release = smooth(.34, .65), pull = smooth(.58, 1);
    this.front.rotation.x = -.08 * pry - .36 * release;
    this.front.rotation.z = -.15 * release;
    this.front.position.set(.27 * release, -this.slab.size.height / 2 - .045 * release, .045 * pry + .09 * release);
    this.rear.position.set(-.25 * pull, -.015 * pull, -.04 * release);
    this.rear.rotation.z = .13 * pull;
    this.slab.group.getObjectByName('cardstock')!.visible = !pull;
    this.slab.group.getObjectByName('card-front')!.visible = !pull;
    this.slab.group.getObjectByName('card-back')!.visible = !pull;
    this.raw.group.visible = pull > 0;
    this.raw.group.position.set(0, -.05 * (1 - pull), .035 + .15 * pull);
    this.raw.group.rotation.z = -.025 * Math.sin(pull * Math.PI);
  }
  dispose() { this.raw.dispose(); }
}
