import { receiveReturn } from './fixtures/receive-return';
import { describe, it, expect } from 'vitest';
import { CARDS, CARD_BY_ID, PRODUCTS } from '../src/data/cards';
import { calculateGrade, GRADERS, ownedValue } from '../src/core/economy';
import { generatePack, pickRarity } from '../src/core/packs';
import { loadSave, newSave, parseSave, type SaveStorage } from '../src/core/save';
import { createPack, canOpenProduct } from '../src/core/inventory';
import { GameStore, orderStatus } from '../src/core/store';
import type { Grader, Pack } from '../src/core/types';
import { PACK_BALANCE, PRODUCT_PRICES } from '../src/data/balance';
function memory(): SaveStorage { let raw: string | null = null; return { read: () => raw, write: data => { raw = data; }, backup: () => {} }; }
function seeded(seed: number) { return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; }; }
const pack: Pack = { ...createPack(), uid: 'pack', seed: 12, purchasedAt: 0 };
describe('pack generation', () => {
  it('creates ten set cards plus one Basic Energy, with three foil slots', () => {
    const cards = generatePack(pack, seeded(12));
    expect(cards).toHaveLength(11); expect(new Set(cards.map(c => c.uid)).size).toBe(11);
    expect(CARD_BY_ID.get(cards[0].cardId)!.setCode).toBe('sve');
    expect(cards.slice(1).every(c => CARD_BY_ID.get(c.cardId)!.setCode === 'sv03.5')).toBe(true);
    expect(cards.slice(1, 5).every(c => CARD_BY_ID.get(c.cardId)!.rarity === 'Common')).toBe(true);
    expect(cards.slice(5, 8).every(c => CARD_BY_ID.get(c.cardId)!.rarity === 'Uncommon')).toBe(true);
    expect(cards.slice(8).every(c => ['holo', 'reverse'].includes(c.finish))).toBe(true);
    expect(cards.every(c => Object.values(c.condition).every(v => v >= 56 && v <= 100))).toBe(true);
  });
  it('keeps chase cards rare over a large seeded simulated sample', () => {
    const random = seeded(44); const count: Record<string, number> = {};
    for (let i = 0; i < 100000; i++) { const r = pickRarity(random); count[r] = (count[r] ?? 0) + 1; }
    expect(count['Hyper rare'] / 100000).toBeGreaterThan(.003); expect(count['Hyper rare'] / 100000).toBeLessThan(.005);
    expect(count.Rare / 100000).toBeCloseTo(PACK_BALANCE['sv03.5'].finalSlot.rare, 2);
  });
  it('uses its saved seed for stable printing and condition outcomes', () => {
    const a = generatePack(pack); const b = generatePack(pack);
    expect(a.map(c => [c.cardId, c.condition, c.finish])).toEqual(b.map(c => [c.cardId, c.condition, c.finish]));
  });
  it('rejects unknown sets without mutating inventory', () => expect(() => generatePack({ ...pack, setCode: 'missing' })).toThrow());
});
describe('inventory and opening transactions', () => {
  it('purchases unopened packs without generating cards', () => { const s = new GameStore(memory()); expect(s.buy('151-booster')).toBe(true); expect(s.state.currency).toBe(112); expect(s.state.packs).toHaveLength(2); expect(s.state.cards).toHaveLength(0); expect(s.state.opening).toBeNull(); });
  it('rejects insufficient funds and unknown products', () => { const s = new GameStore(memory()); s.state.currency = 0; expect(s.buy('151-booster')).toBe(false); expect(s.buy('unknown')).toBe(false); expect(s.state.packs).toHaveLength(1); });
  it('requires a rip and eleven manual actions before collection; cannot duplicate', () => {
    const storage = memory(); const s = new GameStore(storage); const id = s.state.packs[0].uid;
    expect(s.startOpening(id)).toBe(true); expect(s.startOpening(id)).toBe(false); expect(s.swipe()).toBe(false); expect(s.collect()).toBe(false);
    expect(s.rip()).toBe(true); expect(s.rip()).toBe(false);
    for (let i = 0; i < 10; i++) { expect(s.state.opening!.index).toBe(i); expect(s.swipe()).toBe(true); expect(s.collect()).toBe(false); }
    expect(s.state.opening!.stage).toBe('cards'); expect(s.state.cards).toHaveLength(0);
    expect(s.swipe()).toBe(true); expect(s.state.opening!.stage).toBe('complete'); expect(s.swipe()).toBe(false);
    expect(s.collect()).toBe(true); expect(s.collect()).toBe(false); expect(s.state.cards).toHaveLength(11); expect(s.state.stats.opened).toBe(1);
    expect(new GameStore(storage).state.cards).toHaveLength(11);
  });
  it('persists an opening without rerolling or skipping', () => {
    const storage = memory(); const s = new GameStore(storage); s.startOpening(s.state.packs[0].uid); s.rip(); s.swipe();
    const reload = new GameStore(storage); expect(reload.state.opening).toEqual(s.state.opening); expect(reload.state.packs).toHaveLength(0); expect(reload.state.cards).toHaveLength(0);
  });
});
function withCards() { const s = new GameStore(memory()); s.startOpening(s.state.packs[0].uid); s.rip(); for (let i = 0; i < 11; i++) s.swipe(); s.collect(); return s; }
describe('grading and selling', () => {
  it('derives grades primarily from condition and respects company increments', () => {
    const good = generatePack(pack)[0]; good.condition = { centering: 100, corners: 100, edges: 100, surface: 100, print: 100 };
    const poor = { ...good, condition: { centering: 50, corners: 50, edges: 50, surface: 50, print: 50 } };
    for (const grader of Object.keys(GRADERS) as Grader[]) {
      const high = calculateGrade(good, grader, () => .5).grade; const low = calculateGrade(poor, grader, () => .5).grade;
      expect(high).toBeGreaterThan(low + 3); expect(high).toBeLessThanOrEqual(10); expect(low).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(high * (GRADERS[grader].half ? 2 : 1))).toBe(true);
    }
  });
  it('penalizes one damaged attribute, even with a strong average', () => { const c = generatePack(pack)[0]; c.condition = { centering: 100, corners: 100, edges: 100, surface: 100, print: 100 }; const pristine = calculateGrade(c, 'PSA', () => .5); c.condition.surface = 40; expect(calculateGrade(c, 'PSA', () => .5).grade).toBeLessThan(pristine.grade); });
  it('locks submitted cards and prevents early or duplicate returns', () => {
    const s = withCards(); const c = s.state.cards[0]; s.display(c.uid, 0); const before = s.state.currency;
    expect(s.submit(c.uid, 'BGS', 'Standard')).toBe(true); expect(s.state.currency).toBe(before - 16); expect(s.state.displays[0]).toBeNull(); expect(s.sell(c.uid)).toBe(false); expect(s.display(c.uid, 1)).toBe(false); expect(s.submit(c.uid, 'PSA', 'Standard')).toBe(false);
    const o = s.state.orders[0]; expect(receiveReturn(s, o.uid, o.dueAt - 1)).toBeNull(); const result = receiveReturn(s, o.uid, o.dueAt); expect(result!.status).toBe('graded'); expect(result!.subgrades).toHaveLength(4); expect(receiveReturn(s, o.uid, o.dueAt)).toBeNull(); expect(result!.gradingHistory).toEqual([{ grader: 'BGS', grade: o.result, at: o.dueAt, orderUid: o.uid }]);
  });
  it('sells exactly once and removes display references', () => { const s = withCards(); const c = s.state.cards[0]; const value = ownedValue(c, s.state.marketSeed); const before = s.state.currency; s.display(c.uid, 0); expect(s.sell(c.uid)).toBe(true); expect(s.sell(c.uid)).toBe(false); expect(s.state.cards).toHaveLength(10); expect(s.state.currency).toBe(Math.round((before + value) * 100) / 100); expect(s.state.displays[0]).toBeNull(); });
  it('reports short shipping states', () => { expect(orderStatus(0, 100, 10)).toBe('Shipped'); expect(orderStatus(0, 100, 50)).toBe('Grading'); expect(orderStatus(0, 100, 90)).toBe('Returning'); expect(orderStatus(0, 100, 101)).toBe('Delivered'); });
});
describe('save schema and recovery', () => {
  it('round-trips all important state', () => { const s = withCards(); s.favorite(s.state.cards[0].uid); s.display(s.state.cards[0].uid, 1); s.submit(s.state.cards[1].uid, 'TAG', 'Express'); expect(parseSave(JSON.stringify(s.state))).toEqual(s.state); });
  it('rejects malformed data, unknown versions, invalid conditions, duplicate cards and negative money', () => {
    expect(() => parseSave('{')).toThrow();
    const s = withCards().state;
    expect(() => parseSave(JSON.stringify({ ...s, version: 999 }))).toThrow(); expect(() => parseSave(JSON.stringify({ ...s, currency: -1 }))).toThrow(); expect(() => parseSave(JSON.stringify({ ...s, cards: [s.cards[0], s.cards[0]] }))).toThrow();
    s.cards[0].condition.edges = 999; expect(() => parseSave(JSON.stringify(s))).toThrow();
  });
  it('repairs missing optional settings and dangling display references', () => { const s = newSave(); const parsed = parseSave(JSON.stringify({ ...s, settings: {}, displays: ['missing'] })); expect(parsed.settings.graphics).toBe('Auto'); expect(parsed.displays).toEqual([null, null, null]); });
  it('keeps a recovery copy and handles storage errors', () => {
    let backup = ''; const loaded = loadSave({ read: () => '{bad', write: () => {}, backup: data => { backup = data; } }); expect(backup).toBe('{bad'); expect(loaded.warning).toContain('recovery'); expect(loaded.save.currency).toBe(120);
    const s = new GameStore({ read: () => { throw new Error('Storage'); }, write: () => { throw new Error('Quota'); }, backup: () => {} }); expect(s.warning).toContain('temporary'); s.buy('151-booster'); expect(s.warning).toContain('Export');
  });
  it('rejects import before touching the current game', () => { const s = new GameStore(memory()); const before = JSON.stringify(s.state); expect(() => s.import('{}')).toThrow(); expect(JSON.stringify(s.state)).toBe(before); });
  it('rejects duplicated opening cards and mismatched opening stages', () => { const s = new GameStore(memory()); s.startOpening(s.state.packs[0].uid); const raw = JSON.stringify(s.state); s.state.opening!.index = 8; expect(() => parseSave(JSON.stringify(s.state))).toThrow(); s.state = parseSave(raw); s.state.opening!.cards[1].uid = s.state.opening!.cards[0].uid; expect(() => parseSave(JSON.stringify(s.state))).toThrow(); });
  it('rejects unsafe identifiers and unknown grading-company prototype names', () => { const s = withCards().state; s.cards[0].uid = '<img-src=x>'; expect(() => parseSave(JSON.stringify(s))).toThrow(); s.cards[0].uid = 'valid'; s.cards[0].status = 'graded'; s.cards[0].grade = 10; s.cards[0].grader = 'toString' as Grader; expect(() => parseSave(JSON.stringify(s))).toThrow(); });
  it('rejects multiple orders for the same card', () => { const s = withCards(); s.submit(s.state.cards[0].uid, 'PSA', 'Standard'); s.state.orders.push({ ...s.state.orders[0], uid: 'duplicate' }); expect(() => parseSave(JSON.stringify(s.state))).toThrow(); });
  it('provides a definition for every set slot', () => { expect(CARDS.length).toBeGreaterThan(45); expect(new Set(CARDS.map(c => c.id)).size).toBe(CARDS.length); });
});

