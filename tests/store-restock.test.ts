import { describe, it, expect } from 'vitest';
import { GameStore } from '../src/core/store';
import { COMMERCE, ComputerServices, stock, restockDay, nextRestockMinute } from '../src/core/computer';
import { parseSave } from '../src/core/save';

function fixture() {
  let saved = '';
  const storage = { read: () => saved || null, write: (value: string) => { saved = value; }, backup: () => {} };
  const store = new GameStore(storage), services = new ComputerServices(store);
  store.state.currency = 10000;
  store.state.computer!.minute = 570;
  return { store, services, storage, saved: () => parseSave(saved) };
}

describe('scheduled store replenishment', () => {
  it('opens the first day at 9:30 and replenishes every product at that exact boundary on subsequent days', () => {
    const f = fixture(), c = f.store.state.computer!;
    c.minute = 569.99;
    for (const id of Object.keys(COMMERCE.stock)) expect(stock(f.store.state, id)).toBe(0);
    for (let day = 0; day < 8; day++) {
      c.minute = 570 + day * 1440;
      for (const [id, batch] of Object.entries(COMMERCE.stock)) {
        expect(stock(f.store.state, id)).toBe(batch);
        c.drops[`${day}:${id}`] = batch;
        expect(stock(f.store.state, id)).toBe(0);
      }
      c.minute += 1440 - .001;
      for (const id of Object.keys(COMMERCE.stock)) expect(stock(f.store.state, id)).toBe(0);
    }
  });
  it('keeps unsold previous-drop inventory through midnight and records morning purchases in the same ledger', () => {
    const f = fixture(), c = f.store.state.computer!;
    c.minute = 1439.999;
    const before = stock(f.store.state, '151-booster');
    c.minute = 1440;
    expect(stock(f.store.state, '151-booster')).toBe(before);
    c.minute = 1500;
    const available = stock(f.store.state, '151-booster');
    expect(available).toBeGreaterThan(0);
    expect(f.services.checkout({ '151-booster': 2 })).toBeTruthy();
    expect(f.store.state.computer!.drops['0:151-booster']).toBe(2);
    expect(f.store.state.computer!.drops['1:151-booster']).toBeUndefined();
    expect(stock(f.store.state, '151-booster')).toBe(available - 2);
    expect(stock(new GameStore(f.storage).state, '151-booster')).toBe(available - 2);
  });
  it('persists a scheduled drop immediately, including elapsed slow-frame time, without rerestocking on reload', () => {
    const f = fixture();
    f.store.state.computer!.minute = 2009;
    f.store.state.computer!.speed = 120;
    f.store.state.computer!.drops['0:151-booster'] = 64;
    f.store.persist();
    f.services.tick(2);
    expect(f.saved().computer!.minute).toBe(2013);
    expect(stock(f.store.state, '151-booster')).toBe(64);
    expect(f.services.checkout({ '151-booster': 3 })).toBeTruthy();
    const reloaded = new GameStore(f.storage);
    expect(stock(reloaded.state, '151-booster')).toBe(61);
    new ComputerServices(reloaded).tick(.1);
    expect(stock(reloaded.state, '151-booster')).toBe(61);
    expect(reloaded.state.computer!.orders).toHaveLength(1);
    expect(reloaded.state.computer!.orders[0].items).toHaveLength(3);
  });
  it('rejects overselling, remains finite, and preserves deterministic demand and purchasing deductions after reload', () => {
    const f = fixture();
    f.store.state.computer!.minute = 570 + 720;
    for (const id of Object.keys(COMMERCE.stock)) {
      const left = stock(f.store.state, id);
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThan(COMMERCE.stock[id]);
      expect(f.services.checkout({ [id]: left + 1 })).toBeNull();
      expect(f.services.checkout({ [id]: left })).toBeTruthy();
      expect(stock(f.store.state, id)).toBe(0);
      expect(stock(new GameStore(f.storage).state, id)).toBe(0);
    }
  });
  it('keeps larger batches inside the existing per-product and 100-item order/save limits', () => {
    const f = fixture(), before = structuredClone(f.store.state);
    expect(f.services.checkout({ '151-booster': 51 })).toBeNull();
    expect(f.services.checkout({ '151-booster': 50, 'ascended-heroes-booster': 40, '151-etb': 10, '151-upc': 1 })).toBeNull();
    expect(f.store.state).toEqual(before);
    expect(f.services.checkout({ '151-booster': 50, 'ascended-heroes-booster': 40, '151-etb': 10 })).toBeTruthy();
    expect(f.saved().computer!.orders[0].items).toHaveLength(100);
    expect(new GameStore(f.storage).state.computer!.orders[0].items).toHaveLength(100);
  });
  it('uses existing save ledger keys and skips missed cycles without accumulating unlimited stock', () => {
    const f = fixture();
    f.store.state.computer!.drops['0:151-booster'] = 3;
    expect(stock(f.store.state, '151-booster')).toBe(61);
    f.services.tick(20 * 1440 * 60 / f.store.state.computer!.speed);
    expect(restockDay(f.saved().computer!.minute)).toBe(20);
    expect(stock(f.store.state, '151-booster')).toBe(64);
    expect(nextRestockMinute(2009)).toBe(2010);
    expect(nextRestockMinute(2010)).toBe(3450);
    const before = f.store.state.computer!.minute;
    for (const dt of [NaN, Infinity, -1, 0]) f.services.tick(dt);
    expect(f.store.state.computer!.minute).toBe(before);
  });
});
