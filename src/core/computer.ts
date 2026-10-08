import { cardBuyerDemand, EBAY_BUYERS, rollBuyer } from './ebay-buyers';
import { CARDS, CARD_BY_ID } from '../data/cards';
import { PRODUCTS, PRODUCT_BY_ID } from '../data/products';
import { createPack, createSealed, newSeed, seeded, uuid, canOpenProduct } from './inventory';
import { ownedValue, rawValue } from './economy';
import { newComputerState, activeListing, type ItemKind, type Listing } from './computer-state';
import type { GameStore } from './store';
import type { Save } from './types';
import { arrivePackages, deliveryDue } from './delivery';
export const COMMERCE = {
  deliveryMinutes: 60, listingMinutes: EBAY_BUYERS.baseMinutes,
  maxOrderItems: 100, maxProductQuantity: 50,
  restockMinute: 9 * 60 + 30, restockInterval: 1440,
  stock: { '151-booster': 64, '151-etb': 18, '151-upc': 10, 'ascended-heroes-booster': 48 } as Record<string, number>,
  demandPerMinute: { '151-booster': .045, '151-etb': .013, '151-upc': .008, 'ascended-heroes-booster': .04 } as Record<string, number>
};
/** Purchase ledgers belong to the latest 9:30 AM drop, not the calendar midnight. */
export const restockDay = (minute: number) => Math.floor((minute - COMMERCE.restockMinute) / COMMERCE.restockInterval);
export const nextRestockMinute = (minute: number) => COMMERCE.restockMinute + (restockDay(minute) + 1) * COMMERCE.restockInterval;
export function collectionItems(s: Save) {
  return [...s.cards.map(c => { const d = CARD_BY_ID.get(c.cardId)!; return { uid: c.uid, kind: 'card' as const, name: d.name, set: d.set, number: d.number, rarity: d.rarity, cardId: d.id, image: d.imageSmall ?? d.image, value: ownedValue(c, s.marketSeed), at: c.acquiredAt, grade: c.grade ?? 0, status: c.status, misprint: !!c.misprint }; }), ...[...s.packs, ...s.sealedProducts].map(p => { const d = PRODUCT_BY_ID.get(p.productId)!; return { uid: p.uid, kind: ('generationVersion' in p ? 'pack' : 'sealed') as ItemKind, name: d.name, set: d.subtitle, number: '', rarity: d.type, cardId: '', image: d.artwork, value: d.physicalStorePrice, at: p.purchasedAt, grade: 0, status: 'sealed', misprint: false }; })];
}
export const portfolioValue = (s: Save) => Math.round(collectionItems(s).reduce((n, c) => n + c.value, 0) * 100) / 100;
export function samplePortfolio(s: Save) {
  if (!s.computer) return;
  const h = s.computer.portfolio, at = s.computer.minute, value = portfolioValue(s), last = h.at(-1);
  if (!last || last.value !== value || at - last.at >= 30) { h.push({ at, value }); if (h.length > 1500) h.splice(0, h.length - 1500); }
}
export function stock(s: Save, productId: string) {
  const minute = s.computer?.minute ?? 560, day = restockDay(minute);
  if (day < 0) return 0;
  const since = minute - (COMMERCE.restockMinute + day * COMMERCE.restockInterval);
  const hash = [...productId].reduce((n, c) => n + c.charCodeAt(0), 0), r = seeded((Math.floor(s.marketSeed * 1000) + day * 917 + hash) >>> 0)();
  return Math.max(0, (COMMERCE.stock[productId] ?? 0) - (s.computer?.drops[`${day}:${productId}`] ?? 0) - Math.floor(since * (COMMERCE.demandPerMinute[productId] ?? .1) * (.8 + r * .4)));
}
export class ComputerServices {
  private seconds = 0;
  private savedSeconds = 0;
  private unsubscribe: () => void;
  constructor(private store: GameStore) {
    store.state.computer ??= newComputerState(); samplePortfolio(store.state);
    this.unsubscribe = store.subscribe(() => { store.state.computer ??= newComputerState(); samplePortfolio(store.state); });
  }
  dispose() { this.unsubscribe(); }
  tick(dt: number) {
    const s = this.store.state, c = s.computer ??= newComputerState();
    if (!Number.isFinite(dt) || dt <= 0) return;
    const previousDrop = restockDay(c.minute);
    // main.ts supplies real visible elapsed time; a slow frame must not delay a scheduled drop.
    c.minute += dt * c.speed / 60; this.seconds += dt; this.savedSeconds += dt;
    if (restockDay(c.minute) !== previousDrop) { this.store.persist(); this.savedSeconds = 0; }
    if (this.seconds < 1) return; this.seconds %= 1;
    if (deliveryDue(s) || c.listings.some(l => ['LISTED', 'WATCHING', 'OFFER'].includes(l.status) && (c.minute >= l.due || (l.status === 'LISTED' && c.minute >= (l.watchAt ?? l.started + 15)) || (l.status === 'WATCHING' && l.outcome === 'offer' && c.minute >= (l.offerAt ?? l.started + 60))))) this.advance();
    if (this.savedSeconds >= 15) { samplePortfolio(this.store.state); this.store.persist(); this.savedSeconds = 0; }
  }
  checkout(cart: Record<string, number>): string | null {
    const entries = Object.entries(cart).filter(([, n]) => n > 0);
    if (!entries.length || entries.reduce((sum, [, n]) => sum + n, 0) > COMMERCE.maxOrderItems || entries.some(([id, n]) => !Number.isInteger(n) || n > COMMERCE.maxProductQuantity || !PRODUCT_BY_ID.has(id) || !canOpenProduct(PRODUCT_BY_ID.get(id)!) || stock(this.store.state, id) < n)) return null;
    const total = Math.round(entries.reduce((n, [id, q]) => n + PRODUCT_BY_ID.get(id)!.onlineDropPrice * q, 0) * 100) / 100;
    if (total > this.store.state.currency) return null;
    const s = structuredClone(this.store.state), c = s.computer!, uid = uuid();
    const items = entries.flatMap(([id, q]) => Array.from({ length: q }, () => { const p = PRODUCT_BY_ID.get(id)!; return p.type === 'booster' ? createPack(id, p.onlineDropPrice) : createSealed(p, p.onlineDropPrice); }));
    for (const [id, q] of entries) { const key = `${restockDay(c.minute)}:${id}`; c.drops[key] = (c.drops[key] ?? 0) + q; }
    s.currency = Math.round((s.currency - total) * 100) / 100; s.stats.spent += total;
    c.orders.push({ uid, placed: c.minute, due: c.minute + COMMERCE.deliveryMinutes, total, status: 'SHIPPING', items });
    s.history.push({ uid, type: 'purchase', amount: -total, label: 'Pokémon Store order', at: Date.now() }); s.history = s.history.slice(-100);
    samplePortfolio(s); return this.store.commit(s) ? uid : null;
  }
  list(kind: ItemKind, uid: string, asking: number): boolean {
    const current = this.store.state, item = collectionItems(current).find(i => i.uid === uid && i.kind === kind);
    const price = Math.round(asking * 100) / 100;
    if (!item || !Number.isFinite(asking) || price <= 0 || asking > 1e9 || activeListing(current, uid) || (kind === 'card' && (this.store.isCardLocked(uid) || current.displays.includes(uid))) || current.containerOpening?.productUid === uid) return false;
    const s = structuredClone(current), c = s.computer!, random = seeded(newSeed());
    const demand = item.cardId ? cardBuyerDemand(CARD_BY_ID.get(item.cardId)!) : 1;
    const buyer = rollBuyer(price, item.value, demand, random);
    const listing: Listing = { uid: uuid(), itemUid: uid, kind, name: item.name, image: item.image, cardId: item.cardId || undefined, productId: kind === 'card' ? undefined : [...s.packs, ...s.sealedProducts].find(p => p.uid === uid)!.productId,
      asking: price, market: item.value, started: c.minute, due: c.minute + buyer.minutes,
      watchAt: c.minute + buyer.minutes * EBAY_BUYERS.watchFraction, offerAt: c.minute + buyer.minutes * EBAY_BUYERS.offerFraction,
      status: 'LISTED', outcome: buyer.outcome, offer: buyer.offer };
    c.listings.push(listing);
    if (kind === 'card') s.cards.find(c => c.uid === uid)!.ownershipLock = { kind: 'ebay', uid: listing.uid };
    return this.store.commit(s);
  }
  private settle(s: Save, l: Listing, paid: number) {
    const items = l.kind === 'card' ? s.cards : l.kind === 'pack' ? s.packs : s.sealedProducts;
    if (!items.some(i => i.uid === l.itemUid)) throw new Error('Listed item missing');
    if (l.kind === 'card') { s.cards = s.cards.filter(c => c.uid !== l.itemUid); s.displays = s.displays.map(uid => uid === l.itemUid ? null : uid); s.stats.sold++; }
    else if (l.kind === 'pack') s.packs = s.packs.filter(p => p.uid !== l.itemUid);
    else s.sealedProducts = s.sealedProducts.filter(p => p.uid !== l.itemUid);
    s.currency = Math.round((s.currency + paid) * 100) / 100;
    s.stats.totalSales = Math.round(((s.stats.totalSales ?? s.history.filter(h => h.type === 'sale').reduce((n, h) => n + h.amount, 0)) + paid) * 100) / 100;
    l.status = 'SOLD'; l.paid = paid; l.completed = s.computer!.minute;
    s.history.push({ uid: uuid(), type: 'sale', amount: paid, label: `eBay · ${l.name}`, at: Date.now() }); s.history = s.history.slice(-100);
  }
  resolve(uid: string, accept: boolean) {
    const s = structuredClone(this.store.state), l = s.computer!.listings.find(l => l.uid === uid);
    if (!l || !['LISTED', 'WATCHING', 'OFFER'].includes(l.status) || (accept && l.status !== 'OFFER')) return false;
    if (accept) this.settle(s, l, l.offer);
    else { l.status = 'UNSOLD'; l.completed = s.computer!.minute; const card = s.cards.find(c => c.uid === l.itemUid); if (card?.ownershipLock?.uid === l.uid) delete card.ownershipLock; }
    samplePortfolio(s); return this.store.commit(s);
  }
  advance() {
    const s = structuredClone(this.store.state), c = s.computer!;
    arrivePackages(s);
    for (const l of c.listings) if (['LISTED', 'WATCHING', 'OFFER'].includes(l.status)) {
      if (c.minute >= l.due) {
        if (l.outcome === 'sale') this.settle(s, l, l.asking);
        else { l.status = 'UNSOLD'; l.completed = c.minute; const card = s.cards.find(c => c.uid === l.itemUid); if (card?.ownershipLock?.uid === l.uid) delete card.ownershipLock; }
      } else if (c.minute >= (l.offerAt ?? l.started + 60)) l.status = l.outcome === 'offer' ? 'OFFER' : 'WATCHING';
      else if (c.minute >= (l.watchAt ?? l.started + 15)) l.status = 'WATCHING';
    }
    samplePortfolio(s); return this.store.commit(s);
  }
  profile(name: string, avatar: string) { const s = structuredClone(this.store.state); s.computer!.profile = { name: name.trim().slice(0, 32) || 'Collector', avatar: ['mint', 'blue', 'rose'].includes(avatar) ? avatar : 'mint' }; return this.store.commit(s); }
}
// Catalog search is indexed once; no API/database reload on app opening.
export const SEARCH_INDEX = CARDS.map(card => ({ card, text: `${card.name} ${card.number} ${card.set}`.toLowerCase() }));
export function searchCards(query: string) { const q = query.toLowerCase().trim().split(/\s+/); return SEARCH_INDEX.filter(c => q.every(t => c.text.includes(t))).map(c => c.card); }
export function marketHistory(cardId: string, seed: number, days: number, now = Date.now()) {
  const d = CARD_BY_ID.get(cardId)!;
  // Sample the existing deterministic economy model, not a decorative random curve.
  return Array.from({ length: 40 }, (_, i) => { const at = now - (days * 86400000) * (39 - i) / 39; return { at, value: rawValue(d, seed, at) }; });
}
export const verifiedOnlineProducts = PRODUCTS.filter(canOpenProduct);
