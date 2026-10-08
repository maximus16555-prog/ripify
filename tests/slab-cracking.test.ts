import { receiveReturn } from './fixtures/receive-return';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GameStore } from '../src/core/store';
import { parseSave } from '../src/core/save';
import type { OwnedCard } from '../src/core/types';
import { createSlabCrack, crackDamageFactor } from '../src/core/slab-cracking';
import { gradedPopulation } from '../src/core/population';
import { ownedRawMarketValue, ownedValue, calculateGrade, gradeMultiplier, GRADERS } from '../src/core/economy';
import { makeDefect } from '../src/core/rare-events';
import { seeded } from '../src/core/inventory';
import { createPhysicalCard } from '../src/game/physical-card';
import { SlabCrackPresentation } from '../src/game/slab-crack-presentation';
import { crackDamageMarkup } from '../src/assets/crack-damage-presentation';
import { physicalCardSignature } from '../src/game/display-cards';

export const slabCopy = (): OwnedCard => ({ uid: 'slab-copy', cardId: 'me02.5-276', baseRawValue: 4582, condition: { centering: 91, corners: 88, edges: 94, surface: 86, print: 95 }, acquiredAt: 123, source: 'test-source', owner: 'local-player', finish: 'holo', origin: 'pack', favorite: true, status: 'graded', grader: 'PSA', grade: 9, gradingHistory: [{ grader: 'PSA', grade: 9, at: 456, orderUid: 'previous-order' }] });
function fixture(misprint = false) {
  let saved = '', failing = false, writes = 0;
  const storage = { read: () => saved || null, write: (s: string) => { if (failing) throw new Error('Full'); saved = s; writes++; }, backup: () => {} };
  const store = new GameStore(storage), card = slabCopy();
  if (misprint) card.misprint = { version: 1, modifier: 30, origin: 'individual', packUid: card.source, defect: makeDefect(seeded(15)) };
  store.state.cards = [card]; store.state.currency = 1000; store.persist();
  return { store, get card() { return store.state.cards.find(c => c.uid === card.uid) ?? card; }, storage, saved: () => saved, writes: () => writes, fail: () => { failing = true; } };
}
const textures = { face: () => new THREE.Texture(), label: () => new THREE.Texture() };

