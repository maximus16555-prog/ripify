import { describe, it, expect } from 'vitest';
import { createTestPack } from '../src/dev/test-packs';
import { GameStore } from '../src/core/store';
import { CARDS, CARD_BY_ID } from '../src/data/cards';
import { createPack } from '../src/core/inventory';
import { generatePack } from '../src/core/packs';
import { packPullPaths } from '../src/core/pack-pools';
import { RARE_EVENT_ODDS, rollPackEvents, SPECIAL_LINES } from '../src/core/rare-events';
import { PRODUCT_BY_ID } from '../src/data/products';
import { parseSave } from '../src/core/save';
import artwork from '../src/data/verified/artwork.json' with { type: 'json' };

describe('shop and per-instance development integration', () => {
  it('pins the complete Ascended Heroes pool, exact scans and every pullable rarity', () => {
    const cards = CARDS.filter(c => c.setCode === 'me02.5');
    expect(cards).toHaveLength(295);
    const paths = packPullPaths('me02.5');
    for (const [i, c] of cards.entries()) {
      const number = String(i + 1).padStart(3, '0');
      expect(c.id).toBe(`me02.5-${number}`);
      expect(c.number).toBe(`${number}/217`);
      const source = `https://assets.tcgdex.net/en/me/me02.5/${number}/high.webp`, asset = artwork.assets.find(a => a.kind === 'card' && a.id === c.id);
      if (asset) expect(asset.sourceUrl).toBe(source);
      expect(c.image).toBe(asset?.path ?? source);
      expect(c.year).toBe(2026);
      expect(paths.some(path => path.chance > 0 && path.cards.some(d => d.id === c.id))).toBe(true);
    }
    expect(cards.filter(c => c.rarity === 'Mega attack rare')).toHaveLength(7);
  });
  for (const [slot, productId, setCode] of [[1, '151-booster', 'sv03.5'], [2, 'ascended-heroes-booster', 'me02.5']] as const) {
    it(`buys ${productId} unopened, charges once and generates only its set`, () => {
      let saved = '';
      const store = new GameStore({ read: () => null, write: d => { saved = d; }, backup: () => {} });
      const price = PRODUCT_BY_ID.get(productId)!.price;
      expect(store.buy(productId)).toBe(true);
      expect(store.state.currency).toBe(120 - price);
      expect(store.state.opening).toBeNull(); expect(store.state.cards).toHaveLength(0);
      const pack = store.state.packs.at(-1)!;
      expect(parseSave(saved).packs.at(-1)).toEqual(pack);
      expect(store.startOpening(pack.uid)).toBe(true);
      expect(store.state.opening!.cards.every(c => [setCode, 'sve'].includes(CARD_BY_ID.get(c.cardId)!.setCode))).toBe(true);
    });
    it(`persists shortcut ${slot} and uses the natural special composition without rerolling`, () => {
      let saved = '';
      const storage = { read: () => saved || null, write: (d: string) => { saved = d; }, backup: () => {} };
      const store = new GameStore(storage), pack = createTestPack(slot);
      const independent = rollPackEvents(pack.seed, false, pack.setCode);
      expect(pack.productId).toBe(productId); expect(pack.state).toBe('unopened');
      expect(pack.rareEvents!.fullMisprint).toBe(independent.fullMisprint);
      expect(store.addUnopenedPack(pack)).toBe(true); expect(store.addUnopenedPack(pack)).toBe(false);
      const loaded = new GameStore(storage);
      expect(loaded.state.packs.at(-1)).toEqual(pack);
      loaded.startOpening(pack.uid);
      const cards = loaded.state.opening!.cards;
      if (pack.rareEvents!.special!.type === 'english-151-demigod') expect(cards.slice(-3).map(c => c.cardId)).toEqual(SPECIAL_LINES[pack.rareEvents!.special!.line]);
      else {
        expect(cards.slice(1, 4).every(c => CARD_BY_ID.get(c.cardId)!.rarity === 'Mega attack rare')).toBe(true);
        expect(cards.slice(4).every(c => CARD_BY_ID.get(c.cardId)!.rarity === 'Special illustration rare')).toBe(true);
      }
      expect(new Set(cards.map(c => c.cardId)).size).toBe(11);
      expect(parseSave(saved).opening!.cards).toEqual(cards);
      expect(loaded.state.rareEventStats!.generatedPacks).toBe(0);
      expect(RARE_EVENT_ODDS).toEqual({ individual: 1/500, fullPack: 1/2000, special: 1/1500 });
      const naturalEquivalent = { ...pack, debugGenerated: undefined };
      expect(generatePack(naturalEquivalent, undefined, 0).map(c => [c.cardId,c.condition,c.misprint])).toEqual(generatePack(pack, undefined, 0).map(c => [c.cardId,c.condition,c.misprint]));
    });
  }
  it('generates 5,000 real Ascended Heroes packs with no duplicate IDs or mixed sets', () => {
    let specials = 0;
    for (let seed = 0; seed < 5000; seed++) {
      const pack = createPack('ascended-heroes-booster', 0, undefined, seed);
      const cards = generatePack(pack);
      expect(cards).toHaveLength(11);
      expect(new Set(cards.map(c => c.cardId)).size).toBe(11);
      expect(cards.every(c => ['me02.5', 'sve'].includes(CARD_BY_ID.get(c.cardId)!.setCode))).toBe(true);
      if (pack.rareEvents!.special) { specials++; expect(pack.rareEvents!.special.type).toBe('ascended-heroes-god'); }
    }
    expect(specials).toBeGreaterThan(0);
  });
  it('preserves the independent full-misprint event on an Ascended Heroes god pack', () => {
    // Find an ordinary full-misprint seed; only force the separate special decision.
    let seed = 0;
    while (!rollPackEvents(seed, false).fullMisprint) seed++;
    const pack = createPack('ascended-heroes-booster', 0, undefined, seed);
    pack.rareEvents = {...rollPackEvents(seed, false), special:{type:'ascended-heroes-god'}};
    const cards = generatePack(pack);
    expect(cards.every(c => c.misprint?.modifier === 30 && c.misprint.specialType === 'ascended-heroes-god')).toBe(true);
    const store = new GameStore({read:()=>null,write:()=>{},backup:()=>{}});
    store.addUnopenedPack(pack); store.startOpening(pack.uid);
    expect(parseSave(JSON.stringify(store.state)).opening!.cards).toEqual(store.state.opening!.cards);
  });
});
