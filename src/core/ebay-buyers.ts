import { CARD_VALUES, DEFAULT_CARD_VALUE, INDIVIDUAL_PRICE_POLICY } from '../data/balance';
import type { CardDefinition } from './types';

/** Simulated buyer tuning, independent of card prices and pack-generation odds. */
export const EBAY_BUYERS = {
  baseMinutes: 120, minimumMinutes: 24, maximumMinutes: 480,
  baseSaleChance: .78, maximumSaleChance: .96, minimumSaleChance: .01,
  priceChanceExponent: 1.5, priceWaitExponent: 2.6,
  offerChance: .16, maximumOfferRatio: 2,
  minimumDemand: .7, maximumDemand: 1.3,
  watchFraction: .125, offerFraction: .5,
};
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

/** Authored exact-card prices already encode collector preferences and printing demand.
 * Compare within the rarity tier so an expensive misprint/slab isn't automatically liquid.
 */
export function cardBuyerDemand(card: CardDefinition) {
  const buffs = INDIVIDUAL_PRICE_POLICY.meanBuff as Record<string, number>;
  const center = (CARD_VALUES[card.rarity] ?? DEFAULT_CARD_VALUE) * (buffs[card.rarity] ?? 1.08);
  return clamp(Math.sqrt(card.value / center), EBAY_BUYERS.minimumDemand, EBAY_BUYERS.maximumDemand);
}

export function buyerTerms(asking: number, market: number, demand = 1) {
  const ratio = asking / Math.max(.01, market);
  const interest = clamp(demand, EBAY_BUYERS.minimumDemand, EBAY_BUYERS.maximumDemand);
  const saleChance = clamp(EBAY_BUYERS.baseSaleChance * interest / ratio ** EBAY_BUYERS.priceChanceExponent,
    EBAY_BUYERS.minimumSaleChance, EBAY_BUYERS.maximumSaleChance);
  const offerChance = ratio < EBAY_BUYERS.maximumOfferRatio
    ? Math.min(EBAY_BUYERS.offerChance * interest, (1 - saleChance) * .8) : 0;
  return { ratio, interest, saleChance, offerChance };
}

/** Called only at listing creation. No polling/reload rerolls and no instant sale. */
export function rollBuyer(asking: number, market: number, demand: number, random: () => number) {
  const terms = buyerTerms(asking, market, demand), hit = random();
  const outcome: 'sale' | 'offer' | 'unsold' = hit < terms.saleChance ? 'sale' : hit < terms.saleChance + terms.offerChance ? 'offer' : 'unsold';
  const minutes = clamp(EBAY_BUYERS.baseMinutes * terms.ratio ** EBAY_BUYERS.priceWaitExponent
    / terms.interest * (.8 + random() * .4), EBAY_BUYERS.minimumMinutes, EBAY_BUYERS.maximumMinutes);
  const offer = Math.round(Math.min(asking * .9, market * (.82 + random() * .1)) * 100) / 100;
  return { outcome, minutes, offer };
}
