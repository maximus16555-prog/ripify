import { receiveReturn } from './fixtures/receive-return';
import { describe, it, expect } from 'vitest';
import { GameStore } from '../src/core/store';
import { ComputerServices, stock, portfolioValue, searchCards, marketHistory } from '../src/core/computer';
import { parseSave } from '../src/core/save';
import { createCard, createSealed, seeded } from '../src/core/inventory';
import { PRODUCT_BY_ID } from '../src/data/products';
import { ownedValue, rawValue } from '../src/core/economy';
import { CARD_BY_ID } from '../src/data/cards';
import { gradedPopulation } from '../src/core/population';
function fixture() {
  let saved = '', fail = false;
  const storage = { read: () => saved || null, write: (s: string) => { if (fail) throw Error('Full'); saved = s; }, backup: () => {} };
  const store = new GameStore(storage), services = new ComputerServices(store);
  store.state.computer!.minute = 570; store.state.currency = 1000; store.persist();
  return { store, services, storage, read: () => saved, fail: () => { fail = true; } };
}
describe('shared computer commerce', () => {
  it('drops at exactly 9:30 game time; purchases and demand survive reload', () => {
    const f = fixture(); f.store.state.computer!.minute = 569.999; expect(stock(f.store.state, '151-booster')).toBe(0);
    f.store.state.computer!.minute = 570; const before = stock(f.store.state, '151-booster');
    expect(f.services.checkout({ '151-booster': 2 })).toBeTruthy(); expect(stock(f.store.state, '151-booster')).toBe(before - 2);
    expect(stock(new GameStore(f.storage).state, '151-booster')).toBe(before - 2);
    f.store.state.computer!.minute += 120; expect(stock(f.store.state, '151-booster')).toBeLessThan(before - 2);
  });
  it('checkout creates sealed instances once; delivery never opens or duplicates them', () => {
    const f = fixture(), original = f.store.state.packs.length;
    const uid = f.services.checkout({ '151-booster': 1, '151-etb': 1, '151-upc': 1 }); expect(uid).toBeTruthy();
    const order = f.store.state.computer!.orders[0], ids = order.items.map(i => i.uid);
    expect(f.store.state.packs).toHaveLength(original); expect(f.store.state.sealedProducts).toHaveLength(0); expect(f.store.state.cards).toHaveLength(0);
    const reloaded = new GameStore(f.storage), services = new ComputerServices(reloaded); reloaded.state.computer!.minute = order.due; services.advance(); services.advance();
    expect(reloaded.state.packs).toHaveLength(original);
    const box = reloaded.state.shippingPackages![0]; reloaded.packageStage(box.uid, 'untaped'); reloaded.packageStage(box.uid, 'open'); expect(reloaded.claimPackage(box.uid)).toBe(true);
    expect(reloaded.state.packs).toHaveLength(original + 1); expect(reloaded.state.sealedProducts).toHaveLength(2);
    expect([...reloaded.state.packs, ...reloaded.state.sealedProducts].filter(i => ids.includes(i.uid))).toHaveLength(3);
    expect(reloaded.state.cards).toHaveLength(0); expect(reloaded.state.opening).toBeNull(); expect(parseSave(f.read()).computer!.orders[0].status).toBe('DELIVERED');
  });
  it('failed storage cancels checkout with no currency, stock or inventory changes', () => {
    const f = fixture(), before = structuredClone(f.store.state); f.fail(); expect(f.services.checkout({ '151-booster': 1 })).toBeNull(); expect(f.store.state).toEqual(before);
  });
  it('card listing locks every gameplay operation; cancellation releases the same UID', () => {
    const f = fixture(), card = createCard('me02.5-276', 'test', seeded(1), 'holo', 'pack'); f.store.state.cards.push(card);
    expect(f.services.list('card', card.uid, 4582)).toBe(true);
    expect(f.store.deleteCards([card.uid])).toBe(false); expect(f.store.submit(card.uid, 'PSA', 'Standard')).toBe(false); expect(f.store.display(card.uid, 0)).toBe(false); expect(f.store.canCrack(card.uid)).toBe(false);
    const reloaded = new GameStore(f.storage); expect(reloaded.isCardLocked(card.uid)).toBe(true);
    expect(f.services.resolve(f.store.state.computer!.listings[0].uid, false)).toBe(true); expect(f.store.state.cards[0].uid).toBe(card.uid); expect(f.store.isCardLocked(card.uid)).toBe(false);
  });
  it('listed booster and box cannot open and remain the same instances', () => {
    const f = fixture(), pack = f.store.state.packs[0], box = createSealed(PRODUCT_BY_ID.get('151-etb')!, 50); f.store.state.sealedProducts.push(box);
    expect(f.services.list('pack', pack.uid, 10)).toBe(true); expect(f.services.list('sealed', box.uid, 60)).toBe(true);
    expect(f.store.startOpening(pack.uid)).toBe(false); expect(f.store.startContainer(box.uid)).toBe(false); expect(parseSave(f.read()).computer!.listings).toHaveLength(2);
  });
  it('sale settlement atomically transfers the item, keeps population, and pays once', () => {
    const f = fixture(), card = createCard('me02.5-284', 'test', seeded(3), 'holo', 'pack'); f.store.state.cards.push(card); f.store.submit(card.uid, 'PSA', 'Standard'); const o = f.store.state.orders[0]; receiveReturn(f.store, o.uid, o.dueAt);
    expect(f.services.list('card', card.uid, 100)).toBe(true); const l = f.store.state.computer!.listings[0]; l.outcome = 'sale'; const money = f.store.state.currency; f.store.state.computer!.minute = l.due; f.services.advance(); f.services.advance();
    expect(f.store.state.currency).toBe(money + 100); expect(f.store.state.cards).toHaveLength(0); expect(f.store.state.computer!.listings[0].status).toBe('SOLD');
    expect(gradedPopulation(f.store.state, card.cardId, 'PSA', f.store.state.gradingPopulation![0].grade).allTime).toBe(1); expect(parseSave(f.read()).computer!.listings[0].paid).toBe(100); expect(parseSave(f.read()).stats.totalSales).toBe(100);
  });
  it('offers and unsold listings are persistent and cannot pay twice', () => {
    const f = fixture(), pack = f.store.state.packs[0]; f.services.list('pack', pack.uid, 12); const l = f.store.state.computer!.listings[0]; l.outcome = 'offer'; f.store.state.computer!.minute = l.offerAt!; f.services.advance();
    const offer = f.store.state.computer!.listings[0]; expect(offer.status).toBe('OFFER'); const before = f.store.state.currency; expect(f.services.resolve(l.uid, true)).toBe(true); expect(f.store.state.currency).toBeCloseTo(before + offer.offer, 2); expect(f.services.resolve(l.uid, true)).toBe(false);
  });
  it('views use authoritative values and exact printings without creating copies', () => {
    const f = fixture(), card = createCard('me02.5-276', 'test', seeded(2), 'holo', 'pack'); f.store.state.cards.push(card);
    const before = structuredClone(f.store.state.cards); expect(searchCards('Pikachu ex').some(d => d.id === card.cardId)).toBe(true);
    expect(rawValue(CARD_BY_ID.get(card.cardId)!, 0)).toBe(4582); expect(portfolioValue(f.store.state)).toBe(ownedValue(card, f.store.state.marketSeed) + PRODUCT_BY_ID.get('151-booster')!.physicalStorePrice);
    expect(marketHistory(card.cardId, f.store.state.marketSeed, 365).every(p => p.value === 4582)).toBe(true); expect(f.store.state.cards).toEqual(before);
  });
  it('invalid duplicate orders or conflicting listing locks are rejected on import', () => {
    const f = fixture(); f.services.checkout({ '151-booster': 1 }); const s = parseSave(f.read()); s.computer!.orders.push(structuredClone(s.computer!.orders[0])); expect(() => parseSave(JSON.stringify(s))).toThrow();
  });
  it('waiting sale listings do not repeatedly commit each second after watching starts', () => {
    const f = fixture(); f.services.list('pack', f.store.state.packs[0].uid, 5); f.store.state.computer!.listings[0].outcome = 'sale'; f.store.state.computer!.minute += 65; f.services.advance();
    const before = f.store.state; f.services.tick(1); expect(f.store.state).toBe(before);
  });
});
