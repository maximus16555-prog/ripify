import { CARD_BY_ID } from '../data/cards';
import { PRODUCT_BY_ID } from '../data/products';
import type { OwnedCard, Pack, Product, SealedProduct } from './types';
export const uuid = () => crypto.randomUUID();
export const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
export function seeded(seed: number) { return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; }; }
export function createPack(productId = '151-booster', price = 0, sourceProduct?: string, seed = newSeed(), now = Date.now()): Pack {
  const product = PRODUCT_BY_ID.get(productId); if (!product || product.type !== 'booster' || !product.manifest.verified) throw new Error('Unverified booster');
  return { uid: uuid(), productId, setCode: product.setCode, price, purchasedAt: now, variant: 0, sourceProduct, seed, owner: 'local-player', state: 'unopened', generationVersion: 2 };
}
export function createSealed(product: Product, price: number): SealedProduct { return { uid: uuid(), productId: product.code, price, purchasedAt: Date.now(), seed: newSeed(), owner: 'local-player', state: 'sealed', manifestRevision: product.manifest.revision }; }
export function createCard(cardId: string, source: string, random: () => number, finish: OwnedCard['finish'], origin: OwnedCard['origin'], now = Date.now()): OwnedCard {
  if (!CARD_BY_ID.has(cardId)) throw new Error('Unknown printing');
  const condition = () => Math.round(random() < .08 ? 56 + random() * 25 : 83 + random() * 17);
  return { uid: uuid(), cardId, baseRawValue: CARD_BY_ID.get(cardId)!.value, condition: { centering: condition(), corners: condition(), edges: condition(), surface: condition(), print: condition() }, acquiredAt: now, source, favorite: false, status: 'raw', owner: 'local-player', finish, origin, gradingHistory: [] };
}
export function canOpenProduct(p: Product): boolean {
  return p.manifest.verified && p.manifest.sources.length > 0 && p.manifest.packs.every(item => Number.isInteger(item.quantity) && item.quantity > 0 && PRODUCT_BY_ID.get(item.productId)?.type === 'booster' && PRODUCT_BY_ID.get(item.productId)?.manifest.verified) && p.manifest.cards.every(item => Number.isInteger(item.quantity) && item.quantity > 0 && CARD_BY_ID.has(item.cardId));
}
