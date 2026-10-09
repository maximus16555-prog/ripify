import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomMaterials, softShadowTexture, windowArtwork } from './materials';
import { CARD_BY_ID, PRODUCTS } from '../data/cards';
import type { Product } from '../core/types';
import { batchStaticColors } from './static-batching';
export interface Collider { minX: number; maxX: number; minZ: number; maxZ: number; height: number }
export type WorldLocation = 'home' | 'shop' | 'outside';
export interface WorldBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export const ROOM_BOUNDS: WorldBounds = { minX: -5.65, maxX: 5.65, minZ: -4.65, maxZ: 4.65 };
export interface Interactable { id: string; label: string; position: THREE.Vector3; anchor: THREE.Vector3; radius: number; action: string; product?: Product; destination?: WorldLocation }
export interface World { group: THREE.Group; colliders: Collider[]; cameraMeshes: THREE.Mesh[]; interactions: Interactable[]; displaySlots: THREE.Group[]; spawn: THREE.Vector3; name: string; bounds?: WorldBounds; entrySpawn?: THREE.Vector3; spawnYaw?: number; entryYaw?: number; atmosphere?: { sky: string; fogNear: number; fogFar: number; viewDistance: number }; dispose(): void }
export function buildWorld(kind: 'home' | 'shop', invalidate: () => void = () => {}) : World {
  const group = new THREE.Group(); const colliders: Collider[] = []; const cameraMeshes: THREE.Mesh[] = []; const interactions: Interactable[] = []; const displaySlots: THREE.Group[] = [];
  const palette = new RoomMaterials(); const geometries = new Set<THREE.BufferGeometry>(); const textures = new Set<THREE.Texture>();
  const productMaterials = new Map<string, THREE.MeshStandardMaterial>();
  const batchedMaterials = new Set<THREE.Material>();
  let disposed = false;
  const productMaterial = (p: Product) => {
    const cached = productMaterials.get(p.code); if (cached) return cached;
    const material = new THREE.MeshStandardMaterial({ color:'#ffffff', roughness:.65, metalness:p.type === 'booster' ? .12 : 0 });
    const texture = new THREE.TextureLoader().load(p.artwork!, loaded => { if (disposed) loaded.dispose(); else invalidate(); }, undefined, () => { if (!disposed) { material.map = null; material.color.set('#a3aaa4'); material.needsUpdate = true; invalidate(); } });
    texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture); material.map = texture; productMaterials.set(p.code, material); return material;
  };
  const wood = new Set(['#af7950', '#755840', '#c9aa80', '#82634b', '#927852', '#aa8760', '#aa7953', '#b7885f', '#9c7958', '#957355', '#86684d', '#9d7956', '#b69065', '#9a7451', '#dbc5a0', '#ba9873']);
  const cloth = new Set(['#927254', '#8f9d82', '#b28869', '#ddc49e', '#f0e5cd', '#faf0da', '#b76f50', '#c58865', '#637a71']);
  const recolor: Record<string, string> = { '#af7950': '#92674b', '#755840': '#514537', '#aa7953': '#466966', '#b7885f': '#577975', '#957355': '#65503f', '#927254': '#56777b', '#8f9d82': '#8c9c82', '#b28869': '#ad6951', '#c58865': '#ce9c7b', '#b76f50': '#ab6950', '#637a71': '#345e57' };
  const mat = (color: string) => palette.get(recolor[color] ?? color, cloth.has(color) ? 'fabric' : wood.has(color) ? 'wood' : ['#c8ad71', '#aa8d54'].includes(color) ? 'metal' : 'paint');
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, parent: THREE.Group = group, solid = false) => {
    const radius = Math.min(.045, w * .12, h * .16, d * .12);
    const geometry = Math.min(w, h, d) > .07 && w < 5 && h < 3 ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(w, h, d);
    geometries.add(geometry); const mesh = new THREE.Mesh(geometry, mat(color)); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    if (solid) { colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: y + h / 2 }); cameraMeshes.push(mesh); }
    return mesh;
  };
  const cylinder = (x: number, y: number, z: number, r: number, h: number, color: string, r2 = r, parent: THREE.Group = group) => { const geo = new THREE.CylinderGeometry(r, r2, h, 12); geometries.add(geo); const mesh = new THREE.Mesh(geo, mat(color)); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  const sphere = (x: number, y: number, z: number, r: number, color: string, parent: THREE.Group = group) => { const geo = new THREE.SphereGeometry(r, 12, 8); geometries.add(geo); const mesh = new THREE.Mesh(geo, mat(color)); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh; };
  const label = (text: string, x: number, y: number, z: number, w: number, color = '#443e33', bg = '#ece7d8', parent: THREE.Group = group) => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128; const ctx = canvas.getContext('2d')!; ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128); ctx.fillStyle = color; ctx.font = '600 38px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 66, 480);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture); const geo = new THREE.PlaneGeometry(w, w / 4); geometries.add(geo); const material = new THREE.MeshBasicMaterial({ map: texture }); const mesh = new THREE.Mesh(geo, material); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  };
  const interact = (id: string, text: string, x: number, z: number, action: string, radius = 2.2, product?: Product) => {
    const anchor = action === 'door' ? new THREE.Vector3(-5.65, 1.6, .8) : new THREE.Vector3(x, action === 'buy' ? 2.4 : 1.6, z - .65);
    interactions.push({ id, label: text, position: new THREE.Vector3(x, 0, z), anchor, action, radius, product, ...(action === 'door' ? { destination: 'outside' as const } : {}) });
  };
  const table = (x: number, z: number, w: number, d: number, color = '#af7950') => {
    box(x, 1.15, z, w, .14, d, color, group, true);
    box(x, .97, z, w - .24, .16, d - .22, '#755840');
    for (const dx of [-w / 2 + .16, w / 2 - .16]) for (const dz of [-d / 2 + .16, d / 2 - .16]) cylinder(x + dx, .54, z + dz, .065, 1.08, '#755840', .043);
  };
  const plant = (x: number, z: number, scale = 1) => {
    cylinder(x, .25 * scale, z, .22 * scale, .5 * scale, '#bd795d', .16 * scale);
    cylinder(x, .66 * scale, z, .035 * scale, .8 * scale, '#64745b');
    for (let i = 0; i < 7; i++) { const a = i * 2.4; const leaf = sphere(x + Math.cos(a) * .2 * scale, (.65 + i * .085) * scale, z + Math.sin(a) * .19 * scale, .24 * scale, i % 2 ? '#6e895d' : '#527452'); leaf.scale.set(1, .4, .7); leaf.rotation.z = a; }
  };
  const pack = (x: number, y: number, z: number, p: Product, parent: THREE.Group = group) => {
    const packet = new THREE.Group(); packet.position.set(x, y, z); parent.add(packet);
    const boxed = p.type !== 'booster';
    box(0, 0, 0, boxed ? .31 : .28, boxed ? .28 : .44, boxed ? .24 : .035, '#a3aaa4', packet);
    if (boxed) box(0, .145, 0, .32, .035, .25, '#bcc5b8', packet);
    else for (const y of [-.19, .19]) box(0, y, .02, .27, .02, .006, '#c9cec5', packet);
    if (p.artwork) {
      const geometry = new THREE.PlaneGeometry(boxed ? .31 : .28, boxed ? .28 : .44); geometries.add(geometry);
      const face = new THREE.Mesh(geometry, productMaterial(p)); face.position.z = boxed ? .121 : .027; packet.add(face);
    }
    return packet;
  };
  // Staggered floorboards use one instanced draw; edge boards are trimmed to the room.
  const floorGeo = new THREE.BoxGeometry(1, .09, 1); geometries.add(floorGeo);
  const floor = new THREE.InstancedMesh(floorGeo, mat('#c9aa80'), 17 * 6); floor.receiveShadow = true;
  const matrix = new THREE.Matrix4(); const plankColor = new THREE.Color(); let n = 0;
  for (let x = 0; x < 17; x++) {
    const offset = (x % 3) * .66;
    for (let row = -1; row < 6; row++) {
      const start = Math.max(-5, -5 + row * 2 + offset); const end = Math.min(5, -3 + row * 2 + offset);
      if (end <= start) continue;
      matrix.makeScale(.711, 1, end - start - .012); matrix.setPosition(-5.76 + x * .72, -.055, (start + end) / 2);
      floor.setMatrixAt(n, matrix); floor.setColorAt(n++, plankColor.setHSL(.09, .20, .60 + ((x * 7 + row * 3 + 6) % 6) * .016));
    }
  }
  floor.count = n;
  group.add(floor); box(0, -.14, 0, 12.4, .2, 10.3, '#82634b');
  // A real aperture allows the sun to cast the window frame onto the room.
  const wallColor = kind === 'home' ? '#8c9e8d' : '#b5ab94';
  for (const x of [-3.675, 3.675]) { const wall = box(x, 2.2, -5, 4.85, 4.4, .16, wallColor, group, true); wall.material = palette.get(wallColor, 'plaster'); }
  box(0, .925, -5, 2.5, 1.85, .16, wallColor, group, true);
  box(0, 4.025, -5, 2.5, .75, .16, wallColor, group, true);
  box(-6, 2.2, -2.7, .16, 4.4, 4.6, '#e7e0d0', group, true); box(-6, 2.2, 3.6, .16, 4.4, 2.8, '#e7e0d0', group, true);
  box(6, 2.2, 0, .16, 4.4, 10, '#dedbc9', group, true);
  box(0, .18, 5, 12.1, .36, .16, '#d4c4ac', group, true);
  box(0, .14, -4.88, 12, .26, .09, '#eee8da'); box(5.89, .14, 0, .09, .26, 10, '#eee8da'); box(-5.89, .14, -2.6, .09, .26, 4.8, '#eee8da');
  // Door on the west wall. The room swap is a deliberate small-world transition.
  const door = box(-5.88, 1.4, .8, .12, 2.8, 1.8, '#728875'); cameraMeshes.push(door); cylinder(-5.76, 1.4, 1.36, .05, .08, '#c8ad71').rotation.z = Math.PI / 2;
  const doorSign = label(kind === 'home' ? 'OUTSIDE →' : '← OUTSIDE', -5.76, 2.4, .8, 1.35); doorSign.rotation.y = Math.PI / 2;
  // Inset panels, brass latch and trim turn the exit into an actual door.
  for (const z of [.31, 1.24]) box(-5.795, 1.39, z, .03, 1.6, .69, '#647966');
  box(-5.75, 1.25, 1.37, .05, .23, .10, '#c8ad71');
  for (const z of [-.17, 1.77]) box(-5.82, 1.49, z, .22, 3.02, .10, '#eee8da');
  box(-5.82, 2.97, .8, .22, .12, 2.04, '#eee8da');
  interact('door', 'Go Outside', -4.9, .8, 'door', 1.8);
  // A soft rectangular daylight window, with layered mullions and curtains.
  const view = windowArtwork(); textures.add(view); const viewGeometry = new THREE.PlaneGeometry(2.48, 1.78); geometries.add(viewGeometry);
  const landscape = new THREE.Mesh(viewGeometry, new THREE.MeshBasicMaterial({ map: view })); landscape.position.set(0, 2.75, -5.025); group.add(landscape);
  for (const x of [-1.23, 1.23]) box(x, 2.75, -4.85, .13, 1.92, .19, '#eee8da');
  for (const y of [1.82, 3.68]) box(0, y, -4.85, 2.59, .13, .19, '#eee8da');
  box(0, 1.83, -4.64, 2.72, .10, .42, '#f2e7d4');
  box(0, 2.75, -4.63, .06, 1.62, .07, '#eee5d4'); box(0, 2.75, -4.63, 2.3, .06, .07, '#eee5d4');
  for (const x of [-1.46, 1.46]) { box(x, 2.72, -4.53, .35, 2.07, .12, '#ebe0cb'); for (let i = 0; i < 5; i++) box(x - .13 + i * .065, 2.72, -4.44, .025, 2.0, .04, '#d5c9b2'); }
  const light = new THREE.DirectionalLight('#fff0cc', 3.6); light.position.set(-3, 5, -8); light.target.position.set(0, 0, 2); group.add(light.target);
  light.castShadow = true; light.shadow.mapSize.set(2048, 2048); light.shadow.camera.left = -8; light.shadow.camera.right = 8; light.shadow.camera.top = 8; light.shadow.camera.bottom = -8; light.shadow.camera.near = .5; light.shadow.camera.far = 24; light.shadow.normalBias = .018; light.shadow.bias = -.00015; group.add(light);
  const fill = new THREE.HemisphereLight('#d5e3e6', '#9f826c', 1.85); group.add(fill);
  // Cutaway ceiling is invisible to the camera but keeps sunlight indoors believable.
  const roofGeo = new THREE.BoxGeometry(12.2, .08, 10.2); geometries.add(roofGeo);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); roof.position.y = 4.45; roof.castShadow = true; roof.renderOrder = -1; group.add(roof);
  const windowFill = new THREE.PointLight('#d9e7e6', 4, 8, 2); windowFill.position.set(0, 2.8, -4.2); group.add(windowFill);
  const shadowTex = softShadowTexture(); textures.add(shadowTex);
  const contact = (x: number, z: number, w: number, d: number) => { const geo = new THREE.PlaneGeometry(w, d); geometries.add(geo); const m = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: .72 }); const s = new THREE.Mesh(geo, m); s.rotation.x = -Math.PI / 2; s.position.set(x, .004, z); group.add(s); };
  contact(-3.65, -3.5, 3.1, 1.9); contact(-.4, -3.3, 3.2, 2); contact(3.5, -3.7, 3.6, 1.8);
  // Subtle lower wall paneling and picture rail, without adding room size.
  box(5.89, .69, 0, .07, 1.1, 9.9, '#bcc2ac'); box(5.82, 1.27, 0, .12, .07, 9.95, '#f0e7d5');
  for (let z = -4.5; z <= 4.5; z += 1) box(5.82, .69, z, .04, 1.06, .036, '#e0dfcd');
  box(0, 4.18, -4.88, 12.0, .10, .09, '#d4d6bd');
  plant(-5.1, -4.2, 1.25); plant(5.2, 3.9, 1.45);

  if (kind === 'home') {
    table(-3.65, -3.5, 2.45, 1.1);
    box(-3.65, 1.62, -3.77, 1.04, .7, .08, '#333e3d');
    box(-3.65, 1.62, -3.714, .94, .59, .01, '#708f81');
    label('RIPIFY / DESKTOP', -3.65, 1.63, -3.7, .86, '#e7eddf', '#708f81');
    box(-3.65, 1.3, -3.75, .08, .34, .06, '#3d4945'); box(-3.65, 1.24, -3.7, .5, .05, .3, '#3d4945');
    box(-3.65, 1.24, -3.2, .8, .045, .24, '#e3dfce');
    cylinder(-4.45, 1.36, -3.22, .11, .27, '#eae2d0');
    interact('computer', 'Use Computer', -3.65, -2.63, 'computer');
    table(-.4, -3.3, 2.6, 1.25); box(-.4, 1.23, -3.3, 1.92, .035, .85, '#637a71');
    for (let i = 0; i < 3; i++) pack(.13 + i * .15, 1.29 + i * .015, -3.25, PRODUCTS[0]).rotation.x = -Math.PI / 2;
    box(-1.35, 1.35, -3.65, .25, .25, .25, '#aa8760');
    cylinder(.68, 1.57, -3.55, .035, .7, '#5f6559');
    cylinder(.68, 1.91, -3.55, .21, .26, '#e9d7a9', .31).rotation.z = -.2;
    const deskLight = new THREE.SpotLight('#ffd098', 7, 4, .95, 1, 2); deskLight.position.set(.68, 1.78, -3.5); deskLight.target.position.set(-.1, 1.1, -3.1); group.add(deskLight, deskLight.target);
    const bulb = sphere(.68, 1.78, -3.55, .065, '#fff0c6'); bulb.material.emissive.set('#ffd596'); bulb.material.emissiveIntensity = .65;
    interact('desk', 'Open Pack', -.4, -2.3, 'desk', 2.25);
    box(3.5, .62, -3.78, 3.1, 1.24, .95, '#aa7953', group, true);
    for (const x of [2.5, 3.5, 4.5]) { box(x, .72, -3.285, .92, .94, .035, '#b7885f'); cylinder(x, .77, -3.25, .035, .055, '#5b5946').rotation.x = Math.PI / 2; }
    box(2.4, 1.32, -3.5, .68, .13, .9, '#a45642').rotation.y = -.15;
    box(2.05, 1.33, -3.5, .05, .14, .88, '#decdb2');
    for (let i = 0; i < 3; i++) box(2.07, 1.408, -3.78 + i * .23, .07, .014, .032, '#c8ad71');
    for (const x of [2.5, 3.5, 4.5]) { box(x, .7, -3.257, .76, .70, .027, '#486b67'); box(x + .26, .78, -3.224, .03, .18, .05, '#c8ad71'); }
    for (const x of [2.1, 4.9]) box(x, .085, -3.75, .15, .17, .64, '#755840');
    label('BINDER', 2.4, 1.393, -3.5, .43, '#ecd6b1', '#a45642').rotation.x = -Math.PI / 2;
    interact('binder', 'Open Binder', 2.45, -2.7, 'binder');
    for (let i = 0; i < 3; i++) { const slot = new THREE.Group(); slot.position.set(3.4 + i * .58, 1.31, -3.72); group.add(slot); displaySlots.push(slot); box(3.4 + i * .58, 1.28, -3.72, .36, .06, .25, '#524f40'); }
    interact('display', 'Arrange Display', 4.25, -2.7, 'display', 1.75);
    box(3.55, 2.64, -4.72, 3.6, .1, .48, '#9c7958');
    for (let i = 0; i < 11; i++) { const book = box(2.05 + i * .23, 2.9, -4.73, .16, .43 + (i % 3) * .1, .28, ['#667e6c', '#b1684f', '#d0b377', '#77929b'][i % 4]); if (i === 0) book.rotation.z = -.15; }
    label('GOOD THINGS TAKE A LITTLE LUCK', 3.55, 3.65, -4.88, 2.9, '#f4eada', '#77836c');
    box(4.65, .34, .7, 1.8, .55, 3.2, '#957355', group, true);
    box(4.65, .68, .7, 1.72, .27, 3.05, '#f0e5cd'); box(4.65, .85, 1.08, 1.73, .18, 2.28, '#8f9d82');
    box(4.65, .88, -.48, 1.27, .22, .55, '#faf0da');
    cameraMeshes.push(box(4.65, .73, -1.0, 1.88, 1.4, .12, '#927254'));
    for (let i = 0; i < 9; i++) box(3.87 + i * .2, .953, 1.22, .025, .007, 1.93, '#b2b99b');
    table(3, .2, .65, .7); cylinder(3, 1.5, .2, .02, .5, '#aa8d54'); cylinder(3, 1.8, .2, .16, .24, '#e4d6b1', .24);
    const bedsideLight = new THREE.PointLight('#ffce96', 2.1, 3.3); bedsideLight.position.set(3, 1.65, .2); group.add(bedsideLight);
    contact(4.65, .7, 2.4, 3.9); contact(-4.7, 3.1, 1.8, 1.8);
    box(4.65, .99, 1.65, 1.76, .09, .70, '#b28869');
    for (let i = 0; i < 7; i++) box(3.91 + i * .245, 1.038, 1.65, .021, .005, .64, '#ddc49e');
    for (const x of [4.23, 4.65, 5.07]) sphere(x, 1.05, -.925, .025, '#385c63');
    box(4.65, .89, -.43, 1.29, .035, .57, '#d9d1bb'); box(4.65, .93, -.43, 1.21, .09, .49, '#faf0da');
    box(-4.7, .47, 3.1, 1.35, .7, 1.4, '#b28869', group, true);
    cameraMeshes.push(box(-4.7, .79, 3.45, 1.4, .58, .24, '#b28869'));
    box(-4.7, .85, 3.25, .85, .27, .6, '#ddc49e');
    for (const x of [-5.37, -4.03]) box(x, .74, 3.08, .17, .46, 1.18, '#b28869');
    box(-4.7, .855, 2.89, 1, .12, .75, '#b88163');
    cylinder(-3.55, .49, 3.35, .34, .06, '#927852'); cylinder(-3.55, .24, 3.35, .045, .46, '#755840');
    box(-3.57, .545, 3.33, .34, .05, .25, '#667e6c'); box(-3.53, .59, 3.34, .30, .04, .23, '#e8d9b5');
    box(-1.28, 1.263, -3.2, .36, .06, .43, '#d3d5c4');
    for (let i = 0; i < 4; i++) box(-1.28, 1.297 + i * .006, -3.2, .31, .004, .39, '#f1eddd');
    box(.57, 1.265, -2.96, .38, .025, .23, '#b58b56'); box(.57, 1.282, -2.96, .33, .008, .18, '#ded4ad');
    cylinder(-.45, .66, -2.65, .32, .12, '#755840'); cylinder(-.45, .735, -2.65, .30, .045, '#637a71');
    for (const [dx, dz] of [[-.19, -.16], [.19, -.16], [0, .2]]) cylinder(-.45 + dx, .30, -2.65 + dz, .035, .59, '#755840');
    colliders.push({ minX: -.77, maxX: -.13, minZ: -2.97, maxZ: -2.33, height: .76 });
    for (let row = 0; row < 3; row++) for (let col = 0; col < 10; col++) box(-3.98 + col * .073, 1.267, -3.27 + row * .065, .05, .015, .042, col % 3 ? '#cecbbb' : '#879783');
    cylinder(-4.45, 1.50, -3.22, .083, .008, '#685342');
    const mugHandleGeo = new THREE.TorusGeometry(.07, .018, 5, 12); geometries.add(mugHandleGeo); const mugHandle = new THREE.Mesh(mugHandleGeo, mat('#eae2d0')); mugHandle.position.set(-4.32, 1.37, -3.22); group.add(mugHandle);
    cylinder(5.83, 2.93, -2, .30, .05, '#eee8da').rotation.z = Math.PI / 2;
    box(5.793, 3.01, -2, .01, .16, .025, '#536556').rotation.x = -.4; box(5.785, 2.95, -1.93, .01, .025, .13, '#536556');
    box(-.05, .018, .68, 4.9, .035, 3.3, '#b76f50'); box(-.05, .039, .68, 4.58, .007, 2.98, '#c58865');
    for (let i = 0; i < 8; i++) box(-.05, .044, -.65 + i * .38, 4.48, .005, .022, '#d9ac82');
    box(-3.96, 2.98, -4.86, 1.28, 1.34, .08, '#86684d'); box(-3.96, 2.98, -4.8, 1.1, 1.16, .02, '#e5ce9d');
    label('COLLECT MOMENTS', -3.96, 3, -4.775, 1, '#76664d', '#e5ce9d').scale.y = 1.5;
  } else {
    label('THE CORNER CARD SHOP', 0, 3.95, -4.85, 4, '#f3ebda', '#5e7565');
    // Keep the original three racks inside the room. Booster sets share the
    // pack rack; adding a catalog entry must not push a rack through the wall.
    const racks = [PRODUCTS.filter(p => p.type === 'booster'), PRODUCTS.filter(p => p.type === 'etb'), PRODUCTS.filter(p => p.type === 'upc')];
    for (let i = 0; i < racks.length; i++) {
      const x = -3.8 + i * 3.6, products = racks[i];
      box(x, 1.15, -3.7, 2.6, 2.3, .66, '#9d7956', group, true); box(x, 1.45, -3.345, 2.4, 1.5, .025, '#e6dbc3');
      for (let row = 0; row < 3; row++) { box(x, .7 + row * .55, -3.3, 2.45, .08, .52, '#b69065'); for (let col = 0; col < 6; col++) pack(x - .93 + col * .37, .96 + row * .55, -3.12, products[Math.floor(col * products.length / 6)]); }
      products.forEach((p, index) => {
        const anchor = x + (index - (products.length - 1) / 2) * 1.24;
        label(products.length > 1 ? p.setCode === 'sv03.5' ? 'SCARLET & VIOLET—151' : 'ASCENDED HEROES' : p.name.toUpperCase(), anchor, 2.6, -3.33, 2.45 / products.length, '#f6edd9', p.color);
        label(`${p.price} COINS`, anchor, .33, -3.33, 1.2, '#524e3f', '#e6dbc3');
        interact(`product-${p.code}`, `Buy ${p.name}`, anchor, -2.5, 'buy', 2, p);
      });

    }
    box(3.7, .75, 1.5, 3.5, 1.5, 1.2, '#9a7451', group, true); box(3.7, 1.55, 1.5, 3.7, .12, 1.38, '#dbc5a0');
    box(4.4, 1.79, 1.5, .48, .42, .4, '#697366'); label('CORNER CARDS', 3.3, 1.02, 2.112, 2.3, '#f2ead7', '#9a7451');
    // Simple shopkeeper; intentionally stationary, no unnecessary AI.
    cylinder(3.2, 1.24, .1, .24, .75, '#77816c'); sphere(3.2, 1.94, .1, .22, '#c89372'); sphere(3.2, 2.08, .1, .23, '#605447').scale.y = .45;
    interact('counter', 'Talk / Shop', 3.7, 2.5, 'shop', 2);
    // Dealer inventory is display-only: exact printings, never player-owned copies.
    table(-1.1, 1.3, 2.4, 1.4); box(-1.1, 1.23, 1.3, 2.15, .035, 1.12, '#6e8c7e');
    const glass = new THREE.MeshStandardMaterial({ color: '#dce8e4', transparent: true, opacity: .12, roughness: .12, depthWrite: false }); batchedMaterials.add(glass);
    for (const dx of [-1.22, 1.22]) box(-1.1 + dx, 1.43, 1.3, .045, .42, 1.45, '#aa8d54');
    const glassTop = box(-1.1, 1.65, 1.3, 2.45, .025, 1.45, '#dce8e4'); glassTop.material = glass; glassTop.castShadow = false;
    for (const dz of [-.7, .7]) { const pane = box(-1.1, 1.44, 1.3 + dz, 2.45, .4, .012, '#dce8e4'); pane.material = glass; pane.castShadow = false; }
    ['sv03.5-004', 'sv03.5-025', 'sv03.5-198', 'me02.5-276'].forEach((id, i) => {
      const card = CARD_BY_ID.get(id)!; const image = card.imageSmall ?? card.image; if (!image) return;
      box(-1.85 + i * .5, 1.262, 1.3, .34, .006, .474, '#cbc4a5');
      const texture = new THREE.TextureLoader().load(image, loaded => { if (disposed) loaded.dispose(); else invalidate(); }); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
      const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .55 }); batchedMaterials.add(material);
      const geo = new THREE.PlaneGeometry(.34, .474); geometries.add(geo); const face = new THREE.Mesh(geo, material); face.rotation.x = -Math.PI / 2; face.position.set(-1.85 + i * .5, 1.267, 1.3); group.add(face);
    });
    label('SINGLES / ASK AT THE COUNTER', -1.1, 1.06, 2.01, 1.8, '#eee5d0', '#6e8c7e');
    for (const x of [3.08, 3.32]) { cylinder(x, .48, .1, .08, .95, '#3f4942'); box(x, .08, .19, .16, .14, .3, '#343e38'); }
    for (const x of [2.91, 3.49]) cylinder(x, 1.22, .1, .075, .7, '#77816c');
    for (const x of [3.12, 3.28]) sphere(x, 1.98, .292, .025, '#363b32');
    label('BUY SEALED / SELL YOUR CARDS', 3.4, 2.85, -.9, 2.6, '#f3ebda', '#5e7565');
    box(-4.4, .4, 3.45, 1.3, .6, 1, '#ba9873', group, true); plant(-4.8, -4, 1.2);
  
  }
  // Static props sharing a material are batched. Collision/camera meshes remain separate.
  group.updateMatrixWorld(true);
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  group.traverse(o => { if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && o.material instanceof THREE.MeshStandardMaterial && !cameraMeshes.includes(o)) { const list = batches.get(o.material) ?? []; list.push(o); batches.set(o.material, list); } });
  for (const [material, meshes] of batches) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(m => (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld));
    const merged = mergeGeometries(parts); parts.forEach(p => p.dispose());
    if (!merged) continue;
    geometries.add(merged); const batch = new THREE.Mesh(merged, material); batch.castShadow = true; batch.receiveShadow = true; group.add(batch); meshes.forEach(m => m.removeFromParent());
  }
  const unbatched = new Set(cameraMeshes), mutableMaterials = new Set(productMaterials.values());
  group.traverse(o => { if (o instanceof THREE.Mesh && mutableMaterials.has(o.material as THREE.MeshStandardMaterial)) unbatched.add(o); });
  batchStaticColors(group, unbatched, geometries, batchedMaterials);
  return { group, colliders, cameraMeshes, interactions, displaySlots, spawn: kind === 'home' ? new THREE.Vector3(0, 0, 1.8) : new THREE.Vector3(.9, 0, 3.1), name: kind === 'home' ? 'Your room' : 'Corner Card Shop', bounds: ROOM_BOUNDS, ...(kind === 'home' ? { entrySpawn: new THREE.Vector3(-3.4, 0, .8), entryYaw: -Math.PI / 2 } : {}), dispose() { disposed = true; geometries.forEach(g => g.dispose()); palette.dispose(); productMaterials.forEach(m => m.dispose()); batchedMaterials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); group.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial) o.material.dispose(); if (o instanceof THREE.DirectionalLight || o instanceof THREE.PointLight || o instanceof THREE.SpotLight) o.dispose(); }); group.clear(); } };
}
