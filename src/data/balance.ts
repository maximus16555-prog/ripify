import individualPrices from './card-prices.json' with { type: 'json' };
// Simulated authoring centers and pull weights, not live quotes or factory odds.
// CARD_VALUES calibrates the checked-in per-printing table; it is not a fallback.
export const CARD_VALUES: Record<string, number> = {
  Common: .22, Uncommon: .41, Rare: 1.05, 'Double rare': 5.1,
  'Ultra Rare': 12.1, 'Illustration rare': 18.1, 'Special illustration rare': 65, 'Hyper rare': 30,
  'Mega attack rare': 25, 'Mega Hyper Rare': 100
};
export const DEFAULT_CARD_VALUE = .15;
// Authoring targets only: calibrate individual prices without changing pack odds.
export const INDIVIDUAL_PRICE_POLICY = {
  meanBuff: { Common: 1.08, Uncommon: 1.06, Rare: 1.04, 'Double rare': 1.01,
    'Ultra Rare': 1.01, 'Illustration rare': 1.005, 'Special illustration rare': 1,
    'Hyper rare': 1, 'Mega attack rare': 1.015, 'Mega Hyper Rare': 1, Promo: 1.08 },
  variation: 'collector preference, printed traits, and bounded stable printing demand; normalized by set/rarity'
};
// Authoritative RIPIFY prices for these exact printings, not live market quotes.
// They override authored per-printing prices and simulated market fluctuations.
export const FIXED_RAW_CARD_VALUES: Readonly<Record<string, number>> = Object.freeze({
  'me02.5-276': 4582,
  'me02.5-284': 4317,
  'me02.5-290': 1684,
  'me02.5-294': 768,
  'me02.5-277': 711,
  'me02.5-281': 657,
  'me02.5-295': 586
});
export const INDIVIDUAL_RAW_CARD_VALUES: Readonly<Record<string, number>> = Object.freeze(individualPrices.values);
export function baseCardValue(id: string, _rarity?: string) {
  const value = FIXED_RAW_CARD_VALUES[id] ?? INDIVIDUAL_RAW_CARD_VALUES[id];
  if (value === undefined) throw new Error(`Missing authoritative base price for ${id}`);
  return value;
}
export const PACK_BALANCE: Record<string, {
  finalSlot: { rare: number; double: number; ultra: number; hyper: number; megaAttack?: number };
  reverseUpgrade: { illustration: number; specialIllustration: number };
}> = {
  // Chase slots deliberately unchanged; only ordinary middle-tier hits increase.
  'sv03.5': { finalSlot: { rare: .760, double: .188, ultra: .048, hyper: .004 }, reverseUpgrade: { illustration: .067, specialIllustration: .015 } },
  'me02.5': { finalSlot: { rare: .75, double: .185, ultra: .048, hyper: .002, megaAttack: .015 }, reverseUpgrade: { illustration: .067, specialIllustration: .015 } }
};
export const PRODUCT_PRICES: Record<string, { physical: number; online: number }> = {
  // Online prices are reserved for future product drops. Keep even those
  // cheaper packs below 100% expected recovery across the market cycle.
  '151-booster': { physical: 8, online: 7.95 },
  '151-etb': { physical: 78, online: 74 },
  '151-upc': { physical: 170, online: 162 },
  'ascended-heroes-booster': { physical: 9.5, online: 9 }
};
