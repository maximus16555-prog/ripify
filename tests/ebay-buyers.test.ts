import { describe, it, expect, vi } from 'vitest';
import { buyerTerms, cardBuyerDemand, EBAY_BUYERS, rollBuyer } from '../src/core/ebay-buyers';
import { ComputerServices } from '../src/core/computer';
import { GameStore } from '../src/core/store';
import { CARD_BY_ID } from '../src/data/cards';
import * as inventory from '../src/core/inventory';
import { ownedValue } from '../src/core/economy';
import { parseSave } from '../src/core/save';

describe('price-sensitive eBay buyers', () => {
  it('discounts improve odds and shorten waits under identical buyer randomness', () => {
    const prices = [11, 19.5, 22, 25, 44, 110];
    const terms = prices.map(p => buyerTerms(p, 22));
    const rolls = prices.map(p => rollBuyer(p, 22, 1, () => .5));
    for (let i = 1; i < prices.length; i++) {
      expect(terms[i].saleChance).toBeLessThanOrEqual(terms[i - 1].saleChance);
      expect(rolls[i].minutes).toBeGreaterThanOrEqual(rolls[i - 1].minutes);
    }
    expect(rolls[1].minutes).toBeLessThan(rolls[2].minutes);
    expect(rolls[2].minutes).toBeLessThan(rolls[3].minutes);
    expect(rollBuyer(.01, 4582, 1.3, () => .999).outcome).toBe('unsold');
    for (const roll of rolls) expect(roll.minutes).toBeGreaterThanOrEqual(EBAY_BUYERS.minimumMinutes);
    expect(rollBuyer(1e9, .01, .7, () => .999)).toMatchObject({ outcome: 'unsold', minutes: EBAY_BUYERS.maximumMinutes });
  });
  it('retains bounded exact-card collector demand and accounts for it in both odds and timing', () => {
    const common = CARD_BY_ID.get('sv03.5-001')!, chase = CARD_BY_ID.get('me02.5-276')!;
    expect(cardBuyerDemand(chase)).toBeGreaterThan(cardBuyerDemand(common));
    expect(cardBuyerDemand(chase)).toBeLessThanOrEqual(EBAY_BUYERS.maximumDemand);
    expect(buyerTerms(22, 22, 1.3).saleChance).toBeGreaterThan(buyerTerms(22, 22, .7).saleChance);
    expect(rollBuyer(22, 22, 1.3, () => .5).minutes).toBeLessThan(rollBuyer(22, 22, .7, () => .5).minutes);
  });
  it('observed probabilities and average waits match pricing terms over 100,000 buyers per price', () => {
    for (const price of [19.5, 22, 25, 44]) {
      const random = inventory.seeded(19), n = 100000; let sales = 0, minutes = 0;
      for (let i = 0; i < n; i++) { const roll = rollBuyer(price, 22, 1, random); sales += Number(roll.outcome === 'sale'); minutes += roll.minutes; }
      expect(sales / n).toBeCloseTo(buyerTerms(price, 22).saleChance, 2);
      expect(minutes / n).toBeCloseTo(rollBuyer(price, 22, 1, () => .5).minutes, 0);
    }
  });
  it('persists buyer decisions once, reaches offers before expiry, and settles atomically only once', () => {
    let saved = ''; const storage = { read: () => saved || null, write: (s: string) => { saved = s; }, backup: () => {} };
    const store = new GameStore(storage), services = new ComputerServices(store);
    const card = inventory.createCard('sv03.5-173', 'buyer-fixture', inventory.seeded(5), 'holo', 'pack');
    store.state.cards = [card];
    const seed = vi.spyOn(inventory, 'newSeed').mockReturnValue(0);
    try { expect(services.list('card', card.uid, ownedValue(card, store.state.marketSeed) * .5)).toBe(true); }
    finally { seed.mockRestore(); }
    const listing = structuredClone(store.state.computer!.listings[0]);
    expect(listing.watchAt).toBeGreaterThan(listing.started);
    expect(listing.offerAt).toBeLessThan(listing.due);
    const again = new GameStore(storage), buyers = new ComputerServices(again);
    expect(again.state.computer!.listings[0]).toEqual(listing);
    again.state.computer!.minute = listing.watchAt!; buyers.advance();
    expect(again.state.computer!.listings[0].status).toBe('WATCHING');
    // Exercise the actual saved-offer path independently of which buyer the seed selected.
    again.state.computer!.listings[0].outcome = 'offer'; again.state.computer!.minute = listing.offerAt!;
    buyers.advance(); expect(again.state.computer!.listings[0].status).toBe('OFFER');
    const balance = again.state.currency;
    expect(buyers.resolve(listing.uid, true)).toBe(true); expect(buyers.resolve(listing.uid, true)).toBe(false);
    expect(again.state.currency).toBeCloseTo(balance + listing.offer, 2);
    expect(new GameStore(storage).state.cards).toHaveLength(0);
    expect(() => parseSave(saved)).not.toThrow();
  });
  it('keeps old listings intact and rejects malformed new timing or zero-cent asking prices', () => {
    const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} }), services = new ComputerServices(store);
    const pack = store.state.packs[0];
    expect(services.list('pack', pack.uid, .004)).toBe(false);
    expect(services.list('pack', pack.uid, 12)).toBe(true);
    const listing = store.state.computer!.listings[0];
    delete listing.watchAt; delete listing.offerAt; listing.due = listing.started + 120; listing.outcome = 'offer';
    const legacy = parseSave(JSON.stringify(store.state)); expect(legacy.computer!.listings[0]).toEqual(listing);
    store.state.computer!.minute = listing.started + 65; services.advance();
    expect(store.state.computer!.listings[0].status).toBe('OFFER');
    store.state.computer!.listings[0].watchAt = listing.started + 10;
    store.state.computer!.listings[0].offerAt = listing.due;
    expect(() => parseSave(JSON.stringify(store.state))).toThrow('Invalid buyer timing');
  });
});
