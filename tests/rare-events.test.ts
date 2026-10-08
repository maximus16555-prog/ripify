import { sellOnEbay } from './fixtures/ebay-sale';
import { receiveReturn } from './fixtures/receive-return';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPack } from '../src/core/inventory';
import { generatePack } from '../src/core/packs';
import { RARE_EVENT_ODDS, rollPackEvents, individualMisprintRoll, SPECIAL_LINES, makeDefect, rareRandom, misprintProvenance, misprintEligible } from '../src/core/rare-events';
import { ownedRawMarketValue, rawValue, ownedValue, calculateGrade, gradeMultiplier, GRADERS } from '../src/core/economy';
import { newSave, parseSave } from '../src/core/save';
import { GameStore } from '../src/core/store';
import { CARD_BY_ID } from '../src/data/cards';
import { createPhysicalCard } from '../src/game/physical-card';
import { printAppearance, printImageStyle, inkDefectMarkup } from '../src/assets/misprint-presentation';
import { physicalCardSignature } from '../src/game/display-cards';
import type { Pack, OwnedCard, PrintDefect } from '../src/core/types';

function pack(seed: number): Pack { return { ...createPack(), uid: `event-${seed}`, seed }; }
const findSeed = (matches: (p: Pack) => boolean) => {
  for (let seed = 1; seed < 200000; seed++) { const p = pack(seed); p.rareEvents = rollPackEvents(seed, true); if (matches(p)) return seed; }
  throw new Error('No deterministic fixture seed found');
};
const individualSeed = findSeed(p => !p.rareEvents!.special && !p.rareEvents!.fullMisprint && Array.from({ length: 11 }, (_, i) => individualMisprintRoll(p.seed, i)).some(Boolean));
const specialIndividualSeed = findSeed(p => !!p.rareEvents!.special && !p.rareEvents!.fullMisprint && Array.from({ length: 11 }, (_, i) => individualMisprintRoll(p.seed, i)).some(Boolean));
const fullSeed = findSeed(p => p.rareEvents!.fullMisprint && !p.rareEvents!.special);
const snapshot = (p: Pack, cards: OwnedCard[]) => { const s = newSave(); s.packs = []; s.opening = { pack: p, cards, stage: 'sealed', index: 0 }; return s; };
const printed = () => generatePack(pack(individualSeed), undefined, 0).find(c => c.misprint)!;
const factories = { face: () => new THREE.Texture(), label: () => new THREE.Texture() };

