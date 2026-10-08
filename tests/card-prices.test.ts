import { describe, it, expect } from 'vitest';
import { CARDS, CARD_BY_ID } from '../src/data/cards';
import { baseCardValue, INDIVIDUAL_RAW_CARD_VALUES, FIXED_RAW_CARD_VALUES, CARD_VALUES, INDIVIDUAL_PRICE_POLICY } from '../src/data/balance';
import { createCard, seeded } from '../src/core/inventory';
import { ownedRawMarketValue, ownedValue, rawValue, gradeMultiplier, GRADERS } from '../src/core/economy';
import { makeDefect } from '../src/core/rare-events';
import { GameStore } from '../src/core/store';
import { collectionItems, portfolioValue, searchCards, marketHistory, ComputerServices } from '../src/core/computer';

describe('individual authoritative card prices', () => {
  it('covers every exact printing once, with explicit manual priority and no rarity fallback', () => {
    const ids = new Set(CARDS.map(c => c.id));
    expect(ids.size).toBe(513);
    expect(Object.keys(INDIVIDUAL_RAW_CARD_VALUES).length + Object.keys(FIXED_RAW_CARD_VALUES).length).toBe(ids.size);
    for (const id of [...Object.keys(INDIVIDUAL_RAW_CARD_VALUES), ...Object.keys(FIXED_RAW_CARD_VALUES)]) expect(ids.has(id)).toBe(true);
    for (const card of CARDS) {
      expect(card.value).toBe(baseCardValue(card.id));
      expect(card.value).toBeGreaterThan(0);
      expect(Math.round(card.value * 100)).toBeCloseTo(card.value * 100);
      expect(card.id).toContain(`${card.setCode}-`);
      expect(Number(card.id.split('-').at(-1))).toBe(Number(card.number.split('/')[0]));
      expect(baseCardValue(card.id, 'unrelated rarity')).toBe(card.value);
    }
    expect(() => baseCardValue('missing-printing', 'Common')).toThrow('Missing authoritative base price');
  });

  it('varies prices within each supported set and calibrates only small mean increases', () => {
    for (const setCode of ['sv03.5', 'me02.5']) for (const rarity of ['Common', 'Uncommon', 'Rare', 'Double rare', 'Ultra Rare', 'Illustration rare']) {
      const pool = CARDS.filter(c => c.setCode === setCode && c.rarity === rarity);
      const prices = new Map<number, number>(); for (const c of pool) prices.set(c.value, (prices.get(c.value) ?? 0) + 1);
      expect(prices.size).toBeGreaterThanOrEqual(Math.min(20, pool.length - 1));
      expect(Math.max(...prices.values()) / pool.length).toBeLessThan(.20);
      const expected = CARD_VALUES[rarity] * INDIVIDUAL_PRICE_POLICY.meanBuff[rarity as keyof typeof INDIVIDUAL_PRICE_POLICY.meanBuff];
      expect(pool.reduce((n, c) => n + c.value, 0) / pool.length).toBeCloseTo(expected, 2);
    }
  });

  it('uses current definition prices for old raw/misprint copies and applies 30x only once', () => {
    for (const cardId of ['sv03.5-001', 'sv03.5-005', 'sv03.5-026', 'sv03.5-006', 'sv03.5-199', 'me02.5-276']) {
      const original = createCard(cardId, 'pricing-fixture', seeded(12), 'holo', 'pack', 0);
      const copy = { ...original, baseRawValue: .01, misprint: { version: 1 as const, modifier: 30 as const, defect: makeDefect(seeded(21)), origin: 'individual' as const, packUid: original.source } };
      const saved = JSON.stringify(copy), base = rawValue(CARD_BY_ID.get(cardId)!, 0, 0);
      expect(ownedRawMarketValue(original, 0, 0)).toBe(base);
      expect(ownedRawMarketValue(copy, 0, 0)).toBe(Math.round(base * 30 * 100) / 100);
      for (const grader of Object.keys(GRADERS) as (keyof typeof GRADERS)[]) {
        const slab = { ...copy, status: 'graded' as const, grader, grade: 10 };
        const expected = Math.round(Math.round(base * 30 * 100) / 100 * gradeMultiplier(10) * GRADERS[grader].premium * 100) / 100;
        expect(ownedValue(slab, 0, 0)).toBe(expected);
        expect(ownedValue(JSON.parse(JSON.stringify(slab)), 0, 0)).toBe(expected);
      }
      expect(JSON.stringify(copy)).toBe(saved);
    }
  });

  it('shares values across portfolio, catalog, listings, selling and grading without mutating copies', () => {
    let saved = '';
    const storage = { read: () => saved || null, write: (s: string) => { saved = s; }, backup: () => {} };
    const store = new GameStore(storage), services = new ComputerServices(store);
    const card = createCard('sv03.5-006', 'pricing-fixture', seeded(4), 'holo', 'pack');
    store.state.cards = [card]; store.state.packs = []; store.state.sealedProducts = []; store.state.currency = 1000;
    const expected = ownedValue(card, store.state.marketSeed);
    expect(collectionItems(store.state)[0].value).toBe(expected); expect(portfolioValue(store.state)).toBe(expected);
    expect(searchCards('Charizard ex').find(c => c.id === card.cardId)?.value).toBe(CARD_BY_ID.get(card.cardId)!.value);
    expect(marketHistory(card.cardId, store.state.marketSeed, 30).at(-1)!.value).toBe(rawValue(CARD_BY_ID.get(card.cardId)!, store.state.marketSeed));
    expect(services.list('card', card.uid, expected)).toBe(true);
    expect(store.state.computer!.listings[0].market).toBe(expected);
    expect(store.sell(card.uid)).toBe(false);
    expect(services.resolve(store.state.computer!.listings[0].uid, false)).toBe(true);
    const before = store.state.currency; expect(store.sell(card.uid)).toBe(true);
    expect(store.state.currency).toBe(Math.round((before + expected) * 100) / 100);
    expect(new GameStore(storage).state.cards).toHaveLength(0);
    expect(card.baseRawValue).toBe(CARD_BY_ID.get(card.cardId)!.value);
  });
});
