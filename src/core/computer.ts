import { CARDS, CARD_BY_ID } from '../data/cards';
import { PRODUCTS, PRODUCT_BY_ID } from '../data/products';
import { createPack, createSealed, newSeed, seeded, uuid, canOpenProduct } from './inventory';
import { ownedValue, rawValue } from './economy';
import { newComputerState, activeListing, type ItemKind, type Listing } from './computer-state';
import type { GameStore } from './store';
import type { Save } from './types';
import { arrivePackages, deliveryDue } from './delivery';
export const COMMERCE = { deliveryMinutes: 60, listingMinutes: 120, stock: { '151-booster': 35, '151-etb': 12, '151-upc': 6, 'ascended-heroes-booster': 24 } as Record<string, number>, demandPerMinute: { '151-booster': .13, '151-etb': .055, '151-upc': .033, 'ascended-heroes-booster': .2 } as Record<string, number> };
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
  const minute = s.computer?.minute ?? 560, day = Math.floor(minute / 1440), since = minute % 1440 - 570;
  if (since < 0) return 0;
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
    c.minute += Math.min(dt, 1) * c.speed / 60; this.seconds += dt; this.savedSeconds += dt;
    if (this.seconds < 1) return; this.seconds %= 1;
    if (deliveryDue(s) || c.listings.some(l => ['LISTED', 'WATCHING', 'OFFER'].includes(l.status) && (c.minute >= l.due || (l.status === 'LISTED' && c.minute >= l.started + 15) || (l.status === 'WATCHING' && l.outcome === 'offer' && c.minute >= l.started + 60)))) this.advance();
    if (this.savedSeconds >= 15) { samplePortfolio(this.store.state); this.store.persist(); this.savedSeconds = 0; }
  }
  checkout(cart: Record<string, number>): string | null {
    const entries = Object.entries(cart).filter(([, n]) => n > 0);
    if (!entries.length || entries.some(([id, n]) => !Number.isInteger(n) || n > 50 || !PRODUCT_BY_ID.has(id) || !canOpenProduct(PRODUCT_BY_ID.get(id)!) || stock(this.store.state, id) < n)) return null;
    const total = Math.round(entries.reduce((n, [id, q]) => n + PRODUCT_BY_ID.get(id)!.onlineDropPrice * q, 0) * 100) / 100;
    if (total > this.store.state.currency) return null;
    const s = structuredClone(this.store.state), c = s.computer!, uid = uuid();
    const items = entries.flatMap(([id, q]) => Array.from({ length: q }, () => { const p = PRODUCT_BY_ID.get(id)!; return p.type === 'booster' ? createPack(id, p.onlineDropPrice) : createSealed(p, p.onlineDropPrice); }));
    for (const [id, q] of entries) { const key = `${Math.floor(c.minute / 1440)}:${id}`; c.drops[key] = (c.drops[key] ?? 0) + q; }
    s.currency = Math.round((s.currency - total) * 100) / 100; s.stats.spent += total;
    c.orders.push({ uid, placed: c.minute, due: c.minute + COMMERCE.deliveryMinutes, total, status: 'SHIPPING', items });
    s.history.push({ uid, type: 'purchase', amount: -total, label: 'Pokémon Store order', at: Date.now() }); s.history = s.history.slice(-100);
    samplePortfolio(s); return this.store.commit(s) ? uid : null;
  }
  list(kind: ItemKind, uid: string, asking: number): boolean {
    const current = this.store.state, item = collectionItems(current).find(i => i.uid === uid && i.kind === kind);
    if (!item || !Number.isFinite(asking) || asking <= 0 || asking > 1e9 || activeListing(current, uid) || (kind === 'card' && (this.store.isCardLocked(uid) || current.displays.includes(uid))) || current.containerOpening?.productUid === uid) return false;
    const s = structuredClone(current), c = s.computer!, random = seeded(newSeed()), ratio = asking / Math.max(.01, item.value);
    // Desirability/pricing drives outcomes; never invent real-world buyers or sales.
    const hit = random(), outcome = hit < Math.min(.93, .8 / Math.max(.5, ratio * ratio)) ? 'sale' : ratio < 2 && hit < .97 ? 'offer' : 'unsold';
    const listing: Listing = { uid: uuid(), itemUid: uid, kind, name: item.name, image: item.image, cardId: item.cardId || undefined, productId: kind === 'card' ? undefined : [...s.packs, ...s.sealedProducts].find(p => p.uid === uid)!.productId, asking: Math.round(asking * 100) / 100, market: item.value, started: c.minute, due: c.minute + COMMERCE.listingMinutes * (.8 + random() * .4), status: 'LISTED', outcome, offer: Math.round(Math.min(asking * .9, item.value * (.82 + random() * .1)) * 100) / 100 };
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
      } else if (c.minute >= l.started + 60) l.status = l.outcome === 'offer' ? 'OFFER' : 'WATCHING';
      else if (c.minute >= l.started + 15) l.status = 'WATCHING';
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
