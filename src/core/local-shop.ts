import { CARD_BY_ID } from '../data/cards';
import { PRODUCTS, PRODUCT_BY_ID } from '../data/products';
import { canOpenProduct, createPack, createSealed, seeded, uuid } from './inventory';
import { ownedValue } from './economy';
import { cardBuyerDemand } from './ebay-buyers';
import { samplePortfolio } from './computer';
import { hydratePopulation } from './population';
import { excessCopies, VALUABLE_CARD_THRESHOLD } from './card-disposal';
import type { GameStore } from './store';
import type { OwnedCard, Save } from './types';

export interface ShopQuote { at: number; cards: { uid: string; market: number; rate: number }[]; market: number; offer: number }
export interface LocalShopState {
  version: 1; purchases: Record<string, number>;
  sales: { uid: string; at: number; offer: number; market: number; cards: { card: OwnedCard; market: number; rate: number }[] }[];
}
export const LOCAL_SHOP = { restockMinutes: 240, minimumRate: .70, maximumRate: .75,
  stock: { '151-booster': 32, 'ascended-heroes-booster': 28, '151-etb': 6, '151-upc': 3 } as Record<string, number> };
export const localProducts = PRODUCTS.filter(canOpenProduct);
export const shopMinute = (s: Save) => s.computer?.minute ?? 560;
export const shopCycle = (s: Save) => Math.floor(shopMinute(s) / LOCAL_SHOP.restockMinutes);
export const nextShopRestock = (s: Save) => (shopCycle(s) + 1) * LOCAL_SHOP.restockMinutes;
export function localStock(s: Save, id: string) {
  if (!localProducts.some(p => p.code === id)) return 0;
  const cycle = shopCycle(s), hash = [...id].reduce((n, c) => n * 31 + c.charCodeAt(0), 0) >>> 0;
  const r = seeded((Math.floor(s.marketSeed * 1000) + cycle * 917 + hash) >>> 0)();
  const capacity = Math.max(1, Math.round((LOCAL_SHOP.stock[id] ?? 3) * (.85 + r * .3)));
  const demand = Math.floor((shopMinute(s) % LOCAL_SHOP.restockMinutes) / LOCAL_SHOP.restockMinutes * capacity * (.2 + r * .15));
  return Math.max(0, capacity - demand - (s.localShop?.purchases[`${cycle}:${id}`] ?? 0));
}
export function purchaseLocalProduct(store: GameStore, id: string, quantity = 1) {
  const p = PRODUCT_BY_ID.get(id), current = store.state;
  if (!p || !canOpenProduct(p) || !Number.isInteger(quantity) || quantity < 1 || quantity > localStock(current, id)) return false;
  const total = Math.round(p.physicalStorePrice * quantity * 100) / 100;
  if (current.currency < total) return false;
  const next = structuredClone(current), shop = next.localShop ??= { version: 1, purchases: {}, sales: [] };
  const key = `${shopCycle(next)}:${id}`; shop.purchases[key] = (shop.purchases[key] ?? 0) + quantity;
  // The normal constructors preserve real product identities and seeded generation.
  for (let i = 0; i < quantity; i++) {
    if (p.type === 'booster') next.packs.push(createPack(id, p.physicalStorePrice));
    else next.sealedProducts.push(createSealed(p, p.physicalStorePrice));
  }
  next.currency = Math.round((next.currency - total) * 100) / 100; next.stats.spent += total;
  next.history = [...next.history, { uid: uuid(), type: 'purchase' as const, amount: -total, label: `Local shop · ${quantity} × ${p.name}`, at: Date.now() }].slice(-100);
  samplePortfolio(next); return store.commit(next);
}
export function shopProtection(store: GameStore, c: OwnedCard) {
  return store.isCardLocked(c.uid) ? 'Transaction locked' : c.favorite ? 'Favorite protected' : '';
}
export const shopWarning = (c: OwnedCard, s: Save) => !!c.misprint || ownedValue(c, s.marketSeed) >= VALUABLE_CARD_THRESHOLD;
export function automaticShopSelection(store: GameStore, c: OwnedCard) {
  return !shopProtection(store, c) && c.status === 'raw' && !shopWarning(c, store.state) && !store.state.displays.includes(c.uid);
}
export function shopDuplicates(store: GameStore) { return excessCopies(store.state, c => automaticShopSelection(store, c)); }
export function quoteShopCards(store: GameStore, ids: string[], now = Date.now()): ShopQuote | null {
  const s = store.state, unique = new Set(ids);
  if (!ids.length || unique.size !== ids.length) return null;
  const cards: ShopQuote['cards'] = [];
  for (const uid of ids) {
    const c = s.cards.find(c => c.uid === uid); if (!c || shopProtection(store, c)) return null;
    const definition = CARD_BY_ID.get(c.cardId)!, demand = cardBuyerDemand(definition);
    const variation = Math.sin(Math.floor(shopMinute(s) / 1440) + definition.value + s.marketSeed) * .003;
    const rate = Math.max(.70, Math.min(.75, .725 + (demand - 1) * .06 + variation));
    cards.push({ uid, market: ownedValue(c, s.marketSeed, now), rate });
  }
  return { at: now, cards, market: Math.round(cards.reduce((n, c) => n + c.market, 0) * 100) / 100,
    // Round only the whole transaction, not hundreds of individual bulk offers.
    offer: Math.round(cards.reduce((n, c) => n + c.market * c.rate, 0) * 100) / 100 };
}
export function sellLocalCards(store: GameStore, quote: ShopQuote, specialConfirmed = false, now = Date.now()) {
  const current = quoteShopCards(store, quote.cards.map(c => c.uid), now);
  if (!current || current.offer !== quote.offer || current.market !== quote.market || current.cards.some((c, i) => c.market !== quote.cards[i].market || c.rate !== quote.cards[i].rate)) return false;
  const ids = new Set(current.cards.map(c => c.uid)), sold = store.state.cards.filter(c => ids.has(c.uid));
  if (sold.some(c => shopWarning(c, store.state)) && !specialConfirmed) return false;
  const next = structuredClone(store.state), shop = next.localShop ??= { version: 1, purchases: {}, sales: [] }, uid = uuid();
  next.gradingPopulation = hydratePopulation(next);
  shop.sales.push({ uid, at: now, offer: current.offer, market: current.market, cards: current.cards.map(q => ({ card: next.cards.find(c => c.uid === q.uid)!, market: q.market, rate: q.rate })) });
  next.cards = next.cards.filter(c => !ids.has(c.uid)); next.displays = next.displays.map(id => id && ids.has(id) ? null : id);
  next.currency = Math.round((next.currency + current.offer) * 100) / 100;
  next.stats.sold += ids.size; next.stats.totalSales = Math.round(((next.stats.totalSales ?? next.history.filter(h => h.type === 'sale').reduce((n, h) => n + h.amount, 0)) + current.offer) * 100) / 100;
  next.history = [...next.history, { uid, type: 'sale' as const, amount: current.offer, label: `Local shop · ${ids.size} cards`, at: now }].slice(-100);
  samplePortfolio(next); return store.commit(next);
}
export function validateLocalShop(value: unknown, save: Save, validCard: (c: unknown) => boolean): LocalShopState {
  const s = value as LocalShopState, finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (!s || s.version !== 1 || !s.purchases || Array.isArray(s.purchases) || !Object.entries(s.purchases).every(([k, n]) => /^\d+:[\w.-]+$/.test(k) && PRODUCT_BY_ID.has(k.slice(k.indexOf(':') + 1)) && Number.isSafeInteger(n) && n >= 0) || !Array.isArray(s.sales)) throw Error('Invalid local shop');
  const removed = new Set<string>(), receipts = new Set<string>();
  for (const sale of s.sales) {
    if (!/^[\w.-]{1,100}$/.test(sale.uid) || receipts.has(sale.uid) || !finite(sale.at) || !finite(sale.market) || !finite(sale.offer) || !Array.isArray(sale.cards) || !sale.cards.length) throw Error('Invalid local sale');
    receipts.add(sale.uid);
    for (const item of sale.cards) {
      if (!validCard(item.card) || item.card.status === 'grading' || !finite(item.market) || !finite(item.rate) || item.rate < .70 || item.rate > .75 || removed.has(item.card.uid) || [...save.cards, ...(save.opening?.cards ?? [])].some(c => c.uid === item.card.uid) || save.cardDisposals?.some(r => r.cards.some(c => c.uid === item.card.uid))) throw Error('Invalid sold card');
      removed.add(item.card.uid);
    }
    if (sale.market !== Math.round(sale.cards.reduce((n, c) => n + c.market, 0) * 100) / 100 || sale.offer !== Math.round(sale.cards.reduce((n, c) => n + c.market * c.rate, 0) * 100) / 100) throw Error('Invalid local sale totals');
  }
  return s;
}