describe('independent deterministic rare events', () => {
  it('retains exactly the requested odds and does not enable special packs for unsupported sets', () => {
    expect(RARE_EVENT_ODDS).toEqual({ individual: 1 / 500, fullPack: 1 / 2000, special: 1 / 1500 });
    expect(Object.isFrozen(RARE_EVENT_ODDS)).toBe(true);
    const special = rollPackEvents(specialIndividualSeed, true), ordinary = rollPackEvents(specialIndividualSeed, false);
    expect(special.special).not.toBeNull(); expect(ordinary.special).toBeNull();
    expect(ordinary.fullMisprint).toBe(special.fullMisprint);
    expect(rollPackEvents(fullSeed, false).fullMisprint).toBe(true);
  });
  it('preserves ordinary selection and physical condition when rare events do not alter composition', () => {
    const p = pack(individualSeed), modern = generatePack(p, undefined, 0), old = generatePack({ ...p, generationVersion: 1, rareEvents: undefined }, undefined, 0);
    expect(modern.map(c => [c.cardId, c.condition, c.finish])).toEqual(old.map(c => [c.cardId, c.condition, c.finish]));
    expect(modern.some(c => c.misprint)).toBe(true);
    expect(modern.filter(c => !c.misprint).every(c => ownedRawMarketValue(c, 0, 0) === rawValue(CARD_BY_ID.get(c.cardId)!, 0, 0))).toBe(true);
    expect(misprintEligible({ origin: 'promo', finish: 'normal' })).toBe(false);
    expect(misprintEligible({ origin: 'pack', finish: 'normal' })).toBe(true);
  });
  it.each(Object.keys(SPECIAL_LINES) as (keyof typeof SPECIAL_LINES)[])('uses the verified %s line in the last three English slots, without duplicates', line => {
    const p = pack(7); p.rareEvents = { version: 1, special: { type: 'english-151-demigod', line }, fullMisprint: false };
    const cards = generatePack(p, undefined, 0);
    expect(cards.slice(-3).map(c => c.cardId)).toEqual(SPECIAL_LINES[line]);
    expect(cards.slice(-3).every(c => c.finish === 'holo')).toBe(true);
    expect(cards).toHaveLength(11); expect(new Set(cards.map(c => c.cardId)).size).toBe(11);
    expect(cards.slice(1, 5).every(c => CARD_BY_ID.get(c.cardId)!.rarity === 'Common')).toBe(true);
    expect(cards.slice(5, 8).every(c => CARD_BY_ID.get(c.cardId)!.rarity === 'Uncommon')).toBe(true);
  });
  it('allows individually rolled misprints in a special pack at the normal odds', () => {
    const p = pack(specialIndividualSeed), cards = generatePack(p, undefined, 0);
    expect(p.rareEvents!.special).not.toBeNull(); expect(p.rareEvents!.fullMisprint).toBe(false);
    expect(cards.map((c, i) => !!c.misprint)).toEqual(cards.map((_, i) => individualMisprintRoll(p.seed, i)));
    expect(cards.filter(c => c.misprint).every(c => misprintProvenance(c) === 'Special Pack + Individual Misprint Pull')).toBe(true);
  });
  it('allows multiple individual misprints without declaring the entire pack misprinted', () => {
    const seed = findSeed(p => !p.rareEvents!.special && !p.rareEvents!.fullMisprint && Array.from({ length: 11 }, (_, slot) => individualMisprintRoll(p.seed, slot)).filter(Boolean).length >= 2);
    const p = pack(seed), cards = generatePack(p, undefined, 0);
    expect(p.rareEvents!.fullMisprint).toBe(false);
    expect(cards.filter(c => c.misprint).length).toBeGreaterThanOrEqual(2);
    expect(cards.filter(c => c.misprint).every(c => c.misprint!.origin === 'individual')).toBe(true);
    expect(cards.some(c => !c.misprint)).toBe(true);
  });
  it('shares one production error across a full pack with natural variation and one modifier', () => {
    const p = pack(fullSeed), cards = generatePack(p, undefined, 0);
    expect(p.rareEvents!.fullMisprint).toBe(true);
    expect(cards.every(c => c.misprint?.origin === 'full-pack' && c.misprint.modifier === 30 && c.misprint.productionId === `${p.uid}.sheet`)).toBe(true);
    expect(new Set(cards.map(c => c.misprint!.defect.type)).size).toBe(1);
    expect(new Set(cards.map(c => c.misprint!.defect.offsetX)).size).toBeGreaterThan(1);
    for (const c of cards) expect(c.misprint!.defect.offsetX / p.rareEvents!.production!.offsetX).toBeGreaterThanOrEqual(.96);
    expect(parseSave(JSON.stringify(snapshot(p, cards))).opening!.cards).toEqual(cards);
  });
  it.each([9002669, 9072854, 10432003, 10679690, 11034924])('naturally generates and persists special + full misprint at seed %s', seed => {
    const p = pack(seed), cards = generatePack(p, undefined, 0);
    expect(p.rareEvents).toMatchObject({ fullMisprint: true, special: { type: 'english-151-demigod' } });
    const special = p.rareEvents!.special!;
    if (special.type !== 'english-151-demigod') throw new Error('Expected 151 fixture');
    expect(cards.slice(-3).map(c => c.cardId)).toEqual(SPECIAL_LINES[special.line]);
    expect(cards.every(c => misprintProvenance(c) === 'Special Pack + Full Misprint Pack')).toBe(true);
    const reloaded = parseSave(JSON.stringify(snapshot(p, cards))).opening!;
    expect(reloaded.pack).toEqual(p); expect(reloaded.cards).toEqual(cards);
    expect(new Set(cards.map(c => c.cardId)).size).toBe(11);
  });
});