describe('verified catalog and sealed containers', () => {
  it('keeps exact printing IDs paired to the source image and full metadata', () => {
    expect(CARDS.filter(c => c.setCode === 'sv03.5')).toHaveLength(207);
    for (const c of CARDS.filter(c => c.setCode === 'sv03.5' || c.setCode === 'svp')) {
      expect(c.image).toMatch(new RegExp(`(?:/${c.setCode}/${c.id.split('-').at(-1)}/|/artwork/cards/${c.id.replace('.', '\\.') }\\.webp$)`));
      expect(c.sourceUrl).toContain(c.id); expect(c.verified).toBe(true);
    }
    const card = CARD_BY_ID.get('sv03.5-006')!;
    expect(card.name).toBe('Charizard ex'); expect(card.hp).toBe(330); expect(card.attacks?.length).toBeGreaterThan(0);
  });
  it('keeps sealed ETBs through reload and resolves exactly nine unopened packs plus #051', () => {
    const storage = memory(); const s = new GameStore(storage); expect(s.buy('151-etb')).toBe(true);
    expect(s.state.cards).toHaveLength(0); expect(s.state.packs).toHaveLength(1);
    const uid = s.state.sealedProducts[0].uid; const reload = new GameStore(storage);
    expect(reload.state.sealedProducts).toEqual(s.state.sealedProducts);
    expect(reload.startContainer(uid)).toBe(true); expect(reload.takeContents()).toBe(false);
    expect(reload.keepSealed()).toBe(true); expect(reload.state.sealedProducts).toHaveLength(1);
    reload.startContainer(uid); expect(reload.liftLid()).toBe(true);
    const resumed = new GameStore(storage); expect(resumed.state.containerOpening?.stage).toBe('contents');
    expect(resumed.takeContents()).toBe(true); expect(resumed.takeContents()).toBe(false);
    expect(resumed.state.packs).toHaveLength(10); expect(resumed.state.packs.filter(p => p.sourceProduct === uid)).toHaveLength(9);
    expect(resumed.state.packs.every(p => p.state === 'unopened')).toBe(true);
    expect(resumed.state.cards.map(c => c.cardId)).toEqual(['svp-051']);
    expect(resumed.state.cards[0].origin).toBe('promo'); expect(resumed.state.sealedProducts).toHaveLength(0);
    expect(new GameStore(storage).state).toEqual(resumed.state); expect(resumed.state.productReceipts[0].packUids).toHaveLength(9); expect(resumed.state.productReceipts[0].cardUids).toHaveLength(1);
    expect(resumed.startContainer(uid)).toBe(false);
  });
  it('resolves UPC fixed promos and keeps metal distinct from paper #205', () => {
    const s = new GameStore(memory()); s.state.currency = PRODUCT_PRICES['151-upc'].physical;
    expect(s.buy('151-upc')).toBe(true); expect(s.state.currency).toBe(0); const uid = s.state.sealedProducts[0].uid;
    s.startContainer(uid); s.liftLid(); s.takeContents();
    expect(s.state.packs.filter(p => p.sourceProduct === uid)).toHaveLength(16);
    expect(s.state.cards.map(c => [c.cardId, c.finish])).toEqual([['svp-052', 'holo'], ['svp-053', 'holo'], ['sv03.5-205', 'metal']]);
    expect(s.submit(s.state.cards[2].uid, 'PSA', 'Standard')).toBe(false);
    expect(parseSave(JSON.stringify(s.state))).toEqual(s.state);
  });
  it('rejects a sealed instance with an unsupported manifest revision', () => { const s = new GameStore(memory()); s.buy('151-etb'); const raw = { ...s.state, sealedProducts: [{ ...s.state.sealedProducts[0], manifestRevision: 99 }] }; expect(() => parseSave(JSON.stringify(raw))).toThrow(); });
  it('blocks unverified or broken manifests instead of guessing contents', () => {
    const etb = PRODUCTS.find(p => p.type === 'etb')!;
    expect(canOpenProduct({ ...etb, manifest: { ...etb.manifest, verified: false } })).toBe(false);
    expect(canOpenProduct({ ...etb, manifest: { ...etb.manifest, cards: [{ cardId: 'invented', quantity: 1, finish: 'holo' }] } })).toBe(false);
    expect(canOpenProduct({ ...etb, manifest: { ...etb.manifest, packs: [{ productId: 'wrong-set', quantity: 9 }] } })).toBe(false);
  });
  it('archives old fictional inventory without relabeling it as a real printing', () => {
    const original = { ...newSave(), version: 1, currency: 42, cards: [{ cardId: 'base-1', name: 'Charizard' }], settings: { graphics: 'High', master: .4 } };
    const migrated = parseSave(JSON.stringify(original));
    expect(migrated.legacyArchive).toEqual(original); expect(migrated.cards).toHaveLength(0); expect(migrated.packs).toHaveLength(0);
    expect(migrated.currency).toBe(42); expect(migrated.settings.graphics).toBe('High'); expect(migrated.settings.master).toBe(.4);
    expect(parseSave(JSON.stringify(migrated)).legacyArchive).toEqual(original);
  });
});
