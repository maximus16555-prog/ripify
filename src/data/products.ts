import type { Product } from '../core/types';
import artwork from './verified/artwork.json' with { type: 'json' };
import { PRODUCT_PRICES } from './balance';
// Prices are GAME BALANCE in coins, not retailer prices or market quotations.
const common = { year: 2023, setCode: 'sv03.5', color: '#a7ada6', accent: '#e8e8df', artworkStatus: 'unavailable' as const };
type CatalogProduct = Omit<Product, 'price' | 'physicalStorePrice' | 'onlineDropPrice'>;
const booster: CatalogProduct = { ...common, code: '151-booster', name: 'Scarlet & Violet—151 Booster Pack', subtitle: '10 cards + 1 Basic Energy', type: 'booster', variant: 'English', releaseDate: '2023-09-22', manifest: { verified: true, revision: 1, sources: ['https://www.pokemoncenter.com/en-ca/product/699-85310/pokemon-tcg-scarlet-and-violet-151-mini-tin-electabuzz-and-magnemite'], packs: [], cards: [] } };
const etb: CatalogProduct = { ...common, code: '151-etb', name: 'Scarlet & Violet—151 Elite Trainer Box', subtitle: '9 packs · Snorlax promo', type: 'etb', variant: 'Standard English (not Pokémon Center)', releaseDate: '2023-09-22', manifest: { verified: true, revision: 1, sources: ['https://www.pokemon.com/uk/pokemon-tcg/product-gallery/scarlet-violet-151-elite-trainer-box'], packs: [{ productId: booster.code, quantity: 9 }], cards: [{ cardId: 'svp-051', quantity: 1, finish: 'holo' }] } };
const upc: CatalogProduct = { ...common, code: '151-upc', name: 'Scarlet & Violet—151 Ultra-Premium Collection', subtitle: '16 packs · Mew ex · Mewtwo · metal Mew ex', type: 'upc', variant: 'English', releaseDate: '2023-10-06', manifest: { verified: true, revision: 1, sources: ['https://www.pokemon.com/uk/pokemon-tcg/product-gallery/scarlet-violet-151-ultra-premium-collection/'], packs: [{ productId: booster.code, quantity: 16 }], cards: [{ cardId: 'svp-052', quantity: 1, finish: 'holo' }, { cardId: 'svp-053', quantity: 1, finish: 'holo' }, { cardId: 'sv03.5-205', quantity: 1, finish: 'metal' }] } };
const ascended: CatalogProduct = { ...common, code: 'ascended-heroes-booster', name: 'Mega Evolution—Ascended Heroes Booster Pack', subtitle: '10 cards + 1 Basic Energy', year: 2026, setCode: 'me02.5', color: '#718ca6', accent: '#d7deea', type: 'booster', variant: 'English', releaseDate: '2026-01-30', manifest: { verified: true, revision: 1, sources: ['https://www.pokemon.com/us/pokemon-tcg/product-gallery/mega-evolution-ascended-heroes-booster-bundle'], packs: [], cards: [] } };
export const PRODUCTS: Product[] = [booster, etb, upc, ascended].map(product => {
  const prices = PRODUCT_PRICES[product.code];
  const priced: Product = { ...product, price: prices.physical, physicalStorePrice: prices.physical, onlineDropPrice: prices.online };
  const asset = artwork.assets.find(a => a.kind === 'product' && a.id === product.code);
  return asset ? { ...priced, artwork: asset.path, artworkStatus: 'verified' } : priced;
});
export const PRODUCT_BY_ID = new Map(PRODUCTS.map(p => [p.code, p]));
