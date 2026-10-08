import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Save, ShippingPackage } from '../core/types';
import { PRODUCT_BY_ID } from '../data/products';
import { PhysicalContainer } from './physical-container';
import { createPhysicalCard, type PhysicalCard } from './physical-card';

export function shippingLabel(source: ShippingPackage['source']) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#e8e5da'; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#444440'; ctx.font = 'bold 25px sans-serif'; ctx.fillText(source === 'store' ? 'POKEMON STORE' : 'GRADING RETURN', 24, 42);
  ctx.font = '19px sans-serif'; ctx.fillText('TO: COLLECTOR', 24, 83); ctx.fillText('HANDLE WITH CARE', 24, 112);
  for (let i = 0; i < 100; i++) if (i % 7 !== 0) ctx.fillRect(24 + i * 4.3, 143, 1 + (i * 17 % 3), 68);
  ctx.font = '15px monospace'; ctx.fillText('TRACKED SHIPPING', 24, 239);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

/** Actual hollow corrugated walls and four hinged flaps. Presentation only. */
export class ShippingBox {
  readonly group = new THREE.Group(); readonly contents = new THREE.Group(); readonly tape = new THREE.Group();
  readonly flaps: THREE.Group[] = []; readonly ready: Promise<unknown>;
  readonly itemUids: string[] = [];
  private geometries: THREE.BufferGeometry[] = []; private materials: THREE.Material[] = []; private textures: THREE.Texture[] = [];
  private children: (PhysicalCard | PhysicalContainer)[] = []; private disposed = false;
  private loads: Promise<unknown>[] = [];
  private cancelLoads = new Set<() => void>();
  constructor(readonly packageData: ShippingPackage, save: Save) {
    const { width: w, height: h, depth: d } = packageData.dimensions, wall = .008;
    this.group.name = 'shipping-box'; this.group.userData.packageUid = packageData.uid;
    const cardboard = this.material('#ac8055'), lining = this.material('#bb9369'), edge = this.material('#8c663f');
    this.box(this.group, w, wall, d, 0, wall / 2, 0, cardboard);
    this.box(this.group, w, h, wall, 0, h / 2, d / 2 - wall / 2, cardboard);
    this.box(this.group, w, h, wall, 0, h / 2, -d / 2 + wall / 2, cardboard);
    this.box(this.group, wall, h, d - wall * 2, -w / 2 + wall / 2, h / 2, 0, cardboard);
    this.box(this.group, wall, h, d - wall * 2, w / 2 - wall / 2, h / 2, 0, cardboard);
    this.box(this.group, w - wall * 2, .003, d - wall * 2, 0, wall + .002, 0, lining);
    // Exposed corrugation on the rim, not painted across product artwork.
    const rimGeo = new THREE.BoxGeometry(.002, .002, wall), rimCount = Math.floor(w / .015); this.geometries.push(rimGeo);
    const rim = new THREE.InstancedMesh(rimGeo, edge, rimCount * 2);
    for (let i = 0; i < rimCount; i++) for (let side = 0; side < 2; side++) rim.setMatrixAt(i * 2 + side, new THREE.Matrix4().makeTranslation(-w / 2 + .013 + i * .015, h + .001, (side ? 1 : -1) * (d / 2 - wall / 2)));
    this.group.add(rim);
    for (const front of [true, false]) {
      const hinge = new THREE.Group(); hinge.position.set(0, h, (front ? 1 : -1) * d / 2); hinge.userData.axis = 'x'; hinge.userData.direction = front ? 1 : -1;
      this.box(hinge, w - .012, wall, d / 2 - .003, 0, wall / 2, (front ? -1 : 1) * d / 4, cardboard);
      this.group.add(hinge); this.flaps.push(hinge);
    }
    for (const left of [true, false]) {
      const hinge = new THREE.Group(); hinge.position.set((left ? -1 : 1) * w / 2, h - wall, 0); hinge.userData.axis = 'z'; hinge.userData.direction = left ? 1 : -1;
      this.box(hinge, w / 2 - .008, wall, d - .018, (left ? 1 : -1) * w / 4, 0, 0, lining);
      this.group.add(hinge); this.flaps.push(hinge);
    }
    this.group.add(this.tape, this.contents);
    const adhesive = this.material('#b89b68', .56);
    this.box(this.tape, w, .0018, .055, 0, h + .009, 0, adhesive);
    for (const x of [-w / 2, w / 2]) this.box(this.tape, .0018, .065, .055, x, h - .024, 0, adhesive);
    const labelTexture = shippingLabel(packageData.source); this.textures.push(labelTexture);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(w * .48, d * .34), new THREE.MeshStandardMaterial({ map: labelTexture, roughness: .94 }));
    this.geometries.push(label.geometry); this.materials.push(label.material); label.rotation.x = -Math.PI / 2; label.position.set(-w * .15, .011, d * .29);
    this.flaps[1].add(label);
    this.addContents(save);
    this.ready = Promise.allSettled(this.loads);
    this.setTape(packageData.stage === 'sealed' ? 0 : 1); this.setFlaps(packageData.stage === 'open' ? 1 : 0);
  }
  private material(color: string, roughness = .95) { const m = new THREE.MeshStandardMaterial({ color, roughness }); this.materials.push(m); return m; }
  private box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) {
    const geometry = new RoundedBoxGeometry(w, h, d, 1, Math.min(.002, h / 4, w / 4, d / 4)); this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private addContents(save: Save) {
    const p = this.packageData, groups: THREE.Group[] = [];
    if (p.source === 'grading') for (const uid of p.itemUids) {
      const owned = save.cards.find(c => c.uid === uid), order = save.orders.find(o => o.cardUid === uid && p.orderUids.includes(o.uid));
      if (!owned || !order) throw Error('Returned card missing');
      // Same UID, real condition/misprint and precomputed grade. No inventory creation.
      const physical = createPhysicalCard({ ...owned, status: 'graded', grader: order.grader, grade: order.result, subgrades: order.grader === 'BGS' ? order.subgrades : undefined });
      this.children.push(physical); this.loads.push(physical.ready); groups.push(physical.group); this.itemUids.push(uid);
      physical.group.rotation.x = -Math.PI / 2;
    }
    else for (const uid of p.itemUids) {
      const item = save.computer!.orders.filter(o => p.orderUids.includes(o.uid)).flatMap(o => o.items).find(i => i.uid === uid);
      if (!item) throw Error('Purchased item missing');
      const product = PRODUCT_BY_ID.get(item.productId)!;
      if (product.type === 'etb' || product.type === 'upc') {
        const model = new PhysicalContainer(product, undefined, false); this.children.push(model); this.loads.push(model.ready);
        // Outer product stays sealed; contained promos/packs are not generated here.
        groups.push(model.group); model.group.userData.uid = uid;
      } else {
        const group = new THREE.Group(), foil = this.material('#bbc0ba', .52);
        const width = product.type === 'booster' ? .14 : .32, height = product.type === 'booster' ? .21 : .25, thickness = product.type === 'booster' ? .003 : .16;
        this.box(group, width, height, thickness, 0, 0, 0, foil); group.rotation.x = -Math.PI / 2; group.userData.uid = uid;
        if (product.artwork) {
          const texture = new THREE.Texture(); texture.colorSpace = THREE.SRGBColorSpace; this.textures.push(texture);
          const image = new Image(); image.crossOrigin = 'anonymous';
          this.loads.push(new Promise<void>(resolve => {
            const timer = setTimeout(done, 10000);
            const cancel = () => { done(); image.src = ''; }; this.cancelLoads.add(cancel);
            const owner = this;
            function done() { clearTimeout(timer); image.onload = image.onerror = null; owner.cancelLoads.delete(cancel); resolve(); }
            image.onload = () => { if (!this.disposed) { texture.image = image; texture.needsUpdate = true; } done(); }; image.onerror = done; image.src = product.artwork!;
          }));
          const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: texture, roughness: .5 }));
          this.geometries.push(face.geometry); this.materials.push(face.material); face.position.z = thickness / 2 + .0002; group.add(face);
        }
        groups.push(group);
      }
      this.itemUids.push(uid);
    }
    const { width: w, depth: d, height: h } = p.dimensions;
    const flatStack = p.source === 'grading' || p.itemUids.every(uid => save.computer!.orders.flatMap(o => o.items).some(i => i.uid === uid && 'generationVersion' in i));
    const columns = flatStack || groups.length === 1 ? 1 : 2, rows = flatStack ? 1 : Math.ceil(groups.length / columns), layerCount = flatStack ? groups.length : Math.max(1, Math.ceil(rows / 3));
    groups.forEach((group, i) => {
      group.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(group), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const scale = Math.min((w - .055) / columns / size.x, (d - .045) / Math.min(rows, 3) / size.z, (h - .055) / layerCount / Math.max(.003, size.y), group.name === 'physical-container' ? .32 : 1);
      const holder = new THREE.Group(); group.position.sub(center); holder.add(group); holder.scale.setScalar(scale);
      holder.position.set(((i % columns) + .5) * (w - .055) / columns - (w - .055) / 2, .025 + (flatStack ? i : Math.floor(i / (columns * 3))) * (h - .04) / layerCount + size.y * scale / 2, ((flatStack ? 0 : Math.floor(i / columns) % 3) + .5) * (d - .045) / Math.min(rows, 3) - (d - .045) / 2);
      if (!flatStack && layerCount === 1) {
        // A corrugated packing insert supports small items near the rim; no floating contents.
        const base = Math.max(.012, h - .035 - size.y * scale);
        holder.position.y = base + size.y * scale / 2;
        this.box(this.group, Math.min(size.x * scale + .012, (w - .055) / columns), base - .009, Math.min(size.z * scale + .012, (d - .045) / Math.min(rows, 3)), holder.position.x, (base + .009) / 2, holder.position.z, this.material('#bc9369'));
      }
      this.contents.add(holder);
    });
  }
  setTape(progress: number) { this.tape.position.set(progress * this.packageData.dimensions.width * .6, progress * .18, 0); this.tape.rotation.z = progress * .5; this.tape.visible = progress < .995; }
  setFlaps(progress: number) {
    this.flaps.forEach((flap, i) => { const angle = Math.min(1, Math.max(0, (progress - (i < 2 ? 0 : .2)) / (i < 2 ? .75 : .8))) * 2.1 * flap.userData.direction; if (flap.userData.axis === 'x') flap.rotation.x = angle; else flap.rotation.z = angle; });
    this.contents.visible = progress > .27;
  }
  liftContents(progress: number) { this.contents.position.y = progress * (this.packageData.dimensions.height + .3); }
  dispose() { if (this.disposed) return; this.disposed = true; this.cancelLoads.forEach(cancel => cancel()); this.cancelLoads.clear(); this.children.forEach(c => c.dispose()); this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose()); this.group.clear(); }
}
