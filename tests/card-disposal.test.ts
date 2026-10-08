import { describe, it, expect } from 'vitest';
import { GameStore } from '../src/core/store';
import { createCard, seeded } from '../src/core/inventory';
import { parseSave } from '../src/core/save';
import { excessCopies, filterCleanupCards } from '../src/core/card-disposal';
import { ComputerServices, portfolioValue } from '../src/core/computer';
import { makeDefect } from '../src/core/rare-events';
import { gradedPopulation } from '../src/core/population';

function fixture() {
  let saved = '', fail = false;
  const storage = { read: () => saved || null, write: (s: string) => { if (fail) throw Error('full'); saved = s; }, backup: () => {} };
  const store = new GameStore(storage); new ComputerServices(store);
  store.state.cards = Array.from({ length: 65 }, (_, i) => ({ ...createCard(i % 2 ? 'sv03.5-001' : 'sv03.5-005', 'disposal-test', seeded(i), 'normal', 'pack'), uid: `bulk-${i}` }));
  store.persist();
  return { store, storage, fail: () => { fail = true; }, saved: () => saved };
}
describe('owned card disposal', () => {
  it('deletes one or 50+ copies atomically, pays nothing, clears display and updates portfolio', () => {
    const f = fixture(), before = f.store.state.currency, copies = structuredClone(f.store.state.cards);
    f.store.state.displays[0] = copies[0].uid;
    expect(f.store.deleteCards([copies[0].uid])).toBe(true);
    expect(f.store.state.displays[0]).toBeNull();
    expect(f.store.deleteCards(copies.slice(1, 56).map(c => c.uid))).toBe(true);
    expect(f.store.state.cards).toHaveLength(9); expect(f.store.state.currency).toBe(before);
    expect(f.store.state.stats.sold).toBe(0);
    const loaded = new GameStore(f.storage);
    expect(loaded.state.cards).toEqual(f.store.state.cards); expect(loaded.state.cardDisposals?.flatMap(r => r.cards)).toHaveLength(56);
    expect(loaded.state.computer!.portfolio.at(-1)!.value).toBe(portfolioValue(loaded.state));
    expect(f.store.deleteCards([copies[0].uid])).toBe(false);
  });
  it('rejects protected or stale mixed selections completely and handles storage failure', () => {
    const f = fixture(), c = f.store.state.cards[0];
    for (const patch of [{ favorite: true }, { status: 'graded', grader: 'PSA', grade: 10 }, { status: 'grading' }, { ownershipLock: { kind: 'trade', uid: 'trade-one' } }, { ownershipLock: { kind: 'transfer', uid: 'transfer-one' } }, { misprint: { version: 1, modifier: 30, origin: 'individual', packUid: c.source, defect: makeDefect(seeded(4)) } }]) {
      const original = structuredClone(c); Object.assign(c, patch);
      expect(f.store.deleteCards([c.uid, f.store.state.cards[1].uid], true)).toBe(false);
      expect(f.store.state.cards).toHaveLength(65); Object.keys(c).forEach(k => { delete (c as any)[k]; }); Object.assign(c, original);
    }
    const services = new ComputerServices(f.store); expect(services.list('card', c.uid, 1)).toBe(true);
    expect(f.store.deleteCards([c.uid], true)).toBe(false);
    const saved = f.saved(), state = structuredClone(f.store.state); f.fail();
    expect(f.store.deleteCards([f.store.state.cards[1].uid])).toBe(false);
    expect(f.store.state).toEqual(state); expect(f.saved()).toBe(saved);
    expect(f.store.deleteCards(['not-owned', f.store.state.cards[1].uid])).toBe(false);
  });
  it('selects excess exact printings, protects special copies and keeps one even across filters', () => {
    const f = fixture(), s = f.store.state;
    s.cards[1].favorite = true;
    const eligible = (c: typeof s.cards[number]) => !f.store.deletionProtection(c.uid);
    const ids = excessCopies(s, eligible);
    expect(ids.size).toBe(63); expect(ids.has(s.cards[1].uid)).toBe(false);
    expect(f.store.deleteCards([...ids])).toBe(true);
    expect(new Set(f.store.state.cards.map(c => c.cardId)).size).toBe(2); expect(f.store.state.cards).toHaveLength(2);
    // Different Charmander printings are never duplicates merely by name.
    s.cards = ['sv03.5-004', 'sv03.5-168'].map((id, i) => createCard(id, 'same-name', seeded(i), 'normal', 'pack'));
    expect(excessCopies(s, () => true).size).toBe(0);
  });
  it('combines Common+Uncommon, raw/set/value/duplicate filters without deleting anything', () => {
    const f = fixture(), before = structuredClone(f.store.state);
    expect(filterCleanupCards(f.store.state, { query: '', rarities: ['Common', 'Uncommon'], raw: true, set: 'sv03.5', maximum: '2', duplicates: true })).toHaveLength(65);
    expect(filterCleanupCards(f.store.state, { query: '', rarities: ['Rare'], raw: true, set: '', maximum: '', duplicates: false })).toHaveLength(0);
    expect(f.store.state).toEqual(before);
  });
  it('requires explicit high-value confirmation, preserves historical grades and cannot resurrect disposal on load', () => {
    const f = fixture(), c = createCard('me02.5-276', 'valuable-test', seeded(0), 'normal', 'pack');
    c.gradingHistory = [{ grader: 'PSA', grade: 10, at: 1, orderUid: 'previous-grade' }];
    f.store.state.cards.push(c);
    expect(f.store.deleteCards([c.uid])).toBe(false);
    expect(f.store.deleteCards([c.uid, c.uid], true)).toBe(true);
    expect(gradedPopulation(f.store.state, c.cardId, 'PSA', 10)).toEqual({ current: 0, allTime: 1 });
    expect(gradedPopulation(new GameStore(f.storage).state, c.cardId, 'PSA', 10)).toEqual({ current: 0, allTime: 1 });
    const save = JSON.parse(f.saved()); save.cards.push(c);
    expect(() => parseSave(JSON.stringify(save))).toThrow('Disposed card still in inventory');
    expect(f.store.state.cardDisposals![0].cards).toHaveLength(1);
    expect(f.store.state.cardDisposals![0].cards[0].gradingHistory).toEqual(c.gradingHistory);
  });
});
