import { describe, expect, it } from 'vitest';
import conditionBefore from './fixtures/pack-condition-before.json' with { type: 'json' };
import { CARD_VALUES, DEFAULT_CARD_VALUE, PACK_BALANCE, PRODUCT_PRICES } from '../src/data/balance';
import { PRODUCTS } from '../src/data/products';
import { CARD_BY_ID } from '../src/data/cards';
import { generatePack } from '../src/core/packs';
import { createPack } from '../src/core/inventory';
import { ownedValue, rawValue } from '../src/core/economy';
import { GameStore } from '../src/core/store';
import { simulateEconomy } from '../scripts/economy-simulation';

describe('economy balance safeguards', () => {
  it('normalizes ordinary slot weights and preserves chase probabilities', () => {
    for (const rules of Object.values(PACK_BALANCE)) {
      expect(Object.values(rules.finalSlot).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      expect(Object.values(rules.finalSlot).every(v => v >= 0 && v <= 1)).toBe(true);
      expect(rules.reverseUpgrade.illustration + rules.reverseUpgrade.specialIllustration).toBeLessThan(1);
    }
    const rules = PACK_BALANCE['sv03.5'];
    expect(rules.finalSlot.hyper).toBe(.004);
    expect(rules.reverseUpgrade.specialIllustration).toBe(.015);
    expect(CARD_VALUES['Special illustration rare']).toBe(65);
    expect(CARD_VALUES['Hyper rare']).toBe(30);
  });

  it('raises inexpensive cards moderately while retaining value tiers', () => {
    const old: Record<string, number> = { Common: .2, Uncommon: .4, Rare: 1, 'Double rare': 5, 'Ultra Rare': 12, 'Illustration rare': 18 };
    for (const [rarity, previous] of Object.entries(old)) {
      expect(CARD_VALUES[rarity]).toBeGreaterThan(previous);
      expect(CARD_VALUES[rarity]).toBeLessThanOrEqual(previous * 1.15);
    }
    const ascending = ['Common', 'Uncommon', 'Rare', 'Double rare', 'Ultra Rare', 'Illustration rare', 'Hyper rare', 'Special illustration rare'].map(r => CARD_VALUES[r]);
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
    expect(DEFAULT_CARD_VALUE).toBe(.15);
  });

  it('preserves all 2,816 condition outcomes from the pre-balance generator', async () => {
    const pack = createPack();
    const conditions = Array.from({ length: conditionBefore.seeds }, (_, seed) => generatePack({ ...pack, uid: 'condition-fixture', generationVersion: 1, seed }, undefined, 0).map(c => c.condition));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(conditions)));
    const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe(conditionBefore.conditionSha256);
  });

  it('keeps condition and grading separate from rarity and raw prices', () => {
    const copy = generatePack({ ...createPack(), seed: 7 })[0];
    const original = structuredClone(copy);
    const pristine = { ...copy, condition: { centering: 100, corners: 100, edges: 100, surface: 100, print: 100 } };
    const damaged = { ...copy, condition: { centering: 60, corners: 60, edges: 60, surface: 60, print: 60 } };
    for (const cardId of ['sv03.5-001', 'sv03.5-199']) {
      const good = { ...pristine, cardId }, bad = { ...damaged, cardId };
      expect(ownedValue(good, 0, 0)).toBe(rawValue(CARD_BY_ID.get(cardId)!, 0, 0));
      expect(ownedValue(bad, 0, 0)).toBeLessThan(ownedValue(good, 0, 0));
    }
    expect(copy).toEqual(original);
  });

  it('uses centralized prices and charges the correct sealed-product price once', () => {
    for (const product of PRODUCTS) {
      expect(product.price).toBe(PRODUCT_PRICES[product.code].physical);
      expect(product.physicalStorePrice).toBe(product.price);
      expect(product.onlineDropPrice).toBeLessThan(product.price);
    }
    let saved: string | null = null;
    const store = new GameStore({ read: () => saved, write: data => { saved = data; }, backup: () => {} });
    const price = PRODUCT_PRICES['151-upc'].physical;
    expect(store.buy('151-upc')).toBe(false); // A starting wallet cannot afford a UPC.
    store.state.currency = price;
    expect(store.buy('151-upc')).toBe(true);
    expect(store.state.currency).toBe(0);
    expect(store.buy('151-upc')).toBe(false);
    expect(store.state.sealedProducts).toHaveLength(1);
    const reloaded = new GameStore({ read: () => saved, write: () => {}, backup: () => {} });
    expect(reloaded.state.sealedProducts[0]).toEqual(store.state.sealedProducts[0]);
    expect(reloaded.state.opening).toBeNull();
  });

  it('keeps the individual-price buff modest with ordinary losses and occasional profits', () => {
    const report = simulateEconomy(20000, 1512026);
    const set = report.sets[0];
    expect(set.averagePackCost).toBe(8);
    expect(set.rawRecoveryPercent).toBeGreaterThan(90);
    expect(set.rawRecoveryPercent).toBeLessThan(100);
    expect(set.medianRawValue).toBeGreaterThan(4.1);
    expect(set.medianRawValue).toBeLessThan(5);
    expect(set.strictLossPercent).toBeGreaterThan(70);
    expect(set.strictLossPercent).toBeLessThan(81);
    expect(set.outcomePercent.modestProfit).toBeGreaterThan(4.5);
    expect(set.chasePackPercent).toBeLessThan(2.5);
    expect(set.charizard199PackPercent).toBeLessThan(.4);
    // A small price buff can bring a favorable market phase near break-even;
    // it must not introduce a large ordinary-pack return or change chase odds.
    expect(set.marketEnvelope.maximumExpectedRaw).toBeLessThan(PRODUCT_PRICES['151-booster'].physical * 1.04);
    // Ascended Heroes has deliberately
    // authoritative chase prices; do not suppress them to enforce this old target.
    // Allow one percentage point for finite-sample chase variance near break-even.
    for (const product of report.products.filter(p => p.productId.startsWith('151-'))) expect(product.physicalRecoveryPercent).toBeLessThan(101);
    for (const product of report.products.filter(p => p.productId.startsWith('151-') && p.productId !== '151-booster')) {
      expect(product.physicalRecoveryPercent).toBeGreaterThan(75);
      expect(product.physicalRecoveryPercent).toBeLessThan(101);
    }
  }, 15000);
});
