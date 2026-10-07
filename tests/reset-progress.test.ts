import { describe, expect, it } from 'vitest';
import { GameStore } from '../src/core/store';
import { newSave, parseSave } from '../src/core/save';

import { progressedGame } from './fixtures/progressed-game';

describe('reset progress', () => {
  it('persists a new game, clears every progress system and preserves preferences', () => {
    const before = progressedGame(); let raw = JSON.stringify(before), cleared = 0, notifications = 0;
    const storage = { read: () => raw, write: (data: string) => { raw = data; }, backup: () => {}, clearRecovery: () => { cleared++; } };
    const store = new GameStore(storage); store.subscribe(() => notifications++);
    expect(store.state.opening).not.toBeNull(); expect(store.state.orders).toHaveLength(1);
    expect(store.state.displays[0]).not.toBeNull(); expect(store.state.productReceipts).toHaveLength(1);
    expect(store.resetProgress()).toBe(true);
    const fresh = newSave();
    for (const field of ['cards', 'sealedProducts', 'orders', 'displays', 'opening', 'containerOpening', 'productReceipts', 'stats', 'history', 'rareEventStats'] as const) expect(store.state[field]).toEqual(fresh[field]);
    expect(store.state.packReceipts ?? []).toEqual([]); expect(store.state.legacyArchive).toBeUndefined();
    expect(store.state.currency).toBe(120); expect(store.state.packs).toHaveLength(1);
    expect(store.state.packs[0]).toMatchObject({ productId: '151-booster', state: 'unopened' });
    expect(before.packs.some(p => p.uid === store.state.packs[0].uid)).toBe(false);
    expect(store.state.settings).toEqual({ ...before.settings, controlsLearned: false });
    expect(parseSave(raw)).toEqual(store.state); expect(new GameStore(storage).state).toEqual(store.state);
    expect(cleared).toBe(1); expect(notifications).toBe(1);
  });
  it('leaves live and saved progress untouched when storage rejects the reset', () => {
    const before = progressedGame(), raw = JSON.stringify(before);
    let cleared = false, notifications = 0;
    const store = new GameStore({ read: () => raw, write: () => { throw new Error('Storage full'); }, backup: () => {}, clearRecovery: () => { cleared = true; } });
    const live = store.state, snapshot = structuredClone(live); store.subscribe(() => notifications++);
    expect(store.resetProgress()).toBe(false); expect(store.state).toBe(live); expect(store.state).toEqual(snapshot);
    expect(cleared).toBe(false); expect(notifications).toBe(0); expect(store.warning).toContain('progress is unchanged');
  });
  it('clears an interrupted box opening without granting its contents', () => {
    const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} });
    store.buy('151-etb'); store.startContainer(store.state.sealedProducts[0].uid); store.liftLid();
    expect(store.resetProgress()).toBe(true);
    expect(store.state.containerOpening).toBeNull(); expect(store.state.productReceipts).toEqual([]);
    expect(store.state.cards).toEqual([]); expect(store.state.packs).toHaveLength(1);
  });
});
