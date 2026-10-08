import { PRODUCT_BY_ID } from '../data/products';
import type { Pack, Save, SealedProduct, ShippingPackage } from './types';

export const DELIVERY_AREA = { columns: 3, rows: 3, maxCount: 4, maxHeight: 1.8, x: -5.15, z: -1.18, cellWidth: 1.15, cellDepth: 1.02 };
export function shippingDimensions(items: (Pack | SealedProduct)[], slabs = 0): ShippingPackage['dimensions'] {
  if (slabs) return { width: .48, height: Math.min(.6, .115 + slabs * .037), depth: .71 };
  let width = .34, depth = .26, volume = 0;
  for (const item of items) {
    const type = PRODUCT_BY_ID.get(item.productId)!.type;
    const size = type === 'booster' ? [.21, .015, .14] : type === 'upc' ? [.49, .22, .33] : [.36, .22, .29];
    width = Math.max(width, size[0] + .075); depth = Math.max(depth, size[2] + .075);
    volume += size[0] * size[1] * size[2];
  }
  // Larger orders grow in all three dimensions, within the delivery area's cells.
  const growth = Math.max(1, Math.cbrt(volume / .025));
  width = Math.min(1.04, width * growth); depth = Math.min(.88, depth * growth);
  return { width, depth, height: Math.min(.65, Math.max(.15, volume / (width * depth) * 1.5 + .09)) };
}

/** Uses exact existing order references. Re-running arrival is idempotent. */
export function arrivePackages(s: Save, now = Date.now()) {
  const packages = s.shippingPackages ??= [];
  const add = (source: ShippingPackage['source'], orderUids: string[], itemUids: string[], dimensions: ShippingPackage['dimensions']) => {
    packages.push({ uid: `delivery-${orderUids[0]}`, source, orderUids, itemUids, dimensions, arrivedAt: now, stackOrder: packages.reduce((max, p) => Math.max(max, p.stackOrder), -1) + 1, stage: 'sealed' });
  };
  for (const order of s.computer?.orders ?? []) if (order.status === 'SHIPPING' && order.due <= s.computer!.minute) {
    add('store', [order.uid], order.items.map(i => i.uid), shippingDimensions(order.items)); order.status = 'DELIVERED';
  }
  // Group cards returning together from the same grader; no grading results are rerolled.
  const due = s.orders.filter(o => o.dueAt <= now && !packages.some(p => p.source === 'grading' && p.orderUids.includes(o.uid)));
  for (const grader of new Set(due.map(o => o.grader))) {
    const orders = due.filter(o => o.grader === grader);
    add('grading', orders.map(o => o.uid), orders.map(o => o.cardUid), shippingDimensions([], orders.length));
  }
  return packages;
}
export function deliveryDue(s: Save, now = Date.now()) {
  return s.computer?.orders.some(o => o.status === 'SHIPPING' && o.due <= s.computer!.minute) || s.orders.some(o => o.dueAt <= now && !s.shippingPackages?.some(p => p.source === 'grading' && p.orderUids.includes(o.uid)));
}

export interface PackagePlacement { uid: string; x: number; y: number; z: number; yaw: number; stack: number; level: number }
/** Controlled stacks, never free-body physics. Oversize footprints cannot sit on smaller boxes.
 * A bounded floor area holds nine stacks. Excess arrivals remain in the saved queue and
 * automatically fill a vacated position; they are never lost or silently claimed. */
