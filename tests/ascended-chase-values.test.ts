import { describe, expect, it } from 'vitest';
import { CARD_BY_ID } from '../src/data/cards';
import { baseCardValue, FIXED_RAW_CARD_VALUES } from '../src/data/balance';
import { createCard, createPack, seeded } from '../src/core/inventory';
import { applyPackMisprints, makeDefect, RARE_EVENT_ODDS } from '../src/core/rare-events';
import { gradeMultiplier, GRADERS, marketFactor, ownedRawMarketValue, ownedValue, rawValue } from '../src/core/economy';
import { newSave, parseSave } from '../src/core/save';
import { generatePack } from '../src/core/packs';

const chase = [
  ['276', 'Pikachu ex', 4582, 137460, 'Special illustration rare'],
  ['284', 'Mega Gengar ex', 4317, 129510, 'Special illustration rare'],
  ['290', 'Mega Dragonite ex', 1684, 50520, 'Special illustration rare'],
  ['294', 'Mega Charizard Y ex', 768, 23040, 'Mega Hyper Rare'],
  ['277', 'Pikachu ex', 711, 21330, 'Special illustration rare'],
  ['281', "Team Rocket's Mewtwo ex", 657, 19710, 'Special illustration rare'],
  ['295', 'Mega Dragonite ex', 586, 17580, 'Mega Hyper Rare']
] as const;

describe('authoritative Ascended Heroes chase prices', () => {
  it.each(chase)('pins exact printing #%s and its single 30x misprint value', (number, name, base, misprint, rarity) => {
    const id = `me02.5-${number}`, definition = CARD_BY_ID.get(id)!;
    expect(definition).toMatchObject({ id, name, number: `${number}/217`, setCode: 'me02.5', rarity, value: base });
    expect(baseCardValue(id, rarity)).toBe(base);
    const pack = createPack('ascended-heroes-booster', 9.5, undefined, 42, 0);
    pack.rareEvents = { version: 1, special: { type: 'ascended-heroes-god' }, fullMisprint: true, production: makeDefect(seeded(42)) };
    const card = createCard(id, pack.uid, seeded(17), 'holo', 'pack', 0);
    const condition = structuredClone(card.condition);
    for (const seed of [0, 7, 99]) for (const now of [0, 86400000, 1791290000000]) {
      expect(marketFactor(definition, seed, now)).toBe(1);
      expect(rawValue(definition, seed, now)).toBe(base);
      expect(ownedRawMarketValue(card, seed, now)).toBe(base);
    }
    applyPackMisprints(pack, [card]);
    expect(card.baseRawValue).toBe(base);
    expect(card.misprint!.modifier).toBe(30);
    expect(ownedRawMarketValue(card, 99, 0)).toBe(misprint);
    applyPackMisprints(pack, [card]);
    expect(ownedRawMarketValue(card, 7, 86400000)).toBe(misprint);
    // Old saved copies may still carry the previous rarity-level base price.
    card.baseRawValue = 65;
    const saved = newSave(); saved.cards = [card];
    const reloaded = parseSave(JSON.stringify(saved)).cards[0];
    expect(reloaded).toEqual(card);
    expect(ownedRawMarketValue(reloaded, 42, 0)).toBe(misprint);
    const slab = { ...reloaded, status: 'graded' as const, grader: 'PSA' as const, grade: 10 };
    expect(ownedValue(slab, 42, 0)).toBe(Math.round(misprint * gradeMultiplier(10) * GRADERS.PSA.premium * 100) / 100);
    expect(slab.condition).toEqual(condition);
    expect(slab.misprint).toEqual(card.misprint);
  });

  it('keeps fixed prices in god packs without changing the independent rare-event odds', () => {
    expect(RARE_EVENT_ODDS).toEqual({ individual: 1 / 500, fullPack: 1 / 2000, special: 1 / 1500 });
    const ids = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const pack = createPack('ascended-heroes-booster', 9.5, undefined, seed, 0);
      pack.rareEvents = { version: 1, special: { type: 'ascended-heroes-god' }, fullMisprint: false };
      for (const card of generatePack(pack, seeded(seed), 0)) {
        const base = FIXED_RAW_CARD_VALUES[card.cardId];
        if (base === undefined) continue;
        ids.add(card.cardId);
        expect(card.baseRawValue).toBe(base);
        expect(ownedRawMarketValue(card, seed, 0)).toBe(base * (card.misprint ? 30 : 1));
      }
    }
    expect(ids).toEqual(new Set(chase.filter(c => c[4] === 'Special illustration rare').map(c => `me02.5-${c[0]}`)));
    // Existing god composition excludes Mega Hyper Rares; ordinary slots still
    // provide those cards. This price update does not alter either pool.
  });
});