describe('single raw modifier, grading and persistence', () => {
  it('applies 30x once to the authoritative raw base, never to an existing graded valuation', () => {
    const c = printed(), definition = CARD_BY_ID.get(c.cardId)!, before = structuredClone(c);
    const base = rawValue({ ...definition, value: c.baseRawValue! }, 0, 0);
    expect(ownedRawMarketValue(c, 0, 0)).toBe(Math.round(base * 30 * 100) / 100);
    for (const grade of [1, 7, 9, 9.5, 10]) for (const grader of Object.keys(GRADERS) as (keyof typeof GRADERS)[]) {
      const slab = { ...c, status: 'graded' as const, grade, grader };
      const expected = Math.round(base * 30 * gradeMultiplier(grade) * GRADERS[grader].premium * 100) / 100;
      expect(ownedValue(slab, 0, 0)).toBe(expected);
      expect(ownedValue(JSON.parse(JSON.stringify(slab)), 0, 0)).toBe(expected);
    }
    calculateGrade(c, 'BGS', () => .5); expect(c).toEqual(before);
    const pristine = { ...c, condition: { centering: 100, corners: 100, edges: 100, surface: 100, print: 100 } };
    expect(calculateGrade(pristine, 'BGS', () => .5).grade).toBeLessThan(calculateGrade({ ...pristine, misprint: undefined }, 'BGS', () => .5).grade);
    // Older pull-time snapshots cannot fork the current exact-printing price.
    expect(ownedRawMarketValue({ ...c, baseRawValue: 2 }, 0, 0)).toBe(ownedRawMarketValue(c, 0, 0));
  });
  it('rolls once, records provenance forever and keeps the exact card through grading/display/sale', () => {
    let saved: string | null = null; const storage = { read: () => saved, write: (s: string) => { saved = s; }, backup: () => {} };
    const store = new GameStore(storage); store.state.packs[0].seed = 9072854; const uid = store.state.packs[0].uid;
    expect(store.startOpening(uid)).toBe(true); expect(store.startOpening(uid)).toBe(false);
    const cards = structuredClone(store.state.opening!.cards), stats = structuredClone(store.state.rareEventStats);
    const reloaded = new GameStore(storage); expect(reloaded.state.opening!.cards).toEqual(cards); expect(reloaded.state.rareEventStats).toEqual(stats);
    reloaded.rip(); for (let i = 0; i < 11; i++) reloaded.swipe(); reloaded.collect();
    expect(reloaded.collect()).toBe(false); expect(reloaded.state.cards).toHaveLength(11); expect(reloaded.state.packReceipts).toHaveLength(1);
    const c = reloaded.state.cards[0], defect = structuredClone(c.misprint), condition = structuredClone(c.condition);
    expect(reloaded.submit(c.uid, 'BGS', 'Standard')).toBe(true);
    const order = reloaded.state.orders[0]; expect(receiveReturn(reloaded, order.uid, order.dueAt)!.uid).toBe(c.uid);
    expect(c.misprint).toEqual(defect); expect(c.condition).toEqual(condition);
    reloaded.display(c.uid, 0); const again = new GameStore(storage); expect(again.state.displays[0]).toBe(c.uid);
    expect(again.state.cards[0].misprint).toEqual(defect); again.clearDisplay(0); sellOnEbay(again, c.uid);
    expect(new GameStore(storage).state.packReceipts![0].cards[0].misprint).toEqual(defect);
    expect(again.state.rareEventStats).toEqual(stats);
  });
  it('upgrades unopened old packs but never rerolls an active legacy opening', () => {
    const s = newSave(), p = s.packs.pop()!; p.generationVersion = 1; p.seed = 9072854;
    s.opening = { pack: p, cards: generatePack(p, undefined, 0), index: 3, stage: 'cards' };
    let raw = JSON.stringify(s); const storage = { read: () => raw, write: (v: string) => { raw = v; }, backup: () => {} };
    const store = new GameStore(storage); expect(store.state.opening).toEqual(s.opening); expect(store.state.opening!.cards.every(c => !c.misprint)).toBe(true);
    s.opening = null; s.packs = [p]; raw = JSON.stringify(s);
    const unopened = new GameStore(storage); unopened.startOpening(p.uid);
    expect(unopened.state.opening!.pack.generationVersion).toBe(2); expect(unopened.state.opening!.cards.every(c => c.misprint)).toBe(true);
  });
  it('rejects compounded modifiers, corrupt defects, incorrect event composition and duplicate modern printings', () => {
    const p = pack(9072854), s = snapshot(p, generatePack(p, undefined, 0));
    const bad = (edit: (v: any) => void) => { const v = structuredClone(s); edit(v); expect(() => parseSave(JSON.stringify(v))).toThrow(); };
    bad(v => v.opening.cards[0].misprint.modifier = 900);
    bad(v => v.opening.cards[0].misprint.defect.offsetX = 7);
    bad(v => v.opening.cards[0].misprint.packUid = 'another-pack');
    bad(v => v.opening.cards[0].misprint.productionId = 'another-sheet');
    bad(v => v.opening.cards[0].misprint.defect.offsetY *= .8);
    bad(v => v.opening.cards[0].misprint = undefined);
    bad(v => v.opening.cards[10].cardId = 'sv03.5-199');
    bad(v => v.opening.cards[2].cardId = v.opening.cards[1].cardId);
    bad(v => v.opening.pack.generationVersion = '2');
  });
});

