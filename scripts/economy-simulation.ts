import { CARDS, CARD_BY_ID } from '../src/data/cards';
import { PRODUCTS } from '../src/data/products';
import { generatePack } from '../src/core/packs';
import { rawValue, ownedValue } from '../src/core/economy';
import { seeded, createCard } from '../src/core/inventory';
import type { Pack } from '../src/core/types';
import { PACK_BALANCE, CARD_VALUES, FIXED_RAW_CARD_VALUES } from '../src/data/balance';

const TIME = Date.UTC(2026, 9, 5, 12);
const percentile = (sorted: number[], quantile: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))];
const round = (n: number, places = 4) => Number(n.toFixed(places));

// Exact condition-sum distribution from createCard's existing two uniform branches.
// This audit does not change condition generation. It checks every market phase
// using the real ownedValue function, including both layers of cent rounding.
function conditionSums() {
  const attribute = new Map<number, number>();
  for (const [chance, low, high] of [[.08, 56, 81], [.92, 83, 100]]) {
    for (let value = low; value <= high; value++) {
      const mass = chance * Math.max(0, Math.min(high, value + .5) - Math.max(low, value - .5)) / (high - low);
      attribute.set(value, (attribute.get(value) ?? 0) + mass);
    }
  }
  let sums = new Map([[0, 1]]);
  for (let i = 0; i < 5; i++) {
    const next = new Map<number, number>();
    for (const [sum, probability] of sums) for (const [value, mass] of attribute) next.set(sum + value, (next.get(sum + value) ?? 0) + probability * mass);
    sums = next;
  }
  return sums;
}
export function marketEnvelope(productId: string) {
  const product = PRODUCTS.find(p => p.code === productId && p.type === 'booster')!;
  const { finalSlot, reverseUpgrade } = PACK_BALANCE[product.setCode];
  const pool = CARDS.filter(c => c.setCode === product.setCode);
  // Four Commons and three Uncommons are already excluded from reverse slots.
  const reverseCount = pool.filter(c => ['Common', 'Uncommon', 'Rare'].includes(c.rarity)).length - 7;
  const expectedCounts: Record<string, number> = {
    Common: 4, Uncommon: 3, Rare: finalSlot.rare, 'Double rare': finalSlot.double,
    'Ultra Rare': finalSlot.ultra, [product.setCode === 'me02.5' ? 'Mega Hyper Rare' : 'Hyper rare']: finalSlot.hyper,
    ...(finalSlot.megaAttack ? { 'Mega attack rare': finalSlot.megaAttack } : {}),
    'Illustration rare': reverseUpgrade.illustration, 'Special illustration rare': reverseUpgrade.specialIllustration
  };
  for (const rarity of ['Common', 'Uncommon', 'Rare']) {
    const alreadySelected = rarity === 'Common' ? 4 : rarity === 'Uncommon' ? 3 : 0;
    expectedCounts[rarity] += (2 - reverseUpgrade.illustration - reverseUpgrade.specialIllustration) * (pool.filter(c => c.rarity === rarity).length - alreadySelected) / reverseCount;
  }
  const sums = conditionSums();
  const copy = createCard(pool[0].id, 'simulation-envelope', seeded(1), 'normal', 'pack', TIME);
  const expected = (cardId: string, marketSeed: number) => {
    copy.cardId = cardId;
    let total = 0;
    for (const [sum, probability] of sums) {
      const average = sum / 5;
      copy.condition = { centering: average, corners: average, edges: average, surface: average, print: average };
      total += ownedValue(copy, marketSeed, TIME) * probability;
    }
    return total;
  };
  const means: number[] = [];
  for (let phase = 0; phase < 256; phase++) {
    const marketSeed = phase * Math.PI * 2 / 256;
    const cache = new Map<string, number>();
    const energies = CARDS.filter(c => c.setCode === 'sve');
    let total = energies.reduce((sum, card) => sum + expected(card.id, marketSeed), 0) / energies.length;
    for (const [rarity, count] of Object.entries(expectedCounts)) {
      const cards = pool.filter(c => c.rarity === rarity);
      total += count * cards.reduce((sum, card) => {
        if (!cache.has(card.id)) cache.set(card.id, expected(card.id, marketSeed));
        return sum + cache.get(card.id)!;
      }, 0) / cards.length;
    }
    means.push(total);
  }
  return { method: 'Exact condition-sum expectation, real ownedValue, configured slot weights, 256 market phases', minimumExpectedRaw: round(Math.min(...means)), maximumExpectedRaw: round(Math.max(...means)), meanExpectedRaw: round(means.reduce((a, b) => a + b, 0) / means.length), maximumPhysicalRecoveryPercent: round(Math.max(...means) / product.price * 100) };
}
export function simulateEconomy(count: number, seed: number, includeRareEvents = false) {
  const sets = PRODUCTS.filter(p => p.type === 'booster' && p.manifest.verified).map(product => {
    const random = seeded(seed), totals: number[] = [], referenceTotals: number[] = [];
    const rarityCards: Record<string, number> = {}, rarityPacks: Record<string, number> = {}, finalSlot: Record<string, number> = {}, conditions: Record<string, { sum: number; cards: number }> = {};
    const outcomes = { loss: 0, breakEven: 0, modestProfit: 0, strongProfit: 0 };
    let losing = 0, chasePacks = 0, majorHitPacks = 0, charizardPacks = 0, sum = 0, sumSquares = 0, referenceSum = 0;
    for (let i = 0; i < count; i++) {
      const pack: Pack = { uid: `simulation-${i}`, setCode: product.setCode, productId: product.code, variant: 0, price: product.price, purchasedAt: TIME, seed: Math.floor(random() * 4294967296), owner: 'local-player', state: 'unopened', generationVersion: includeRareEvents ? 2 : 1 };
      const cards = generatePack(pack, undefined, TIME);
      // Stratify the market across phases rather than selecting a favorable market day.
      const marketSeed = i % 256 * Math.PI * 2 / 256;
      const value = round(cards.reduce((total, card) => total + ownedValue(card, marketSeed, TIME), 0), 2);
      const reference = round(cards.reduce((total, card) => total + rawValue(CARD_BY_ID.get(card.cardId)!, marketSeed, TIME), 0), 2);
      totals.push(value); referenceTotals.push(reference); sum += value; sumSquares += value * value; referenceSum += reference;
      const ratio = value / product.price;
      if (ratio < 1) losing++;
      if (ratio < .9) outcomes.loss++; else if (ratio <= 1.1) outcomes.breakEven++; else if (ratio < 2) outcomes.modestProfit++; else outcomes.strongProfit++;
      const tiers = new Set<string>(); let chase = false, majorHit = false, charizard = false;
      for (const card of cards) {
        const definition = CARD_BY_ID.get(card.cardId)!;
        if (definition.setCode !== product.setCode && definition.setCode !== 'sve') throw new Error('Cross-set pull');
        const rarity = definition.rarity; rarityCards[rarity] = (rarityCards[rarity] ?? 0) + 1; tiers.add(rarity);
        const condition = Object.values(card.condition).reduce((a, b) => a + b, 0) / 5;
        (conditions[rarity] ??= { sum: 0, cards: 0 }).sum += condition; conditions[rarity].cards++;
        if (rarity === 'Special illustration rare' || rarity === 'Hyper rare') chase = true;
        if (ownedValue(card, marketSeed, TIME) >= 50) majorHit = true;
        if (card.cardId === 'sv03.5-199') charizard = true;
      }
      for (const rarity of tiers) rarityPacks[rarity] = (rarityPacks[rarity] ?? 0) + 1;
      const last = CARD_BY_ID.get(cards.at(-1)!.cardId)!.rarity; finalSlot[last] = (finalSlot[last] ?? 0) + 1;
      if (chase) chasePacks++; if (majorHit) majorHitPacks++; if (charizard) charizardPacks++;
    }
    totals.sort((a, b) => a - b); referenceTotals.sort((a, b) => a - b);
    const average = sum / count, stdError = Math.sqrt(Math.max(0, sumSquares / count - average * average) / count);
    return {
      setCode: product.setCode, productId: product.code, packs: count, averagePackCost: product.price,
      averageRawValue: round(average), averageReferenceValue: round(referenceSum / count), rawRecoveryPercent: round(average / product.price * 100), referenceRecoveryPercent: round(referenceSum / count / product.price * 100),
      medianRawValue: percentile(totals, .5), medianReferenceValue: percentile(referenceTotals, .5), percentiles: { p10: percentile(totals, .1), p25: percentile(totals, .25), p75: percentile(totals, .75), p90: percentile(totals, .9), p99: percentile(totals, .99) },
      mean95ConfidenceInterval: [round(average - 1.96 * stdError), round(average + 1.96 * stdError)],
      strictLossPercent: round(losing / count * 100), outcomePercent: Object.fromEntries(Object.entries(outcomes).map(([k, v]) => [k, round(v / count * 100)])),
      rarityCardCounts: rarityCards, rarityPackPercent: Object.fromEntries(Object.entries(rarityPacks).map(([k, v]) => [k, round(v / count * 100)])), finalSlotPercent: Object.fromEntries(Object.entries(finalSlot).map(([k, v]) => [k, round(v / count * 100)])),
      chasePackPercent: round(chasePacks / count * 100), majorHitPackPercent: round(majorHitPacks / count * 100), charizard199PackPercent: round(charizardPacks / count * 100),
      meanConditionByRarity: Object.fromEntries(Object.entries(conditions).map(([k, v]) => [k, round(v.sum / v.cards)])),
      marketEnvelope: marketEnvelope(product.code),
      valuesByRarity: Object.fromEntries([...new Set(CARDS.map(c => c.rarity))].map(r => [r, [...new Set(CARDS.filter(c => c.rarity === r).map(c => c.value))]]))
    };
  });
  const products = PRODUCTS.map(product => {
    const packValue = product.type === 'booster' ? sets.find(s => s.productId === product.code)!.averageRawValue : product.manifest.packs.reduce((sum, item) => sum + sets.find(s => s.productId === item.productId)!.averageRawValue * item.quantity, 0);
    let fixedValue = 0;
    const random = seeded(seed ^ 0x151);
    for (let i = 0; i < 4096; i++) for (const item of product.manifest.cards) for (let j = 0; j < item.quantity; j++) {
      const owned = createCard(item.cardId, 'simulation-container', random, item.finish, 'promo', TIME);
      fixedValue += ownedValue(owned, i % 256 * Math.PI * 2 / 256, TIME) / 4096;
    }
    const expectedContentsRawValue = packValue + fixedValue;
    return { productId: product.code, packCount: product.type === 'booster' ? 1 : product.manifest.packs.reduce((sum, item) => sum + item.quantity, 0), physicalPrice: product.price, onlinePrice: product.onlineDropPrice, expectedPackRawValue: round(packValue), expectedFixedRawValue: round(fixedValue), expectedContentsRawValue: round(expectedContentsRawValue), physicalRecoveryPercent: round(expectedContentsRawValue / product.price * 100), onlineRecoveryPercent: round(expectedContentsRawValue / product.onlineDropPrice * 100) };
  });
  return { seed, marketTime: new Date(TIME).toISOString(), marketPhases: 256, money: 'simulated coins', rawValueBasis: 'Owned raw value, including existing saved-condition discount; no selling-channel fee applied', outcomeDefinitions: { loss: '<90% of pack price', breakEven: '90–110%', modestProfit: '>110% and <200%', strongProfit: '>=200%', strictLoss: '<100%', chase: 'at least one SIR or Hyper Rare', majorHit: 'at least one raw card worth >=50 coins' }, sets, products, balance: { cardValues: { ...CARD_VALUES }, packRules: structuredClone(PACK_BALANCE) } };
}