describe('transactional slab cracking', () => {
  it('safe cracking improves repairable condition on the exact owned object, preserving manufacturing and history', () => {
    const f = fixture(), before = structuredClone(f.card), conditionObject = f.card.condition;
    f.store.display(f.card.uid, 1); const count = f.writes();
    const event = f.store.crackSlab(f.card.uid, 0, 789)!;
    expect(event.outcome).toBe('safe'); expect(f.writes()).toBe(count + 1);
    expect(f.store.state.cards[0]).toBe(f.card); expect(f.card.condition).toBe(conditionObject);
    for (const key of ['corners', 'edges', 'surface'] as const) { expect(f.card.condition[key]).toBeGreaterThan(before.condition[key]); expect(f.card.condition[key] - before.condition[key]).toBe(event.improvement![key]); }
    expect(f.card.condition.centering).toBe(before.condition.centering); expect(f.card.condition.print).toBe(before.condition.print); expect(f.card.cardId).toBe(before.cardId);
    for (const field of ['uid', 'acquiredAt', 'source', 'favorite', 'origin', 'owner', 'finish', 'baseRawValue', 'gradingHistory'] as const) expect(f.card[field]).toEqual(before[field]);
    expect(f.card.status).toBe('raw'); expect(f.card.grader).toBeUndefined(); expect(f.card.grade).toBeUndefined();
    expect(f.store.state.displays).toEqual([null, null, null]); expect(f.store.state.cards).toHaveLength(1);
    expect(parseSave(f.saved()).cards[0]).toEqual(f.card);
  });
  it('successful recovery applies once, uses current condition on regrading and stops at a bounded ceiling', () => {
    const f = fixture(true), misprint = structuredClone(f.card.misprint), first = f.store.crackSlab(f.card.uid, 0)!;
    for (let i = 0; i < 4; i++) expect(new GameStore(f.storage).state.cards[0].condition).toEqual(first.conditionAfter);
    f.store.finishCrack(f.card.uid);
    for (let i = 0; i < 12; i++) {
      const before = { ...f.card.condition }; f.store.submit(f.card.uid, 'BGS', 'Standard'); const order = f.store.state.orders[0]; receiveReturn(f.store, order.uid, order.dueAt);
      const event = f.store.crackSlab(f.card.uid, 0)!; expect(event.conditionBefore).toEqual(before); f.store.finishCrack(f.card.uid);
    }
    expect(f.card.condition).toEqual({ centering: 91, corners: 98, edges: 98, surface: 98, print: 95 });
    expect(f.card.misprint).toEqual(misprint); expect(new GameStore(f.storage).state.cards[0]).toEqual(f.card);
  });
  it('old safe-crack saves keep their historical unchanged condition without retroactive repair', () => {
    const f = fixture(), e = f.store.crackSlab(f.card.uid, 0)!; delete e.improvement; e.conditionAfter = { ...e.conditionBefore }; f.card.condition = { ...e.conditionBefore };
    const loaded = parseSave(JSON.stringify(f.store.state)); expect(loaded.cards[0].condition).toEqual(e.conditionBefore); expect(loaded.cards[0].crackHistory![0].improvement).toBeUndefined();
  });
  it('recovery respects permanent damage and rejects inconsistent saved improvements', () => {
    const f = fixture(); f.store.crackSlab(f.card.uid, 1000); f.store.finishCrack(f.card.uid);
    const damage = structuredClone(f.card.crackHistory![0].damage);
    for (let i = 0; i < 16; i++) {
      f.store.submit(f.card.uid, 'PSA', 'Standard'); const order = f.store.state.orders[0]; receiveReturn(f.store, order.uid, order.dueAt);
      f.store.crackSlab(f.card.uid, 0); f.store.finishCrack(f.card.uid);
    }
    expect(f.card.condition.corners).toBeLessThan(98); expect(f.card.condition.edges).toBeLessThan(98);
    expect(f.card.crackHistory![0].damage).toEqual(damage);
    const state = structuredClone(f.store.state); state.cards[0].crackHistory!.at(-1)!.improvement!.corners++;
    expect(() => parseSave(JSON.stringify(state))).toThrow();
    expect(new GameStore(f.storage).state.cards[0]).toEqual(f.card);
  });
  it('failed cracking permanently damages condition and halves raw basis, never the graded value', () => {
    const f = fixture(), before = structuredClone(f.card), oldGraded = ownedValue(f.card, 0);
    const event = f.store.crackSlab(f.card.uid, 1000)!;
    expect(event.outcome).toBe('damaged'); expect(event.damage).toHaveLength(3);
    for (const field of ['corners', 'edges', 'surface'] as const) expect(f.card.condition[field]).toBeLessThan(before.condition[field]);
    for (const field of ['centering', 'print'] as const) expect(f.card.condition[field]).toBe(before.condition[field]);
    expect(ownedRawMarketValue(f.card, 0)).toBe(2291); expect(ownedValue(f.card, 0)).toBeLessThan(2291);
    expect(ownedRawMarketValue(f.card, 0)).not.toBe(oldGraded * .5);
    expect(f.store.state.cards).toHaveLength(1); expect(f.card.uid).toBe(before.uid);
    for (let i = 0; i < 5; i++) expect(ownedRawMarketValue(new GameStore(f.storage).state.cards[0], 0)).toBe(2291);
  });
  it('archives BGS subgrades with the former slab certificate', () => {
    const f = fixture(); f.card.grader = 'BGS'; f.card.subgrades = [9, 8.5, 9.5, 9];
    const subgrades = [...f.card.subgrades], event = f.store.crackSlab(f.card.uid, 0)!;
    expect(event.subgrades).toEqual(subgrades); expect(event.cert).toMatch(/^RFY-/);
    expect(f.card.subgrades).toBeUndefined(); expect(new GameStore(f.storage).state.cards[0].crackHistory![0].subgrades).toEqual(subgrades);
  });
  it('saves before notifications, blocks repeat commits and resolves an interrupted animation on reload', () => {
    const f = fixture(); let notified = false;
    f.store.subscribe(() => { notified = true; expect(JSON.parse(f.saved()).cards[0].status).toBe('raw'); });
    const result = f.store.crackSlab(f.card.uid, 1000)!; expect(notified).toBe(true);
    expect(f.store.crackSlab(f.card.uid, 0)).toBeNull(); expect(f.store.sell(f.card.uid)).toBe(false);
    expect(f.store.submit(f.card.uid, 'BGS', 'Standard')).toBe(false);
    const loaded = new GameStore(f.storage); expect(loaded.state.cards[0].crackHistory).toEqual([result]);
    expect(loaded.crackSlab(f.card.uid, 0)).toBeNull(); expect(loaded.state.cards).toHaveLength(1);
    expect(loaded.submit(f.card.uid, 'BGS', 'Standard')).toBe(true);
  });
  it('storage failure preserves the slab, condition, display and save', () => {
    const f = fixture(); f.store.display(f.card.uid, 0); const before = JSON.stringify(f.store.state), saved = f.saved(); f.fail();
    expect(f.store.crackSlab(f.card.uid, 1000)).toBeNull(); expect(JSON.stringify(f.store.state)).toBe(before);
    expect(f.saved()).toBe(saved); expect(f.store.canCrack(f.card.uid)).toBe(true);
  });
  it.each(['ebay', 'trade', 'transfer'] as const)('respects %s ownership locks', kind => {
    const f = fixture(); f.card.ownershipLock = { kind, uid: 'lock-id' };
    expect(f.store.crackSlab(f.card.uid, 0)).toBeNull(); expect(f.store.sell(f.card.uid)).toBe(false); expect(f.store.display(f.card.uid, 1)).toBe(false);
    expect(new GameStore({ ...f.storage, read: () => JSON.stringify(f.store.state) }).state.cards[0].ownershipLock).toEqual(f.card.ownershipLock);
  });
  it('rejects raw, unowned, missing and grading-order locked cards', () => {
    const f = fixture(); expect(f.store.crackSlab('missing')).toBeNull();
    f.card.status = 'raw'; expect(f.store.crackSlab(f.card.uid)).toBeNull();
    f.card.status = 'grading'; expect(f.store.crackSlab(f.card.uid)).toBeNull();
    f.card.status = 'graded'; f.card.owner = 'someone-else' as OwnedCard['owner']; expect(f.store.crackSlab(f.card.uid)).toBeNull();
    f.card.owner = 'local-player'; f.store.state.orders.push({ uid: 'order', cardUid: f.card.uid } as never); expect(f.store.crackSlab(f.card.uid)).toBeNull();
  });
  it.each([0, 1000])('keeps manufacturing misprints and applies the 30× modifier once (seed %s)', seed => {
    const f = fixture(true), misprint = structuredClone(f.card.misprint);
    f.store.crackSlab(f.card.uid, seed); expect(f.card.misprint).toEqual(misprint);
    expect(ownedRawMarketValue(f.card, 0)).toBe(4582 * 30 * (seed === 0 ? 1 : .5));
    f.store.finishCrack(f.card.uid); expect(f.store.submit(f.card.uid, 'BGS', 'Standard')).toBe(true);
    const order = f.store.state.orders[0]; receiveReturn(f.store, order.uid, order.dueAt);
    expect(f.card.misprint).toEqual(misprint); expect(f.card.gradingHistory).toHaveLength(2);
    expect(f.card.crackHistory).toHaveLength(1);
    expect(ownedValue(f.card, 0)).toBeCloseTo(Math.round(ownedRawMarketValue(f.card, 0) * gradeMultiplier(f.card.grade!) * GRADERS.BGS.premium * 100) / 100);
  });
  it('updates current/all-time distinct-copy population and never double-counts regrades', () => {
    const f = fixture(); expect(gradedPopulation(f.store.state, f.card.cardId, 'PSA', 9)).toEqual({ current: 1, allTime: 1 });
    f.store.crackSlab(f.card.uid, 0); expect(gradedPopulation(f.store.state, f.card.cardId, 'PSA', 9)).toEqual({ current: 0, allTime: 1 });
    f.store.finishCrack(f.card.uid); f.store.submit(f.card.uid, 'PSA', 'Standard');
    const order = f.store.state.orders[0]; order.result = 9; receiveReturn(f.store, order.uid, order.dueAt);
    expect(gradedPopulation(f.store.state, f.card.cardId, 'PSA', 9)).toEqual({ current: 1, allTime: 1 });
    f.store.sell(f.card.uid); const reloaded = new GameStore(f.storage);
    expect(gradedPopulation(reloaded.state, f.card.cardId, 'PSA', 9)).toEqual({ current: 0, allTime: 1 });
  });
  it('valuable and bulk cards use the identical independent 50/50 decision', () => {
    for (let seed = 0; seed < 10000; seed += 83) expect(createSlabCrack(slabCopy(), seed).outcome).toBe(createSlabCrack({ ...slabCopy(), cardId: 'sve-1', baseRawValue: .2, grade: 3 }, seed).outcome);
  });
  it('rejects repeated crack events, invalid modifiers and altered physical history on import', () => {
    const f = fixture(); f.store.crackSlab(f.card.uid, 1000);
    for (const corrupt of [(s: typeof f.store.state) => s.cards[0].crackHistory!.push(s.cards[0].crackHistory![0]), (s: typeof f.store.state) => { s.cards[0].crackHistory![0].rawModifier = 30 as never; }, (s: typeof f.store.state) => { s.cards[0].condition.corners++; }]) {
      const state = structuredClone(f.store.state); corrupt(state); expect(() => parseSave(JSON.stringify(state))).toThrow();
    }
  });
  it('independent failed attempts apply once each, while inspection/reload never reapplies damage', () => {
    const f = fixture(); f.store.crackSlab(f.card.uid, 1000); f.store.finishCrack(f.card.uid);
    f.store.submit(f.card.uid, 'PSA', 'Standard'); receiveReturn(f.store, f.store.state.orders[0].uid, f.store.state.orders[0].dueAt);
    f.store.crackSlab(f.card.uid, 1000); expect(crackDamageFactor(f.card)).toBe(.25);
    expect(new GameStore(f.storage).state.cards[0]).toEqual(f.card);
  });
});

