import { describe, expect, it, vi } from 'vitest';
import { CARDS, CARD_BY_ID } from '../src/data/cards';
import snapshot from '../src/data/verified/151.json' with { type: 'json' };
import { validate151 } from '../src/data/validate-151';
import { selectUniqueCard } from '../src/core/pack-pools';
import { generatePack } from '../src/core/packs';
import { createPack, seeded } from '../src/core/inventory';
import { GameStore } from '../src/core/store';
import { PACK_BALANCE } from '../src/data/balance';

describe('complete verified English 151', () => {
  it('contains exactly 001-207 and maps all source metadata to the exact printing', () => {
    const set = CARDS.filter(c => c.setCode === 'sv03.5');
    expect(set).toHaveLength(207);
    expect(set.map(c => c.id)).toEqual(Array.from({ length: 207 }, (_, i) => `sv03.5-${String(i + 1).padStart(3, '0')}`));
    for (const source of snapshot.cards.filter(c => c.set.id === 'sv03.5')) {
      const printed = source as unknown as Record<string, unknown>;
      const definition = CARD_BY_ID.get(source.id)!;
      expect(definition.name).toBe(source.name);
      expect(definition.number).toBe(`${source.localId}/165`);
      expect(definition.rarity).toBe(source.rarity);
      expect(definition.image).toBe(source.image);
      expect(definition.imageSmall).toBe(source.imageSmall);
      for (const [runtime, field] of Object.entries({ hp: 'hp', types: 'types', category: 'category', attacks: 'attacks', abilities: 'abilities', weaknesses: 'weaknesses', resistances: 'resistances', retreat: 'retreat', artist: 'illustrator', stage: 'stage', suffix: 'suffix', evolvesFrom: 'evolveFrom', effect: 'effect', description: 'description', regulationMark: 'regulationMark', variants: 'variants' })) {
        expect(definition[runtime as keyof typeof definition], `${source.id}: ${field}`).toEqual(printed[field]);
      }
    }
  });

  it('gives every printing a nonzero eligible generation path', () => {
    const result = validate151();
    expect(result.uniqueDefinitions).toBe(207);
    for (const [key, value] of Object.entries(result)) if (Array.isArray(value) && key !== 'pullPaths') expect(value, key).toEqual([]);
    expect(result.pullPaths.every(card => card.slots.length > 0)).toBe(true);
    expect(result.pullPaths.find(c => c.id === 'sv03.5-207')!.slots).toEqual(['final-Hyper rare']);
  });

  it('identifies broken image/number mappings, missing metadata and unmapped rarities', () => {
    const definitions = CARDS.map(c => c.id === 'sv03.5-001' ? { ...c, image: CARD_BY_ID.get('sv03.5-004')!.image, number: '004/165', hp: undefined, rarity: 'Unmapped' } : c);
    const report = validate151(definitions);
    expect(report.invalidMappings).toContain('sv03.5-001');
    expect(report.unobtainable).toContain('sv03.5-001');
    expect(report.missingImportantMetadata).toContainEqual({ id: 'sv03.5-001', fields: ['hp'] });
    const missing = validate151(CARDS.filter(c => c.id !== 'sv03.5-199'));
    expect(missing.missingDefinitions).toEqual(['sv03.5-199']);
  });

  it('detects zero-probability rarities rather than treating database presence as pullability', () => {
    const rules = PACK_BALANCE['sv03.5'].reverseUpgrade, original = rules.specialIllustration;
    try {
      rules.specialIllustration = 0;
      expect(validate151().unobtainable).toHaveLength(7);
    } finally { rules.specialIllustration = original; }
  });
});

describe('selection without replacement', () => {
  it('excludes exact IDs, permits distinct printings of the same Pokemon, and fails exhausted slots explicitly', () => {
    const sameName = [CARD_BY_ID.get('sv03.5-001')!, CARD_BY_ID.get('sv03.5-166')!];
    expect(sameName[0].name).toBe(sameName[1].name);
    const used = new Set<string>(), random = vi.fn(() => 0);
    expect(selectUniqueCard(sameName, used, random).id).toBe('sv03.5-001');
    expect(selectUniqueCard(sameName, used, random).id).toBe('sv03.5-166');
    expect(() => selectUniqueCard(sameName, used, random)).toThrow('No unique candidates');
    expect(random).toHaveBeenCalledTimes(2); // No retry or extra condition/random draws.
  });

  it('never repeats an exact ID across 10,000 packs, but allows copies in later packs', () => {
    const base = createPack(), random = seeded(151), seen = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      const cards = generatePack({ ...base, seed: Math.floor(random() * 4294967296) });
      expect(new Set(cards.map(c => c.cardId)).size).toBe(11);
      expect(new Set(cards.map(c => c.uid)).size).toBe(11);
      for (const card of cards) if (CARD_BY_ID.get(card.cardId)!.setCode === 'sv03.5') seen.add(card.cardId);
    }
    expect(seen.size).toBe(207);
    const a = generatePack({ ...base, uid: 'a', seed: 7 }), b = generatePack({ ...base, uid: 'b', seed: 7 });
    expect(a.map(c => c.cardId)).toEqual(b.map(c => c.cardId));
    expect(new Set([...a, ...b].map(c => c.uid)).size).toBe(22);
    expect(a.every(c => c.source === 'a') && b.every(c => c.source === 'b')).toBe(true);
  }, 15000);

  it('keeps generated packs unchanged on reload, including legacy duplicate printings', () => {
    let raw: string | null = null;
    const storage = { read: () => raw, write: (data: string) => { raw = data; }, backup: () => {} };
    const store = new GameStore(storage);
    store.state.packs[0].seed = 151;
    store.startOpening(store.state.packs[0].uid); store.rip(); store.swipe();
    expect(new GameStore(storage).state.opening).toEqual(store.state.opening);
    // Preserve previously generated legacy copies rather than delete or reroll them.
    store.state.opening!.pack.generationVersion = 1;
    delete store.state.opening!.pack.rareEvents;
    store.state.opening!.cards[2].cardId = store.state.opening!.cards[1].cardId;
    store.persist();
    expect(new GameStore(storage).state.opening).toEqual(store.state.opening);
  });
});
