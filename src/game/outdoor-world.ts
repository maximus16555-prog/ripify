import * as THREE from 'three';
import type { World } from './world';

/** World-space dimensions. Future buildings register colliders, camera meshes
 * and interaction points through the same World contract as the bedroom. */
export const OUTDOOR_CONFIG = {
  width: 120, depth: 120,
  house: { x: 0, z: 8, width: 8, depth: 6, height: 4.4 },
};
export const SHOP_EXTERIOR = { x: 14, z: 2, width: 10, depth: 7, height: 4.4 };
export const SHOP_RETURN_SPAWN = new THREE.Vector3(SHOP_EXTERIOR.x, 0, SHOP_EXTERIOR.z - SHOP_EXTERIOR.depth / 2 - 3.4);

export function buildOutdoorWorld(config = OUTDOOR_CONFIG): World {
  const group = new THREE.Group(); group.name = 'outdoor-world';
  const objects = new THREE.Group(); objects.name = 'world-objects'; group.add(objects);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string) => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .95 }));
    return materials.get(color)!;
  };
  const box = (parent: THREE.Group, name: string, x: number, y: number, z: number, w: number, h: number, d: number, color: string) => {
    const geometry = new THREE.BoxGeometry(w, h, d); geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material(color)); mesh.name = name; mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const ground = box(group, 'baseplate', 0, -.15, 0, config.width, .3, config.depth, '#88a16d'); ground.castShadow = false;
  const { x, z, width, depth, height } = config.house, front = z - depth / 2;
  const house = new THREE.Group(); house.name = 'player-house'; objects.add(house);
  const shell = box(house, 'house-shell', x, height / 2, z, width, height, depth, '#d3ccbb');
  const roof = box(house, 'roof', x, height + .18, z, width + .45, .36, depth + .45, '#646e65');
  box(house, 'roof-trim', x, height - .1, front - .05, width + .24, .18, .18, '#eee5d3');
  box(house, 'entrance-door', x, 1.35, front - .065, 1.5, 2.7, .12, '#536f66');
  for (const dx of [-.84, .84]) box(house, 'door-frame', x + dx, 1.44, front - .15, .14, 2.88, .18, '#f2e9d7');
  box(house, 'door-lintel', x, 2.9, front - .15, 1.82, .16, .18, '#f2e9d7');
  box(house, 'door-handle', x + .53, 1.3, front - .16, .07, .22, .05, '#ba9f6a');
  for (const dx of [-2.55, 2.55]) {
    box(house, 'window-frame', x + dx, 2.3, front - .04, 1.65, 1.5, .1, '#eee5d3');
    box(house, 'window-glass', x + dx, 2.3, front - .1, 1.4, 1.25, .035, '#7e9ba1');
    box(house, 'window-mullion', x + dx, 2.3, front - .13, .055, 1.3, .04, '#eee5d3');
  }
  // Ground-level entry apron: no step or collider that can trap the spawn.
  const apron = box(group, 'entry-apron', x, -.018, front - 2.5, 3, .04, 5, '#b8b5a1'); apron.castShadow = false;
  const shop = new THREE.Group(); shop.name = 'corner-card-shop'; objects.add(shop);
  const s = SHOP_EXTERIOR, shopFront = s.z - s.depth / 2;
  const shopShell = box(shop, 'shop-shell', s.x, s.height / 2, s.z, s.width, s.height, s.depth, '#c5bb9f');
  const shopRoof = box(shop, 'shop-roof', s.x, s.height + .12, s.z, s.width + .35, .24, s.depth + .35, '#526e65');
  box(shop, 'shop-door', s.x, 1.4, shopFront - .08, 1.65, 2.8, .14, '#547e74');
  for (const dx of [-.93, .93]) box(shop, 'shop-door-frame', s.x + dx, 1.47, shopFront - .15, .13, 2.94, .2, '#eee8d7');
  for (const dx of [-3.1, 3.1]) {
    box(shop, 'storefront-frame', s.x + dx, 1.65, shopFront - .07, 2.6, 2.3, .12, '#eee8d7');
    box(shop, 'storefront-glass', s.x + dx, 1.65, shopFront - .14, 2.35, 2.05, .035, '#789894');
    box(shop, 'window-sill', s.x + dx, .46, shopFront - .2, 2.7, .12, .28, '#526e65');
  }
  box(shop, 'shop-sign-board', s.x, 3.62, shopFront - .19, 8.2, .9, .2, '#345d55');
  let signTexture: THREE.Texture | undefined, signMaterial: THREE.Material | undefined;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#345d55'; ctx.fillRect(0,0,1024,128); ctx.fillStyle = '#f5edd7'; ctx.font = '600 48px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CORNER CARDS · POKÉMON TCG',512,83);
    signTexture = new THREE.CanvasTexture(canvas); signTexture.colorSpace = THREE.SRGBColorSpace;
    signMaterial = new THREE.MeshBasicMaterial({ map: signTexture }); const geo = new THREE.PlaneGeometry(7.9,.8); geometries.add(geo);
    const sign = new THREE.Mesh(geo,signMaterial); sign.position.set(s.x,3.62,shopFront - .3); shop.add(sign);
  }
  box(group, 'shop-entry-apron', s.x, -.018, shopFront - 2.5, 4, .04, 5, '#b8b5a1').castShadow = false;
  const sun = new THREE.DirectionalLight('#fff0d4', 3.1); sun.position.set(x - 18, 32, z - 22); sun.target.position.set(x, 0, z);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 75 });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.00015;
  const ambient = new THREE.HemisphereLight('#dceaf0', '#8c916a', 1.9); group.add(sun, sun.target, ambient);
  group.updateMatrixWorld(true);
  return {
    group, name: 'Outside', displaySlots: [],
    bounds: { minX: -config.width / 2 + .35, maxX: config.width / 2 - .35, minZ: -config.depth / 2 + .35, maxZ: config.depth / 2 - .35 },
    spawn: new THREE.Vector3(x, 0, front - 3.4), spawnYaw: 0,
    atmosphere: { sky: '#bed3dc', fogNear: 55, fogFar: 135, viewDistance: 180 },
    colliders: [
      { minX: -config.width / 2, maxX: config.width / 2, minZ: -config.depth / 2, maxZ: config.depth / 2, height: 0 },
      { minX: x - width / 2, maxX: x + width / 2, minZ: front, maxZ: z + depth / 2, height: height + .36 },
      { minX: s.x - s.width / 2, maxX: s.x + s.width / 2, minZ: shopFront, maxZ: s.z + s.depth / 2, height: s.height + .24 },
    ],
    cameraMeshes: [shell, roof, shopShell, shopRoof],
    interactions: [{ id: 'house-entrance', label: 'Go Inside', action: 'door', destination: 'home', radius: 1.9,
      position: new THREE.Vector3(x, 0, front - 1.35), anchor: new THREE.Vector3(x, 1.6, front - .2) },
      { id: 'shop-entrance', label: 'Enter Card Shop', action: 'door', destination: 'shop', radius: 1.9,
        position: new THREE.Vector3(s.x, 0, shopFront - 1.35), anchor: new THREE.Vector3(s.x, 1.6, shopFront - .2) }],
    dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); signTexture?.dispose(); signMaterial?.dispose(); sun.dispose(); group.clear(); },
  };
}
