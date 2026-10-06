// Simulated coin values and pull weights, not live market quotes or factory odds.
export const CARD_VALUES: Record<string, number> = {
  Common: .22, Uncommon: .41, Rare: 1.05, 'Double rare': 5.1,
  'Ultra Rare': 12.1, 'Illustration rare': 18.1, 'Special illustration rare': 65, 'Hyper rare': 30,
  'Mega attack rare': 25, 'Mega Hyper Rare': 100
};
export const DEFAULT_CARD_VALUE = .15;
// Authoritative RIPIFY prices for these exact printings, not live market quotes.
// They override rarity defaults and simulated market fluctuations.
export const FIXED_RAW_CARD_VALUES: Readonly<Record<string, number>> = Object.freeze({
  'me02.5-276': 4582,
  'me02.5-284': 4317,
  'me02.5-290': 1684,
  'me02.5-294': 768,
  'me02.5-277': 711,
  'me02.5-281': 657,
  'me02.5-295': 586
});
export function baseCardValue(id: string, rarity: string) {
  return FIXED_RAW_CARD_VALUES[id] ?? CARD_VALUES[rarity] ?? DEFAULT_CARD_VALUE;
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
