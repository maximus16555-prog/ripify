import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { layoutPackages, DELIVERY_AREA, type PackagePlacement } from '../core/delivery';
import type { ShippingPackage } from '../core/types';
import type { Collider, Interactable, World } from './world';
import { shippingLabel } from './shipping-box';

/** Five instanced draw calls for the entire waiting pile, regardless of box count. */
export class DeliveryPile {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = []; private textures: THREE.Texture[] = [];
  private placements: PackagePlacement[] = []; private positions = new Map<string, THREE.Vector3>();
  private packages = new Map<string, ShippingPackage>(); private ownInteractions: Interactable[] = []; private ownColliders: Collider[] = [];
  private signature = ''; private settling = false; private ray = new THREE.Raycaster();
  private capacity = DELIVERY_AREA.columns * DELIVERY_AREA.rows * DELIVERY_AREA.maxCount;
  constructor(private world: World, private invalidate: () => void) {
    this.group.name = 'waiting-deliveries'; world.group.add(this.group);
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
      const mesh = new THREE.InstancedMesh(geometry, material, this.capacity); mesh.count = 0; mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; this.group.add(mesh); this.meshes.push(mesh); return mesh;
    };
    add(new RoundedBoxGeometry(1, 1, 1, 1, .008), new THREE.MeshStandardMaterial({ color: '#ac8055', roughness: .96 }));
    add(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#bca173', roughness: .7 }));
    add(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#76543a', roughness: 1 }));
    for (const source of ['store', 'grading'] as const) {
      const map = shippingLabel(source); this.textures.push(map); add(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map, roughness: 1 }));
    }
    world.cameraMeshes.push(this.meshes[0]);
    this.meshes[0].userData.deliveryPile = true;
  }
  sync(packages: ShippingPackage[]) {
    const signature = JSON.stringify(packages.filter(p => p.stage !== 'claimed').map(p => [p.uid, p.dimensions, p.stackOrder]));
    if (signature === this.signature) return; this.signature = signature;
    this.packages = new Map(packages.map(p => [p.uid, p])); this.placements = layoutPackages(packages);
    const existing = new Set(this.placements.map(p => p.uid)); for (const uid of this.positions.keys()) if (!existing.has(uid)) this.positions.delete(uid);
    for (const p of this.placements) if (!this.positions.has(p.uid)) this.positions.set(p.uid, new THREE.Vector3(p.x, p.y, p.z));
    this.world.interactions = this.world.interactions.filter(i => !this.ownInteractions.includes(i));
    this.world.colliders = this.world.colliders.filter(c => !this.ownColliders.includes(c));
    this.ownInteractions = this.placements.map(p => ({ id: p.uid, label: 'Open Package', action: 'package', radius: 2.15, position: new THREE.Vector3(p.x, 0, p.z), anchor: new THREE.Vector3(p.x, p.y + this.packages.get(p.uid)!.dimensions.height / 2, p.z) }));
    this.world.interactions.push(...this.ownInteractions);
    this.ownColliders = [];
    for (const stack of new Set(this.placements.map(p => p.stack))) {
      const list = this.placements.filter(p => p.stack === stack), bottom = list[0], d = this.packages.get(bottom.uid)!.dimensions;
      this.ownColliders.push({ minX: bottom.x - d.width / 2 - .015, maxX: bottom.x + d.width / 2 + .015, minZ: bottom.z - d.depth / 2 - .015, maxZ: bottom.z + d.depth / 2 + .015, height: list.at(-1)!.y + this.packages.get(list.at(-1)!.uid)!.dimensions.height });
    }
    this.world.colliders.push(...this.ownColliders); this.settling = true; this.update(0); this.invalidate();
  }
  update(dt: number) {
    if (!this.settling) return false;
    this.settling = false; const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), position = new THREE.Vector3();
    let storeCount = 0, gradeCount = 0;
    this.placements.forEach((p, index) => {
      const current = this.positions.get(p.uid)!, target = new THREE.Vector3(p.x, p.y, p.z), d = this.packages.get(p.uid)!.dimensions;
      current.lerp(target, 1 - Math.exp(-dt * 10)); if (current.distanceToSquared(target) > .000001) this.settling = true; else current.copy(target);
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
      position.copy(current).y += d.height / 2; scale.set(d.width, d.height, d.depth); matrix.compose(position, rotation, scale); this.meshes[0].setMatrixAt(index, matrix);
      position.copy(current).y += d.height + .001; scale.set(d.width, .002, .046); matrix.compose(position, rotation, scale); this.meshes[1].setMatrixAt(index, matrix);
      // Fine center fold is visible beyond the tape, and preserves the split top silhouette.
      position.copy(current).y += d.height + .001; scale.set(.0015, .001, d.depth); matrix.compose(position, rotation, scale); this.meshes[2].setMatrixAt(index, matrix);
      const labelRotation = rotation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
      position.set(-d.width * .14, d.height + .003, -d.depth * .22).applyQuaternion(rotation).add(current);
      scale.set(d.width * .44, d.depth * .32, 1); matrix.compose(position, labelRotation, scale);
      const source = this.packages.get(p.uid)!.source, mesh = this.meshes[source === 'store' ? 3 : 4]; mesh.setMatrixAt(source === 'store' ? storeCount++ : gradeCount++, matrix);
      this.ownInteractions[index].anchor.set(current.x, current.y + d.height / 2, current.z);
    });
    this.meshes.forEach((mesh, i) => { mesh.count = i < 3 ? this.placements.length : i === 3 ? storeCount : gradeCount; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); });
    this.group.userData.packages = this.placements.map(p => ({ ...p, dimensions: this.packages.get(p.uid)!.dimensions }));
    this.group.userData.queued = [...this.packages.values()].filter(p => p.stage !== 'claimed').length - this.placements.length;
    this.invalidate(); return this.settling;
  }
  aimedAt(camera: THREE.Camera, player: THREE.Vector3, pointer = new THREE.Vector2(0, 0)) {
    this.group.updateMatrixWorld(true); this.ray.setFromCamera(pointer, camera);
    const hit = this.ray.intersectObject(this.meshes[0])[0];
    if (!hit || hit.instanceId === undefined) return undefined;
    const i = this.ownInteractions[hit.instanceId];
    if (Math.hypot(player.x - i.position.x, player.z - i.position.z) > i.radius) return undefined;
    // A room wall/furniture piece must not be bypassed by pointing at a hidden package.
    this.ray.far = hit.distance - .02; const blocked = this.ray.intersectObjects(this.world.cameraMeshes.filter(m => m !== this.meshes[0]), false).length; this.ray.far = Infinity;
    return blocked ? undefined : i;
  }
  dispose() {
    this.world.interactions = this.world.interactions.filter(i => !this.ownInteractions.includes(i)); this.world.colliders = this.world.colliders.filter(c => !this.ownColliders.includes(c));
    this.world.cameraMeshes = this.world.cameraMeshes.filter(m => m !== this.meshes[0]);
    this.meshes.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); m.dispose(); }); this.textures.forEach(t => t.dispose()); this.group.removeFromParent();
  }
}
