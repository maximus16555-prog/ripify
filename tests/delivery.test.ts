import { describe, it, expect } from 'vitest';
import { GameStore } from '../src/core/store';
import { ComputerServices } from '../src/core/computer';
import { createCard, seeded } from '../src/core/inventory';
import { makeDefect } from '../src/core/rare-events';
import { parseSave } from '../src/core/save';
import { layoutPackages, DELIVERY_AREA, shippingDimensions } from '../src/core/delivery';
import { gradedPopulation } from '../src/core/population';
import type { ShippingPackage } from '../src/core/types';

function fixture() {
  let raw = '', fail = false; const storage = { read: () => raw || null, write: (s: string) => { if (fail) throw Error('Storage full'); raw = s; }, backup: () => {} };
  const store = new GameStore(storage), services = new ComputerServices(store); store.state.computer!.minute = 570; store.state.currency = 10000;
  return { store, services, storage, read: () => raw, fail: () => { fail = true; } };
}
function open(store: GameStore, uid: string) { expect(store.packageStage(uid, 'untaped')).toBe(true); expect(store.packageStage(uid, 'open')).toBe(true); }
describe('physical delivery fulfillment', () => {
  it('orders arrive packaged, preserve seeds and exact IDs, remain sealed, and claim once', () => {
    const f = fixture(); f.services.checkout({ '151-booster': 2, '151-etb': 1, '151-upc': 1 }); const items = structuredClone(f.store.state.computer!.orders[0].items), before = f.store.state.packs.length;
    f.store.state.computer!.minute += 60; f.services.advance(); f.services.advance();
    expect(f.store.state.shippingPackages).toHaveLength(1); expect(f.store.state.packs).toHaveLength(before); expect(f.store.state.sealedProducts).toHaveLength(0);
    const p = f.store.state.shippingPackages![0]; expect(p.itemUids).toEqual(items.map(i => i.uid)); expect(f.store.claimPackage(p.uid)).toBe(false);
    const loaded = new GameStore(f.storage); expect(loaded.state.shippingPackages).toEqual(f.store.state.shippingPackages); open(loaded, p.uid); expect(loaded.claimPackage(p.uid)).toBe(true); expect(loaded.claimPackage(p.uid)).toBe(false);
    expect([...loaded.state.packs, ...loaded.state.sealedProducts].filter(i => p.itemUids.includes(i.uid))).toEqual([...items.filter(i => 'generationVersion' in i), ...items.filter(i => !('generationVersion' in i))]);
    expect(loaded.state.cards).toHaveLength(0); expect(loaded.state.opening).toBeNull(); expect(new GameStore(f.storage).claimPackage(p.uid)).toBe(false);
  });
  it('grading returns are locked in boxes until collected, retain condition/misprints/grade/history and never reroll', () => {
    const f = fixture(); const card = createCard('me02.5-276', 'real-pull', seeded(12), 'holo', 'pack'); card.misprint = { version: 1, modifier: 30, origin: 'individual', packUid: card.source, defect: makeDefect(seeded(17)) }; f.store.state.cards.push(card);
    f.store.submit(card.uid, 'BGS', 'Standard'); const o = structuredClone(f.store.state.orders[0]); f.store.arriveDeliveries(o.dueAt);
    const p = f.store.state.shippingPackages![0]; expect(p.source).toBe('grading'); expect(f.store.receive(o.uid, o.dueAt)).toBeNull(); expect(f.services.list('card', card.uid, 100)).toBe(false); expect(f.store.display(card.uid, 0)).toBe(false);
    const loaded = new GameStore(f.storage); open(loaded, p.uid); expect(loaded.claimPackage(p.uid, o.dueAt)).toBe(true);
    const returned = loaded.state.cards[0]; expect(returned.uid).toBe(card.uid); expect(returned.condition).toEqual(card.condition); expect(returned.misprint).toEqual(card.misprint); expect(returned.grade).toBe(o.result); expect(returned.subgrades).toEqual(o.subgrades); expect(returned.gradingHistory).toEqual([{ grader: 'BGS', grade: o.result, at: o.dueAt, orderUid: o.uid }]);
    expect(gradedPopulation(loaded.state, card.cardId, 'BGS', o.result)).toEqual({ current: 1, allTime: 1 }); expect(new GameStore(f.storage).state.cards[0]).toEqual(returned);
  });
  it('groups simultaneous returns by grader and keeps all exact ordered cards', () => {
    const f = fixture(); f.store.state.cards = Array.from({ length: 5 }, (_, i) => createCard('sv03.5-001', 'test', seeded(i), 'normal', 'pack'));
    for (const c of f.store.state.cards) f.store.submit(c.uid, 'PSA', 'Standard'); f.store.arriveDeliveries(Math.max(...f.store.state.orders.map(o => o.dueAt)));
    expect(f.store.state.shippingPackages).toHaveLength(1); const p = f.store.state.shippingPackages![0]; expect(p.itemUids).toHaveLength(5); expect(p.dimensions.height).toBeGreaterThan(shippingDimensions([], 1).height);
    open(f.store, p.uid); expect(f.store.claimPackage(p.uid, Number.MAX_SAFE_INTEGER)).toBe(true); expect(f.store.state.cards.every(c => c.status === 'graded')).toBe(true); expect(new Set(f.store.state.cards.map(c => c.uid)).size).toBe(5);
  });
  it('saving failures never partly arrive, open or claim a package', () => {
    const f = fixture(); f.services.checkout({ '151-booster': 1 }); f.store.state.computer!.minute += 60; f.services.advance(); const p = f.store.state.shippingPackages![0]; open(f.store, p.uid);
    const before = structuredClone(f.store.state), saved = f.read(); f.fail(); expect(f.store.claimPackage(p.uid)).toBe(false); expect(f.store.state).toEqual(before); expect(f.read()).toBe(saved);
    const g = fixture(); g.services.checkout({ '151-etb': 1 }); g.store.state.computer!.minute += 60; const original = structuredClone(g.store.state); g.fail(); expect(g.services.advance()).toBe(false); expect(g.store.state).toEqual(original);
  });
  it('partial opening resumes after reload; rapid duplicate actions cannot duplicate fulfillment', () => {
    const f = fixture(); f.services.checkout({ '151-booster': 1 }); f.store.state.computer!.minute += 60; f.services.advance(); const uid = f.store.state.shippingPackages![0].uid;
    expect(f.store.packageStage(uid, 'open')).toBe(false); expect(f.store.packageStage(uid, 'untaped')).toBe(true); expect(f.store.packageStage(uid, 'untaped')).toBe(false);
    const loaded = new GameStore(f.storage); expect(loaded.state.shippingPackages![0].stage).toBe('untaped'); loaded.packageStage(uid, 'open'); const again = new GameStore(f.storage); expect(again.claimPackage(uid)).toBe(true); expect(again.claimPackage(uid)).toBe(false); expect(again.state.packs).toHaveLength(2);
  });
  it('rejects duplicate/mismatched package contents and claimed-item resurrection on import', () => {
    const f = fixture(); f.services.checkout({ '151-booster': 1 }); f.store.state.computer!.minute += 60; f.services.advance();
    for (const corrupt of [(s: typeof f.store.state) => s.shippingPackages!.push(s.shippingPackages![0]), (s: typeof f.store.state) => s.shippingPackages![0].itemUids.push('wrong'), (s: typeof f.store.state) => { s.shippingPackages![0].dimensions.width = 4; }, (s: typeof f.store.state) => { s.packs.push(s.computer!.orders[0].items[0] as never); }]) { const s = structuredClone(f.store.state); corrupt(s); expect(() => parseSave(JSON.stringify(s))).toThrow(); }
  });
  it('old delivered orders do not create a second shipment or duplicate existing items', () => {
    const f = fixture(); f.services.checkout({ '151-booster': 1 }); const order = f.store.state.computer!.orders[0]; order.status = 'DELIVERED'; f.store.state.packs.push(order.items[0] as never); f.services.advance(); expect(f.store.state.shippingPackages).toHaveLength(0); expect(f.store.state.packs).toHaveLength(2);
  });
});
describe('controlled dimension-aware package stacking', () => {
  const boxes = (): ShippingPackage[] => Array.from({ length: 24 }, (_, i) => ({ uid: `delivery-${i}`, source: i % 2 ? 'grading' : 'store', orderUids: [`order-${i}`], itemUids: [`item-${i}`], dimensions: { width: .44 + i % 3 * .1, height: .18 + i % 4 * .04, depth: .4 + i % 3 * .1 }, stage: 'sealed', stackOrder: i, arrivedAt: 1 }));
  function verify(packages: ShippingPackage[]) {
    const result = layoutPackages(packages);
    for (const stack of new Set(result.map(p => p.stack))) {
      const list = result.filter(p => p.stack === stack); expect(list.length).toBeLessThanOrEqual(DELIVERY_AREA.maxCount); let y = .003, previous = { width: Infinity, depth: Infinity };
      for (const p of list) { const d = packages.find(b => b.uid === p.uid)!.dimensions; expect(p.y).toBeCloseTo(y); expect(d.width).toBeLessThanOrEqual(previous.width); expect(d.depth).toBeLessThanOrEqual(previous.depth); y += d.height; previous = d; }
      expect(y).toBeLessThanOrEqual(DELIVERY_AREA.maxHeight + .003);
    }
    return result;
  }
  it('mixed sizes/sources rest on support without overlap and use multiple capped stacks', () => { const all = boxes(), placed = verify(all); expect(placed).toHaveLength(all.length); expect(new Set(placed.map(p => p.stack)).size).toBeGreaterThan(1); expect(layoutPackages(structuredClone(all))).toEqual(placed); });
  it.each([0, 1, 3])('opening bottom/middle/top level %s leaves valid grounded stacks', level => { const all = boxes(), placed = verify(all), chosen = placed.find(p => p.level === level)!; all.find(p => p.uid === chosen.uid)!.stage = 'claimed'; expect(verify(all)).toHaveLength(23); });
  it('overflow is bounded and saved waiting packages backfill automatically', () => { const all = Array.from({ length: 50 }, (_, i) => ({ ...boxes()[0], uid: `delivery-${i}`, stackOrder: i })); const placed = verify(all); expect(placed).toHaveLength(36); all.find(p => p.uid === placed[0].uid)!.stage = 'claimed'; const next = verify(all); expect(next).toHaveLength(36); expect(next.some(p => !placed.some(old => old.uid === p.uid))).toBe(true); });
});
