import type { Pack, SealedProduct, Save } from './types';
import { PRODUCT_BY_ID } from '../data/products';
export type ItemKind = 'card' | 'pack' | 'sealed';
export type ListingStatus = 'LISTED' | 'WATCHING' | 'OFFER' | 'SOLD' | 'UNSOLD';
export interface Listing {
  uid: string; itemUid: string; kind: ItemKind; name: string; image?: string; cardId?: string; productId?: string;
  asking: number; market: number; started: number; due: number; status: ListingStatus;
  outcome: 'sale' | 'offer' | 'unsold'; offer: number; paid?: number; completed?: number;
  watchAt?: number; offerAt?: number;
}
export interface OnlineOrder { uid: string; placed: number; due: number; total: number; status: 'SHIPPING' | 'DELIVERED'; items: (Pack | SealedProduct)[] }
export interface ComputerState {
  version: 1; minute: number; speed: number; profile: { name: string; avatar: string };
  drops: Record<string, number>; orders: OnlineOrder[]; listings: Listing[];
  portfolio: { at: number; value: number }[];
}
export const newComputerState = (): ComputerState => ({ version: 1, minute: 9 * 60 + 20, speed: 30, profile: { name: 'Collector', avatar: 'mint' }, drops: {}, orders: [], listings: [], portfolio: [] });
export const activeListing = (s: Save, uid: string) => s.computer?.listings.find(l => l.itemUid === uid && ['LISTED', 'WATCHING', 'OFFER'].includes(l.status));
export function gameTime(minute: number) {
  const m = Math.floor(minute % 1440), h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export const gameDate = (minute: number) => `Day ${Math.floor(minute / 1440) + 1} · ${gameTime(minute)}`;
/** Validate the optional extension without changing older inventory/save schemas. */
export function validateComputer(v: unknown, save: Save, validPack: (v: unknown) => boolean, validSealed: (v: unknown) => boolean): ComputerState {
  const s = v as ComputerState;
  const number = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  const id = (x: unknown) => typeof x === 'string' && /^[\w.-]{1,100}$/.test(x);
  if (!s || s.version !== 1 || !number(s.minute) || !number(s.speed) || s.speed < 1 || s.speed > 120 || !s.profile || typeof s.profile.name !== 'string' || s.profile.name.length > 32 || !['mint', 'blue', 'rose'].includes(s.profile.avatar) || !s.drops || Array.isArray(s.drops) || !Object.entries(s.drops).every(([k, n]) => /^\d+:[\w.-]+$/.test(k) && number(n) && Number.isInteger(n)) || !Array.isArray(s.orders) || !Array.isArray(s.listings) || !Array.isArray(s.portfolio)) throw new Error('Invalid computer save');
  const pending = new Set<string>(), orderIds = new Set<string>(), listingIds = new Set<string>(), locked = new Set<string>();
  for (const o of s.orders) {
    if (!id(o.uid) || orderIds.has(o.uid) || !number(o.placed) || !number(o.due) || o.due <= o.placed || !number(o.total) || !['SHIPPING', 'DELIVERED'].includes(o.status) || !Array.isArray(o.items) || !o.items.length || o.items.length > 100 || !o.items.every(p => 'generationVersion' in p ? validPack(p) : validSealed(p))) throw new Error('Invalid online order');
    orderIds.add(o.uid);
    for (const p of o.items) { if (pending.has(p.uid)) throw new Error('Duplicate order item'); pending.add(p.uid); if (o.status === 'SHIPPING' && [...save.packs, ...save.sealedProducts, ...save.cards].some(i => i.uid === p.uid)) throw new Error('Order already delivered'); }
  }
  for (const l of s.listings) {
    if (!id(l.uid) || listingIds.has(l.uid) || !id(l.itemUid) || !['card', 'pack', 'sealed'].includes(l.kind) || !['LISTED', 'WATCHING', 'OFFER', 'SOLD', 'UNSOLD'].includes(l.status) || !['sale', 'offer', 'unsold'].includes(l.outcome) || !number(l.asking) || l.asking === 0 || !number(l.market) || !number(l.started) || !number(l.due) || l.due <= l.started || !number(l.offer) || typeof l.name !== 'string' || (l.paid !== undefined && !number(l.paid)) || (l.completed !== undefined && !number(l.completed)) || (l.productId && !PRODUCT_BY_ID.has(l.productId))) throw new Error('Invalid listing');
    if ((l.watchAt !== undefined || l.offerAt !== undefined) && (!number(l.watchAt) || !number(l.offerAt) || l.watchAt! <= l.started || l.offerAt! <= l.watchAt! || l.offerAt! >= l.due)) throw new Error('Invalid buyer timing');
    listingIds.add(l.uid);
    if (['LISTED', 'WATCHING', 'OFFER'].includes(l.status)) {
      const item = (l.kind === 'card' ? save.cards : l.kind === 'pack' ? save.packs : save.sealedProducts).find(i => i.uid === l.itemUid);
      if (!item || locked.has(l.itemUid) || (l.kind === 'card' && (save.orders.some(o => o.cardUid === item.uid) || save.displays.includes(item.uid))) || save.opening?.pack.uid === item.uid || save.containerOpening?.productUid === item.uid) throw new Error('Invalid listing lock');
      locked.add(l.itemUid);
      if (l.kind === 'card') { const c = save.cards.find(c => c.uid === l.itemUid)!; if (c.ownershipLock && (c.ownershipLock.kind !== 'ebay' || c.ownershipLock.uid !== l.uid)) throw new Error('Conflicting listing lock'); c.ownershipLock = { kind: 'ebay', uid: l.uid }; }
    }
  }
  if (s.portfolio.length > 1500 || !s.portfolio.every((p, i) => number(p.at) && number(p.value) && p.at <= s.minute && (!i || p.at >= s.portfolio[i - 1].at))) throw new Error('Invalid portfolio history');
  return s;
}