export function layoutPackages(packages: ShippingPackage[]) {
  const waiting = packages.filter(p => p.stage !== 'claimed').sort((a, b) => b.dimensions.width * b.dimensions.depth - a.dimensions.width * a.dimensions.depth || a.stackOrder - b.stackOrder);
  const stacks: { width: number; depth: number; height: number; count: number }[] = [], placements: PackagePlacement[] = [];
  for (const p of waiting) {
    const d = p.dimensions;
    let index = stacks.findIndex(s => s.count < DELIVERY_AREA.maxCount && s.height + d.height <= DELIVERY_AREA.maxHeight && s.width >= d.width && s.depth >= d.depth);
    if (index < 0) {
      if (stacks.length >= DELIVERY_AREA.columns * DELIVERY_AREA.rows) continue;
      index = stacks.length; stacks.push({ width: d.width, depth: d.depth, height: .003, count: 0 });
    }
    const stack = stacks[index];
    // A single tiny yaw is shared by the entire stack, preserving support at corners.
    placements.push({ uid: p.uid, x: DELIVERY_AREA.x + index % DELIVERY_AREA.columns * DELIVERY_AREA.cellWidth, y: stack.height, z: DELIVERY_AREA.z + Math.floor(index / DELIVERY_AREA.columns) * DELIVERY_AREA.cellDepth, yaw: (index % 3 - 1) * .015, stack: index, level: stack.count });
    stack.width = d.width; stack.depth = d.depth; stack.height += d.height; stack.count++;
  }
  return placements;
}

export function validatePackages(value: unknown, save: Save): ShippingPackage[] {
  if (!Array.isArray(value)) throw Error('Invalid delivery packages');
  const ids = new Set<string>(), orders = new Set<string>(), pendingItems = new Set<string>(), ordinals = new Set<number>();
  const id = (v: unknown) => typeof v === 'string' && /^[\w.-]{1,100}$/.test(v);
  for (const p of value as ShippingPackage[]) {
    if (!p || !id(p.uid) || ids.has(p.uid) || !['store', 'grading'].includes(p.source) || !Array.isArray(p.orderUids) || !p.orderUids.length || !p.orderUids.every(id) || !Array.isArray(p.itemUids) || !p.itemUids.length || !p.itemUids.every(id) || new Set(p.itemUids).size !== p.itemUids.length || !p.dimensions || ![p.dimensions.width, p.dimensions.height, p.dimensions.depth].every(n => Number.isFinite(n) && n > 0) || p.dimensions.width > 1.04 || p.dimensions.depth > .88 || p.dimensions.height > .65 || !Number.isFinite(p.arrivedAt) || !Number.isSafeInteger(p.stackOrder) || p.stackOrder < 0 || ordinals.has(p.stackOrder) || !['sealed', 'untaped', 'open', 'claimed'].includes(p.stage) || (p.stage === 'claimed' ? !Number.isFinite(p.claimedAt) : p.claimedAt !== undefined)) throw Error('Invalid delivery package');
    ids.add(p.uid); ordinals.add(p.stackOrder);
    for (const uid of p.orderUids) { const key = `${p.source}:${uid}`; if (orders.has(key)) throw Error('Duplicate delivery order'); orders.add(key); }
    if (p.stage === 'claimed') continue;
    for (const uid of p.itemUids) { if (pendingItems.has(uid)) throw Error('Duplicate packaged item'); pendingItems.add(uid); }
    const actual = p.source === 'store' ? p.orderUids.flatMap(uid => {
      const o = save.computer?.orders.find(o => o.uid === uid && o.status === 'DELIVERED');
      if (!o) throw Error('Missing delivery order'); return o.items.map(i => i.uid);
    }) : p.orderUids.map(uid => {
      const o = save.orders.find(o => o.uid === uid && save.cards.some(c => c.uid === o.cardUid && c.status === 'grading'));
      if (!o) throw Error('Missing grading return'); return o.cardUid;
    });
    if (actual.length !== p.itemUids.length || actual.some(uid => !p.itemUids.includes(uid))) throw Error('Incorrect package contents');
    if (p.source === 'store' && p.itemUids.some(uid => [...save.packs, ...save.sealedProducts].some(i => i.uid === uid) || save.opening?.pack.uid === uid || save.productReceipts.some(r => r.productUid === uid) || save.packReceipts?.some(r => r.pack.uid === uid))) throw Error('Package already claimed');
  }
  for (const o of save.computer?.orders ?? []) if (o.status === 'SHIPPING' && orders.has(`store:${o.uid}`)) throw Error('Package arrived before shipping');
  return value as ShippingPackage[];
}
