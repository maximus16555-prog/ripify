import { generatePack } from '../src/core/packs';
import { createPack, seeded } from '../src/core/inventory';
import { rollPackEvents, individualMisprintRoll, emptyRareEventStats, recordRareEvents, SPECIAL_LINES, RARE_EVENT_ODDS } from '../src/core/rare-events';
import { CARD_BY_ID } from '../src/data/cards';
import { ownedRawMarketValue, rawValue, ownedValue, gradeMultiplier, GRADERS } from '../src/core/economy';
import { newSave, parseSave } from '../src/core/save';
import { PRODUCT_BY_ID } from '../src/data/products';

export function simulateRareEvents(packCount: number, eventCount: number, initialSeed: number) {
  const random = seeded(initialSeed), stats = emptyRareEventStats();
  const base = createPack('151-booster', PRODUCT_BY_ID.get('151-booster')!.price), normalValues: number[] = [], eventValues: number[] = [];
  const errors = { duplicateDefinitions: 0, duplicateInstances: 0, invalidSetMappings: 0, invalidComposition: 0, invalidModifiers: 0, failedPersistence: 0 };
  const specialLines: Record<string, number> = {}, defectTypes: Record<string, number> = {};
  for (let i = 0; i < packCount; i++) {
    const pack = { ...base, uid: `sim-${i}`, seed: Math.floor(random() * 4294967296) };
    const cards = generatePack(pack, undefined, 0);
    recordRareEvents(stats, pack, cards);
    if (new Set(cards.map(c => c.cardId)).size !== 11) errors.duplicateDefinitions++;
    if (new Set(cards.map(c => c.uid)).size !== 11) errors.duplicateInstances++;
    if (cards.some(c => !['sv03.5', 'sve'].includes(CARD_BY_ID.get(c.cardId)!.setCode))) errors.invalidSetMappings++;
    if (pack.rareEvents?.special) {
      const line = pack.rareEvents.special.line; specialLines[line] = (specialLines[line] || 0) + 1;
      if (!SPECIAL_LINES[line].every((id, slot) => cards[slot + 8].cardId === id)) errors.invalidComposition++;
    }
    for (const c of cards) {
      if (c.misprint) {
        const type = c.misprint.defect.type; defectTypes[type] = (defectTypes[type] || 0) + 1;
        const raw = ownedRawMarketValue(c, 0, 0), baseRaw = rawValue({ ...CARD_BY_ID.get(c.cardId)!, value: c.baseRawValue! }, 0, 0);
        const slab = { ...c, status: 'graded' as const, grader: 'BGS' as const, grade: 9 };
        if (c.misprint.modifier !== 30 || raw !== Math.round(baseRaw * 30 * 100) / 100 || ownedValue(slab, 0, 0) !== Math.round(raw * gradeMultiplier(9) * GRADERS.BGS.premium * 100) / 100) errors.invalidModifiers++;
      }
    }
    eventValues.push(cards.reduce((total, c) => total + ownedRawMarketValue(c, 0, 0), 0));
    const ordinary = generatePack({ ...pack, generationVersion: 1, rareEvents: undefined }, undefined, 0);
    normalValues.push(ordinary.reduce((total, c) => total + ownedRawMarketValue(c, 0, 0), 0));
    if (i < 100 || pack.rareEvents?.fullMisprint || pack.rareEvents?.special) {
      const save = newSave(); save.packs = []; save.opening = { pack, cards, index: 0, stage: 'sealed' };
      if (JSON.stringify(parseSave(JSON.stringify(save)).opening) !== JSON.stringify(save.opening)) errors.failedPersistence++;
    }
  }
  // Cheap event stage uses the same actual roll functions, not a second statistical implementation.
  const eventStats = { packs: eventCount, special: 0, fullMisprint: 0, combined: 0, eligibleCards: 0, individual: 0, specialIndividual: 0 };
  const combinedSeeds: number[] = [];
  for (let i = 0; i < eventCount; i++) {
    const seed = (initialSeed + i) >>> 0, events = rollPackEvents(seed, true);
    if (events.special) eventStats.special++;
    if (events.fullMisprint) eventStats.fullMisprint++;
    if (events.fullMisprint && events.special) { eventStats.combined++; combinedSeeds.push(seed); }
    if (!events.fullMisprint) for (let slot = 0; slot < 11; slot++) {
      eventStats.eligibleCards++;
      if (individualMisprintRoll(seed, slot)) { eventStats.individual++; if (events.special) eventStats.specialIndividual++; }
    }
  }
  const combinedWitnesses = combinedSeeds.map(seed => {
    const pack = { ...base, uid: `combined-${seed}`, seed }, cards = generatePack(pack, undefined, 0);
    const save = newSave(); save.packs = []; save.opening = { pack, cards, index: 0, stage: 'sealed' };
    if (JSON.stringify(parseSave(JSON.stringify(save)).opening) !== JSON.stringify(save.opening)) errors.failedPersistence++;
    return { seed, line: pack.rareEvents!.special!.line, cardCount: cards.length, uniqueDefinitions: new Set(cards.map(c => c.cardId)).size, fullMisprintCards: cards.filter(c => c.misprint?.origin === 'full-pack').length, modifiers: [...new Set(cards.map(c => c.misprint?.modifier))], productionTypes: [...new Set(cards.map(c => c.misprint?.defect.type))] };
  });
  const rate = (hits: number, n: number, p: number) => ({ hits, trials: n, expectedHits: n * p, observedOneIn: hits ? n / hits : null, standardDeviations: (hits - n * p) / Math.sqrt(n * p * (1 - p)) });
  const distribution = (values: number[]) => {
    values.sort((a, b) => a - b); const average = values.reduce((a, b) => a + b, 0) / values.length;
    return { average, median: values[Math.floor(values.length / 2)], rawRecoveryPercent: average / base.price * 100, lossPercent: values.filter(v => v < base.price).length / values.length * 100 };
  };
  return { seed: initialSeed, generatedPackCount: packCount, generatedCardCount: packCount * 11,
    rates: { individual: rate(eventStats.individual, eventStats.eligibleCards, RARE_EVENT_ODDS.individual), fullMisprint: rate(eventStats.fullMisprint, eventCount, RARE_EVENT_ODDS.fullPack), special: rate(eventStats.special, eventCount, RARE_EVENT_ODDS.special), combined: rate(eventStats.combined, eventCount, RARE_EVENT_ODDS.special * RARE_EVENT_ODDS.fullPack) },
    actualGenerationStats: stats, specialLines, defectTypes, eventStats, combinedWitnesses, errors,
    economy: { packCost: base.price, ordinaryVersion1: distribution(normalValues), withRareEvents: distribution(eventValues), marketSeed: 0, marketTime: 0 } };
}
