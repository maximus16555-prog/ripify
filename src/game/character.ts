import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A small articulated collector, with no external model download or animation mixer. */
export class CharacterRig {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private legs: THREE.Group[] = [];
  private knees: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private phase = 0;
  private clock = 0;
  private stride = 0;
  private landing = 0;

  constructor() {
    const mesh = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, parent = this.body) => {
      this.geometries.add(geo);
      let material = this.materials.get(color);
      if (!material) { material = new THREE.MeshStandardMaterial({ color, roughness: .86 }); this.materials.set(color, material); }
      const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    const rounded = (w: number, h: number, d: number, r = .04) => new RoundedBoxGeometry(w, h, d, 2, r);
    const sphere = (r: number) => new THREE.SphereGeometry(r, 16, 12);
    this.group.add(this.body);
    mesh(rounded(.46, .55, .32, .095), '#c69554', 0, .98, 0);
    mesh(rounded(.42, .065, .33, .025), '#ab7c40', 0, .73, 0);
    mesh(rounded(.27, .15, .018, .025), '#b38445', 0, .85, -.17); // hoodie pocket
    const hood = mesh(new THREE.TorusGeometry(.16, .066, 8, 16, Math.PI * 1.8), '#b28349', 0, 1.22, .025); hood.rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(.08, .09, .12, 12), '#d5a684', 0, 1.29, 0);
    const head = mesh(sphere(.213), '#d5a684', 0, 1.49, -.013); head.scale.set(.98, 1.02, .91);
    for (const x of [-.203, .203]) { const ear = mesh(sphere(.045), '#c79375', x, 1.46, -.003); ear.scale.set(.55, 1, .75); }
    const hair = mesh(sphere(.219), '#4a3d34', 0, 1.595, .025); hair.scale.set(1.01, .57, .95);
    mesh(rounded(.37, .13, .16, .035), '#4a3d34', 0, 1.52, .15);
    for (let i = 0; i < 3; i++) { const fringe = mesh(sphere(.09), '#4a3d34', -.12 + i * .105, 1.61 - i * .014, -.145); fringe.scale.set(.85, .7, .62); }
    for (const x of [-.075, .075]) { mesh(sphere(.017), '#3d3631', x, 1.49, -.197); mesh(rounded(.047, .013, .012, .005), '#65513f', x, 1.535, -.192); }
    const nose = mesh(sphere(.032), '#cc997a', 0, 1.445, -.202); nose.scale.set(.75, .8, .75);
    for (const x of [-.068, .068]) mesh(new THREE.CapsuleGeometry(.008, .14, 2, 5), '#e7d6ad', x, 1.13, -.179);
    mesh(rounded(.31, .37, .14, .05), '#5c776c', 0, .99, .22);
    mesh(rounded(.26, .10, .038, .025), '#799083', 0, 1.13, .299);
    mesh(rounded(.23, .135, .046, .022), '#688377', 0, .9, .304);
    mesh(rounded(.025, .055, .012, .005), '#d0b87f', 0, 1.07, .323);
    mesh(new THREE.TorusGeometry(.04, .009, 4, 10, Math.PI), '#445d52', 0, 1.21, .2);
    for (const x of [-.185, .185]) mesh(rounded(.045, .41, .028, .012), '#627867', x, 1.01, -.151);

    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(side * .115, .57, 0); this.body.add(hip); this.legs.push(hip);
      mesh(new THREE.CapsuleGeometry(.091, .16, 4, 10), '#43585b', 0, -.12, 0, hip);
      const knee = new THREE.Group(); knee.position.y = -.235; hip.add(knee); this.knees.push(knee);
      mesh(new THREE.CapsuleGeometry(.078, .14, 4, 10), '#43585b', 0, -.105, 0, knee);
      mesh(rounded(.17, .115, .29, .04), '#e5ded0', 0, -.255, -.045, knee);
      mesh(rounded(.18, .043, .30, .015), '#c0b7a2', 0, -.314, -.045, knee);
      for (let i = 0; i < 2; i++) mesh(rounded(.10, .008, .012, .003), '#faf1dd', 0, -.203, -.07 - i * .04, knee);
      const arm = new THREE.Group(); arm.position.set(side * .275, 1.15, .005); this.body.add(arm); this.arms.push(arm);
      mesh(new THREE.CapsuleGeometry(.083, .24, 4, 10), '#c69554', side * .015, -.18, 0, arm);
      mesh(new THREE.CylinderGeometry(.077, .077, .055, 10), '#ab7c40', side * .015, -.327, 0, arm);
      const hand = mesh(sphere(.068), '#d5a684', side * .015, -.393, -.008, arm); hand.scale.set(.8, 1.1, .8);
    }
    // Batch within each articulated part; the joints remain independent.
    for (const parent of [this.body, ...this.legs, ...this.knees, ...this.arms]) {
      const batches = new Map<THREE.Material, THREE.Mesh[]>();
      for (const child of parent.children) if (child instanceof THREE.Mesh && !Array.isArray(child.material)) {
        const list = batches.get(child.material) ?? []; list.push(child); batches.set(child.material, list);
      }
      for (const [material, meshes] of batches) {
        if (meshes.length < 2) continue;
        const parts = meshes.map(m => { m.updateMatrix(); return (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix); });
        const geometry = mergeGeometries(parts); parts.forEach(p => p.dispose());
        if (!geometry) continue;
        this.geometries.add(geometry); const merged = new THREE.Mesh(geometry, material); merged.castShadow = merged.receiveShadow = true; parent.add(merged);
        meshes.forEach(m => { m.removeFromParent(); m.geometry.dispose(); this.geometries.delete(m.geometry); });
      }
    }
  }

  land(impact: number) { this.landing = Math.min(.10, impact * .012); }

  update(dt: number, speed: number, grounded: boolean, verticalSpeed: number, turn: number) {
    this.clock += dt;
    this.stride = THREE.MathUtils.damp(this.stride, grounded ? Math.min(speed / 4.5, 1) : 0, 14, dt);
    this.phase += dt * speed * 4.8;
    const swing = Math.sin(this.phase);
    this.landing = THREE.MathUtils.damp(this.landing, 0, 12, dt);
    for (let i = 0; i < 2; i++) {
      const stride = i ? -swing : swing;
      this.legs[i].rotation.x = grounded ? stride * this.stride * .68 : -.18;
      this.knees[i].rotation.x = grounded ? Math.max(0, -stride) * this.stride * .8 : .35 + Math.max(0, -verticalSpeed) * .025;
      this.arms[i].rotation.x = -stride * this.stride * .45 + (grounded ? 0 : -.3);
      this.arms[i].rotation.z = (i ? -1 : 1) * (.055 + (grounded ? 0 : .12));
    }
    this.body.position.y = -.008 + Math.abs(swing) * .027 * this.stride - this.landing;
    this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, this.stride * -.075, 9, dt);
    this.body.rotation.z = THREE.MathUtils.damp(this.body.rotation.z, -turn * .018 + swing * this.stride * .018, 9, dt);
    this.body.scale.y = 1 - this.landing * .28 + Math.sin(this.clock * 1.6) * .0015 * (1 - this.stride);
  }

  dispose() { this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); }
}