describe('one persistent physical manufacturing error in raw cards and slabs', () => {
  it('keeps front-only ink and back-only registration on their stored side', () => {
    const c = printed(); c.misprint!.defect.type = 'ink-defect'; c.misprint!.defect.side = 'front';
    expect(printAppearance(c).type).toBe('ink-defect'); expect(printAppearance(c, true).type).toBeUndefined();
    c.misprint!.defect.type = 'registration'; c.misprint!.defect.side = 'back';
    expect(printAppearance(c).type).toBeUndefined(); expect(printAppearance(c, true).type).toBe('registration');
    expect(inkDefectMarkup(c, CARD_BY_ID.get(c.cardId)!.image)).toBe('');
  });
  it.each(['off-center', 'miscut', 'registration', 'ink-defect'] as PrintDefect['type'][])('renders the same %s parameters before/after grading and flipping', type => {
    const c = printed(); c.misprint!.defect = { ...makeDefect(rareRandom(17, 8)), type, side: 'both' };
    const original = JSON.stringify(c), slab = { ...c, status: 'graded' as const, grader: 'BGS' as const, grade: 7 };
    const rawModel = createPhysicalCard(c, factories), slabModel = createPhysicalCard(slab, factories);
    expect(rawModel.group.userData.misprint).toEqual(slabModel.group.userData.misprint);
    for (const name of ['cardstock', 'card-front', 'card-back']) {
      const get = (g: THREE.Group) => (g.getObjectByName(name) as THREE.Mesh).geometry.getAttribute('position').array;
      expect(get(rawModel.group)).toEqual(get(slabModel.group));
    }
    expect(printAppearance(c)).toEqual(printAppearance(JSON.parse(JSON.stringify(slab))));
    expect(printAppearance(c, true).x).toBeCloseTo(-printAppearance(c).x, 8);
    expect(printImageStyle(c)).toBe(printImageStyle(slab)); expect(inkDefectMarkup(c)).toBe(inkDefectMarkup(slab));
    expect(physicalCardSignature(c)).not.toBe(physicalCardSignature({ ...c, misprint: undefined }));
    expect(JSON.stringify(c)).toBe(original); rawModel.dispose(); slabModel.dispose();
  });
});