// Development-only exploration in this CLI's isolated Vite module context.
// Each candidate runs the real generator and valuation functions; no GameStore,
// browser storage, inventory transaction or UI is constructed.
export function exploreProfiles(count: number, seed: number) {
  const originalValues = { ...CARD_VALUES }, originalRules = structuredClone(PACK_BALANCE), originalPrices = PRODUCTS.map(p => p.price);
  const originalCardValues = new Map(CARDS.map(c => [c.id, c.value]));
  const profiles = [
    { name: 'affordable-cautious', common: .22, uncommon: .41, rare: 1.05, doubleValue: 5.1, ultraValue: 12.1, irValue: 18.1, doubleRate: .188, ultraRate: .048, irRate: .067, price: 8 },
    { name: 'target-cautious', common: .22, uncommon: .41, rare: 1.05, doubleValue: 5.1, ultraValue: 12.1, irValue: 18.1, doubleRate: .188, ultraRate: .048, irRate: .067, price: 8.25 },
    { name: 'small', common: .23, uncommon: .42, rare: 1.06, doubleValue: 5.15, ultraValue: 12.15, irValue: 18.15, doubleRate: .19, ultraRate: .049, irRate: .068, price: 8.5 },
    { name: 'bulk-medium', common: .25, uncommon: .48, rare: 1.15, doubleValue: 5.4, ultraValue: 12.5, irValue: 18.5, doubleRate: .21, ultraRate: .052, irRate: .075, price: 9.5 },
    { name: 'bulk-strong', common: .3, uncommon: .5, rare: 1.2, doubleValue: 5.5, ultraValue: 12.5, irValue: 18.5, doubleRate: .22, ultraRate: .055, irRate: .08, price: 10 },
    { name: 'value-middle', common: .24, uncommon: .45, rare: 1.15, doubleValue: 5.25, ultraValue: 12, irValue: 18, doubleRate: .205, ultraRate: .05, irRate: .072, price: 9 },
    { name: 'same-price', common: .23, uncommon: .42, rare: 1.06, doubleValue: 5.15, ultraValue: 12.15, irValue: 18.15, doubleRate: .19, ultraRate: .049, irRate: .068, price: 8 },
    { name: 'mid-return', common: .3, uncommon: .5, rare: 1.2, doubleValue: 5.25, ultraValue: 9, irValue: 10, doubleRate: .21, ultraRate: .06, irRate: .1, price: 8.75 }
  ];
  try {
    return profiles.map(profile => {
      Object.assign(CARD_VALUES, { Common: profile.common, Uncommon: profile.uncommon, Rare: profile.rare, 'Double rare': profile.doubleValue, 'Ultra Rare': profile.ultraValue, 'Illustration rare': profile.irValue });
      for (const card of CARDS) card.value = FIXED_RAW_CARD_VALUES[card.id] ?? originalCardValues.get(card.id)! * ((CARD_VALUES[card.rarity] ?? .15) / (originalValues[card.rarity] ?? .15));
      const rules = PACK_BALANCE['sv03.5'];
      rules.finalSlot = { rare: 1 - profile.doubleRate - profile.ultraRate - .004, double: profile.doubleRate, ultra: profile.ultraRate, hyper: .004 };
      rules.reverseUpgrade.illustration = profile.irRate;
      PRODUCTS.find(p => p.code === '151-booster')!.price = profile.price;
      const result = simulateEconomy(count, seed).sets[0];
      return { profile, average: result.averageRawValue, recovery: result.rawRecoveryPercent, median: result.medianRawValue, strictLoss: result.strictLossPercent, outcomes: result.outcomePercent, expectedLoss: Number((result.averagePackCost - result.averageRawValue).toFixed(4)) };
    });
  } finally {
    Object.assign(CARD_VALUES, originalValues); Object.assign(PACK_BALANCE, originalRules);
    for (const card of CARDS) card.value = originalCardValues.get(card.id)!;
    PRODUCTS.forEach((p, i) => { p.price = originalPrices[i]; });
  }
}
