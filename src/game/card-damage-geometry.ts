import * as THREE from 'three';
import type { OwnedCard } from '../core/types';
import { crackDamage } from '../core/slab-cracking';
import { cardDamageOutline } from '../assets/card-damage-shape';
export function damagedCardShape(owned: OwnedCard, width: number, height: number, radius: number, rear = false) {
  const shape = new THREE.Shape();
  cardDamageOutline(owned, radius / width, radius / height).forEach(([x, y], i) => { const px = (rear ? .5 - x : x - .5) * width, py = (.5 - y) * height; if (!i) shape.moveTo(px, py); else shape.lineTo(px, py); });
  shape.closePath(); return shape;
}
/** Modest triangle refinement only for damaged copies; no per-frame tessellation or physics. */
export function refineDamageGeometry(geo: THREE.BufferGeometry, owned: OwnedCard) {
  if (!crackDamage(owned).some(d => ['bent-corner', 'crease', 'dent'].includes(d.type))) return geo;
  let source = geo.index ? geo.toNonIndexed() : geo;
  if (source !== geo) geo.dispose();
  for (let level = 0; level < 2; level++) {
    const next = new THREE.BufferGeometry();
    for (const name of ['position', 'uv']) {
      const attr = source.getAttribute(name); if (!attr) continue;
      const values: number[] = [], size = attr.itemSize;
      for (let i = 0; i < attr.count; i += 3) {
        const v = [0, 1, 2].map(n => Array.from({ length: size }, (_, k) => attr.array[(i + n) * size + k]));
        const m = v.map((a, n) => a.map((x, k) => (x + v[(n + 1) % 3][k]) / 2));
        for (const triangle of [[v[0], m[0], m[2]], [m[0], v[1], m[1]], [m[2], m[1], v[2]], [m[0], m[1], m[2]]]) values.push(...triangle.flat());
      }
      next.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
    }
    source.dispose(); source = next;
  }
  return source;
}
export function cardDamageHeight(owned: OwnedCard, u: number, v: number) {
  let z = 0;
  for (const d of crackDamage(owned)) {
    const dx = u - d.x, dy = (v - d.y) * 921 / 660;
    if (d.type === 'bent-corner') { const distance = Math.abs(dx) + Math.abs(dy); z += Math.max(0, 1 - distance / (d.length * 1.5)) ** 2 * .012 * d.severity; }
    if (d.type === 'crease') {
      const along = dx * Math.cos(d.angle) + dy * Math.sin(d.angle), across = -dx * Math.sin(d.angle) + dy * Math.cos(d.angle);
      z += Math.exp(-((across / .027) ** 2)) * Math.max(0, 1 - Math.abs(along) / d.length) * .0035 * d.severity;
    }
    if (d.type === 'dent') z -= Math.exp(-((dx / .045) ** 2 + (dy / .025) ** 2)) * .0025 * d.severity;
  }
  return z;
}
