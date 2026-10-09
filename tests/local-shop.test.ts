import { describe, expect, it } from 'vitest';
import { GameStore } from '../src/core/store';
import { ComputerServices, stock, portfolioValue } from '../src/core/computer';
import { localStock, nextShopRestock, purchaseLocalProduct, quoteShopCards, sellLocalCards, shopDuplicates, automaticShopSelection } from '../src/core/local-shop';
import { createCard, createPack, seeded } from '../src/core/inventory';
import { generatePack } from '../src/core/packs';
import { ownedValue } from '../src/core/economy';
import { parseSave } from '../src/core/save';
import { PRODUCT_BY_ID } from '../src/data/products';
import { gradedPopulation } from '../src/core/population';
const NOW = 1780000000000;
function fixture() {
  let saved = '', fail = false;
  const storage = { read: () => saved || null, write: (v: string) => { if (fail) throw Error('full'); saved = v; }, backup: () => {} };
  const store = new GameStore(storage), services = new ComputerServices(store);
  store.state.computer!.minute = 570; store.state.currency = 10000;
  const card = (id = 'sv03.5-004') => { const c = createCard(id, 'fixture', seeded(6), 'normal', 'pack', NOW); store.state.cards.push(c); return c; };
  return { store, services, card, storage, saved: () => saved, fail: () => { fail = true; } };
}
describe('physical local shop commerce', () => {
  it('persists the clock exactly at a local restock, independently of the online drop', () => {
    const f = fixture(); f.store.state.computer!.minute = 719.99;
    f.services.tick(.1);
    expect(parseSave(f.saved()).computer!.minute).toBeGreaterThanOrEqual(720);
    expect(localStock(new GameStore(f.storage).state,'151-booster')).toBe(localStock(f.store.state,'151-booster'));
  });
  for (const id of ['151-booster', 'ascended-heroes-booster', '151-etb', '151-upc']) it(`immediately transfers real sealed ${id}, with independent persistent limited stock`, () => {
    const f = fixture(), before = localStock(f.store.state,id), online = stock(f.store.state,id), money = f.store.state.currency;
    expect(purchaseLocalProduct(f.store,id)).toBe(true);
    expect(f.store.state.currency).toBeCloseTo(money-PRODUCT_BY_ID.get(id)!.physicalStorePrice,2);
    expect(localStock(f.store.state,id)).toBe(before-1); expect(stock(f.store.state,id)).toBe(online);
    expect(f.store.state.shippingPackages).toBeUndefined(); expect(f.store.state.computer!.orders).toHaveLength(0);
    const item = [...f.store.state.packs,...f.store.state.sealedProducts].at(-1)!;
    expect(item.productId).toBe(id); expect(['unopened','sealed']).toContain(item.state);
    expect(parseSave(f.saved()).localShop).toEqual(f.store.state.localShop);
    expect(localStock(new GameStore(f.storage).state,id)).toBe(before-1);
    expect(purchaseLocalProduct(f.store,id,before)).toBe(false);
    f.store.state.computer!.minute = nextShopRestock(f.store.state);
    expect(localStock(f.store.state,id)).toBeGreaterThan(0); f.store.persist();
    expect(localStock(new GameStore(f.storage).state,id)).toBe(localStock(f.store.state,id));
  });
  it('pays once for 150 exact instances and preserves history, population and shared views across reload', () => {
    const f = fixture(); for(let i=0;i<150;i++) f.card();
    const ids = f.store.state.cards.map(c=>c.uid), quote = quoteShopCards(f.store,ids,NOW)!;
    expect(quote.cards.every(c=>c.rate>=.7&&c.rate<=.75)).toBe(true);
    const currency=f.store.state.currency; expect(sellLocalCards(f.store,quote,false,NOW)).toBe(true);
    expect(f.store.state.currency).toBeCloseTo(currency+quote.offer,2); expect(f.store.state.cards).toHaveLength(0);
    expect(f.store.state.stats.sold).toBe(150); expect(f.store.state.localShop!.sales[0].cards.map(c=>c.card.uid)).toEqual(ids);
    expect(sellLocalCards(f.store,quote,false,NOW)).toBe(false);
    const loaded = new GameStore(f.storage); expect(loaded.state.cards).toHaveLength(0); expect(loaded.state.currency).toBe(f.store.state.currency);
    expect(portfolioValue(loaded.state)).toBe(PRODUCT_BY_ID.get('151-booster')!.physicalStorePrice);
  });
  it('quotes actual condition, grading and one misprint modifier, requiring special confirmation', () => {
    const f=fixture(), raw=f.card(), graded=f.card('me02.5-276'); raw.condition.surface=20;
    graded.status='graded';graded.grader='PSA';graded.grade=10;
    let seed=0; while(!generatePack(createPack('151-booster',0,undefined,seed),undefined,NOW).some(c=>c.misprint)) seed++;
    const misprint=generatePack(createPack('151-booster',0,undefined,seed),undefined,NOW).find(c=>c.misprint)!; f.store.state.cards.push(misprint);
    const before=structuredClone(f.store.state.cards), q=quoteShopCards(f.store,before.map(c=>c.uid),NOW)!;
    expect(q.cards.map(c=>c.market)).toEqual(before.map(c=>ownedValue(c,f.store.state.marketSeed,NOW)));
    expect(sellLocalCards(f.store,q,false,NOW)).toBe(false);expect(sellLocalCards(f.store,q,true,NOW)).toBe(true);
    expect(f.store.state.localShop!.sales[0].cards.map(c=>c.card)).toEqual(before);
    expect(gradedPopulation(f.store.state,graded.cardId,'PSA',10)).toEqual({current:0,allTime:1});
    expect(parseSave(f.saved()).localShop!.sales[0].cards.at(-1)!.card.misprint).toEqual(misprint.misprint);
  });
  it('protects favorites, eBay, trade, transfer, grading and stale quotes atomically', () => {
    const f=fixture(), original=f.card(), b=f.card(), before=f.store.state.currency; let a=original;
    const q=quoteShopCards(f.store,[a.uid,b.uid],NOW)!;
    expect(f.services.list('card',b.uid,1)).toBe(true); expect(sellLocalCards(f.store,q,false,NOW)).toBe(false);
    expect(f.store.state.cards).toHaveLength(2);expect(f.store.state.currency).toBe(before); a=f.store.state.cards.find(c=>c.uid===original.uid)!;
    a.favorite=true;expect(quoteShopCards(f.store,[a.uid],NOW)).toBeNull();a.favorite=false;
    for(const kind of ['trade','transfer'] as const){a.ownershipLock={kind,uid:'lock'};expect(quoteShopCards(f.store,[a.uid],NOW)).toBeNull();}delete a.ownershipLock;
    a.status='grading';expect(quoteShopCards(f.store,[a.uid],NOW)).toBeNull();a.status='raw';
    const stale=quoteShopCards(f.store,[a.uid],NOW)!;a.condition.surface=0;expect(sellLocalCards(f.store,stale,false,NOW)).toBe(false);
  });
  it('keeps a preferred exact copy and never bulk-selects special copies or another printing', () => {
    const f=fixture(), cards=Array.from({length:14},()=>f.card());const other=f.card('sv03.5-005');
    cards[0].favorite=true;const graded=f.card();graded.status='graded';graded.grader='CGC';graded.grade=9;
    const ids=shopDuplicates(f.store);expect(ids.size).toBe(13);expect(ids.has(cards[0].uid)).toBe(false);expect(ids.has(graded.uid)).toBe(false);expect(ids.has(other.uid)).toBe(false);
    expect(automaticShopSelection(f.store,graded)).toBe(false);
  });
  it('storage failure leaves cards, balance and stock untouched', () => {
    const f=fixture(), c=f.card(), q=quoteShopCards(f.store,[c.uid],NOW)!, before=structuredClone(f.store.state);f.fail();
    expect(sellLocalCards(f.store,q,false,NOW)).toBe(false);expect(purchaseLocalProduct(f.store,'151-booster')).toBe(false);expect(f.store.state).toEqual(before);
  });
  it('rejects a sold card resurrected by an invalid save', () => {
    const f=fixture(), c=f.card();sellLocalCards(f.store,quoteShopCards(f.store,[c.uid],NOW)!,false,NOW);
    const s=parseSave(f.saved());s.cards.push(c);expect(()=>parseSave(JSON.stringify(s))).toThrow('Invalid sold card');
  });
});