describe('physical crack damage and presentation', () => {
  it('keeps side-specific defects, matching bent geometry, raw/slab appearance and disposal', () => {
    const f = fixture(true); f.store.crackSlab(f.card.uid, 1000); const original = JSON.stringify(f.card);
    const raw = createPhysicalCard(f.card, textures), slab = createPhysicalCard({ ...f.card, status: 'graded', grader: 'BGS', grade: 7 }, textures);
    expect(raw.group.userData.crackDamage).toEqual(slab.group.userData.crackDamage);
    expect(crackDamageMarkup(f.card)).toContain('<svg'); expect(crackDamageMarkup(f.card, 'back')).not.toBe(crackDamageMarkup(f.card));
    for (const name of ['cardstock', 'card-front', 'card-back']) {
      const a = (raw.group.getObjectByName(name) as THREE.Mesh).geometry.getAttribute('position');
      const b = (slab.group.getObjectByName(name) as THREE.Mesh).geometry.getAttribute('position');
      expect(Array.from(a.array)).toEqual(Array.from(b.array));
    }
    expect(new THREE.Box3().setFromObject(raw.group).getSize(new THREE.Vector3()).z).toBeGreaterThan(.0015);
    expect(physicalCardSignature(f.card)).toBe(physicalCardSignature(JSON.parse(original)));
    expect(calculateGrade(f.card, 'PSA', () => .5).grade).toBeLessThan(calculateGrade({ ...f.card, condition: slabCopy().condition }, 'PSA', () => .5).grade);
    raw.dispose(); slab.dispose(); expect(JSON.stringify(f.card)).toBe(original);
  });
  it('physically separates shell pieces and withdraws the same UID without creating inventory', () => {
    const f = fixture(), before = structuredClone(f.card), slab = createPhysicalCard(before, textures); f.store.crackSlab(f.card.uid, 1000);
    const animation = new SlabCrackPresentation(slab, f.card, textures);
    animation.update(0); expect(animation.raw.group.visible).toBe(false);
    animation.update(.2); expect(slab.group.userData.fractureState).toBe('stressed'); expect(slab.group.getObjectByName('slab-cover-front')!.visible).toBe(true);
    animation.update(.35); expect(slab.group.userData.fractureState).toBe('initial');
    animation.update(.5); expect(slab.group.getObjectByName('slab-cover-front')!.visible).toBe(false); expect(slab.group.getObjectByName('broken-slab-corner')).toBeTruthy();
    animation.update(1); expect(animation.raw.group.visible).toBe(true); expect(animation.raw.group.userData.uid).toBe(f.card.uid);
    expect(slab.group.getObjectByName('card-front')!.visible).toBe(false); expect(f.store.state.cards).toHaveLength(1);
    animation.dispose(); slab.dispose();
  });
});
