import { CARD_BY_ID } from '../data/cards';
import type { OwnedCard, Pack, PackEvents, PrintDefect, RareEventStats } from './types';

// SIMULATED odds, fixed independently of ordinary rarity/value balance.
export const RARE_EVENT_ODDS = Object.freeze({ individual: 1 / 500, fullPack: 1 / 2000, special: 1 / 1500 });
export const MISPRINT_MODIFIER = 30 as const;
export const SPECIAL_LINES = {
  venusaur: ['sv03.5-166', 'sv03.5-167', 'sv03.5-198'],
  charizard: ['sv03.5-168', 'sv03.5-169', 'sv03.5-199'],
  blastoise: ['sv03.5-170', 'sv03.5-171', 'sv03.5-200']
} as const;
export const SPECIAL_SOURCE = 'https://www.pokebeach.com/2023/09/scarlet-violet-151-complete-set-guide-card-images-products-demigod-packs-store-giveaways-and-more';

// Counter-based avalanche mixing: each domain has its own stream. Rare-event
// decisions/appearance never consume ordinary card-selection/condition draws.
export function rareRandom(seed: number, domain: number) {
  let counter = 0;
  return () => {
    let value = (seed + domain + Math.imul(++counter, 0x9e3779b9)) >>> 0;
    value = Math.imul(value ^ value >>> 16, 0x21f0aaad);
    value = Math.imul(value ^ value >>> 15, 0x735a2d97);
    return ((value ^ value >>> 15) >>> 0) / 4294967296;
  };
}
export function specialEligible(pack: Pick<Pack, 'setCode' | 'productId'>) { return (pack.setCode === 'sv03.5' && pack.productId === '151-booster') || (pack.setCode === 'me02.5' && pack.productId === 'ascended-heroes-booster'); }
export function misprintEligible(card: Pick<OwnedCard, 'origin' | 'finish'>) { return card.origin === 'pack' && card.finish !== 'metal'; }
export function makeDefect(random: () => number): PrintDefect {
  const types: PrintDefect['type'][] = ['off-center', 'miscut', 'registration', 'ink-defect'];
  const type = types[Math.floor(random() * types.length)], severity = .45 + random() * .5;
  const signed = () => (random() < .5 ? -1 : 1);
  return { type, side: type === 'off-center' || type === 'miscut' ? 'both' : random() < .7 ? 'front' : 'back', severity, offsetX: signed() * (.04 + severity * .10), offsetY: signed() * (.025 + severity * .08), cutTilt: signed() * (.01 + severity * .035), registrationX: signed() * (.002 + severity * .009), registrationY: signed() * (.001 + severity * .006), inkBandY: .15 + random() * .7, inkBandWidth: .012 + severity * .04 };
}
export function rollPackEvents(seed: number, eligible: boolean, setCode = 'sv03.5'): PackEvents {
  const specialRandom = rareRandom(seed, 0x13579bdf);
  const specialHit = eligible && specialRandom() < RARE_EVENT_ODDS.special;
  const lines = Object.keys(SPECIAL_LINES) as (keyof typeof SPECIAL_LINES)[];
  const fullMisprint = rareRandom(seed, 0x2468ace0)() < RARE_EVENT_ODDS.fullPack;
  return { version: 1, special: specialHit ? setCode === 'me02.5' ? { type: 'ascended-heroes-god' } : { type: 'english-151-demigod', line: lines[Math.floor(specialRandom() * lines.length)] } : null, fullMisprint, ...(fullMisprint ? { production: makeDefect(rareRandom(seed, 0x3a4b5c6d)) } : {}) };
}
export function individualMisprintRoll(seed: number, slot: number) { return rareRandom(seed, Math.imul(slot + 1, 0x6d2b79f5))() < RARE_EVENT_ODDS.individual; }
export function applyPackMisprints(pack: Pack, cards: OwnedCard[]) {
  const events = pack.rareEvents!;
  cards.forEach((card, slot) => {
    if (!misprintEligible(card)) return;
    if (!events.fullMisprint && !individualMisprintRoll(pack.seed, slot)) return;
    const random = rareRandom(pack.seed, Math.imul(slot + 1, 0x5bd1e995));
    const defect = events.fullMisprint ? { ...events.production! } : makeDefect(random);
    if (events.fullMisprint) {
      // The same production error, with small sheet-position variation.
      const variation = .96 + random() * .08;
      defect.severity = Math.min(1, defect.severity * variation);
      defect.offsetX *= variation; defect.offsetY *= variation;
      defect.cutTilt *= variation; defect.registrationX *= variation; defect.registrationY *= variation;
    }
    card.baseRawValue = CARD_BY_ID.get(card.cardId)!.value;
    card.misprint = { version: 1, modifier: MISPRINT_MODIFIER, defect, origin: events.fullMisprint ? 'full-pack' : 'individual', packUid: pack.uid, ...(events.fullMisprint ? { productionId: `${pack.uid}.sheet` } : {}), ...(events.special ? { specialType: events.special.type } : {}) };
  });
  return cards;
}
export function emptyRareEventStats(): RareEventStats { return { generatedPacks: 0, eligibleSpecialPacks: 0, specialPacks: 0, fullMisprintPacks: 0, combinedPacks: 0, individualMisprints: 0, fullPackMisprints: 0, individualEligibleCards: 0, specialIndividualMisprints: 0 }; }
export function recordRareEvents(stats: RareEventStats, pack: Pack, cards: OwnedCard[]) {
  // Forced development outcomes are not natural-population samples.
  if (pack.debugGenerated) return;
  stats.generatedPacks++; if (specialEligible(pack)) stats.eligibleSpecialPacks++;
  if (pack.rareEvents?.special) stats.specialPacks++;
  if (pack.rareEvents?.fullMisprint) stats.fullMisprintPacks++;
  if (pack.rareEvents?.special && pack.rareEvents.fullMisprint) stats.combinedPacks++;
  for (const card of cards) {
    if (!pack.rareEvents?.fullMisprint && misprintEligible(card)) stats.individualEligibleCards++;
    if (card.misprint?.origin === 'full-pack') stats.fullPackMisprints++;
    else if (card.misprint) { stats.individualMisprints++; if (card.misprint.specialType) stats.specialIndividualMisprints++; }
  }
}
export function misprintProvenance(card: Pick<OwnedCard, 'misprint'>) {
  const m = card.misprint; if (!m) return undefined;
  return `${m.specialType ? 'Special Pack + ' : ''}${m.origin === 'full-pack' ? 'Full Misprint Pack' : 'Individual Misprint Pull'}`;
}
