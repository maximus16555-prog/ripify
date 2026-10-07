import { test, expect, type Page } from '@playwright/test';
import { newSave, SAVE_KEY } from '../../src/core/save';
import { GameStore } from '../../src/core/store';
import { createCard, seeded } from '../../src/core/inventory';
import type { Save } from '../../src/core/types';

const saved = (page: Page): Promise<Save> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
async function ready(page: Page) { await expect(page.locator('.game-canvas')).toBeVisible(); await expect(page.locator('.loading')).toHaveCount(0); }
async function binder(page: Page) {
  await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack', { timeout: 15000 }); await page.waitForTimeout(700); } finally { await page.keyboard.up('w'); }
  await page.keyboard.down('d');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Binder', { timeout: 15000 }); } finally { await page.keyboard.up('d'); }
  await page.keyboard.press('e');
}
function initial() {
  const store = new GameStore({ read: () => JSON.stringify(newSave()), write: () => {}, backup: () => {} });
  store.state.cards = [createCard('svp-051', 'fixture-upc', seeded(156), 'holo', 'promo')];
  store.state.currency = 1000; store.submit(store.state.cards[0].uid, 'PSA', 'Standard');
  const order = store.state.orders[0]; store.receive(order.uid, order.dueAt); store.display(store.state.cards[0].uid, 0);
  return store.state;
}
async function fixSeed(page: Page, seed: number) {
  await page.evaluate(seed => {
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = ((array: Uint32Array) => {
      if (array instanceof Uint32Array && array.length === 1) { array[0] = seed; crypto.getRandomValues = original; return array; }
      return original(array);
    }) as typeof crypto.getRandomValues;
  }, seed);
}
for (const [name, seed] of [['safe', 0], ['damaged', 1000]] as const) test(`physical ${name} crack preserves the same card and survives reloading`, async ({ page }, info) => {
  const state = initial(), before = structuredClone(state.cards[0]), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state, key: SAVE_KEY });
  await page.goto('/'); await ready(page); await binder(page);
  await page.locator(`[data-inspect="${before.uid}"]`).click();
  await expect(page.locator('.physical-card-canvas')).toHaveAttribute('data-kind', 'slab');
  await page.locator('[data-crack-slab]').click(); await expect(page.locator('[data-cancel-crack]')).toBeFocused();
  await page.locator('[data-cancel-crack]').click(); expect((await saved(page)).cards[0]).toEqual(before);
  await page.locator('[data-crack-slab]').click(); await fixSeed(page, seed); await page.locator('[data-confirm-crack]').click();
  const committed = await saved(page); expect(committed.cards).toHaveLength(1); expect(committed.cards[0].uid).toBe(before.uid);
  expect(committed.cards[0].status).toBe('raw'); expect(committed.cards[0].crackHistory![0].outcome).toBe(name);
  expect(committed.displays).toEqual([null, null, null]);
  await expect(page.locator('.physical-card-canvas')).toHaveAttribute('data-cracking', 'true');
  await page.waitForTimeout(850); await page.screenshot({ path: `artifacts/slab-crack-${name}-opening.png` });
  await expect(page.locator('.physical-card-canvas')).toHaveAttribute('data-kind', 'raw', { timeout: 15000 });
  await expect(page.locator('.physical-card-canvas')).toHaveAttribute('data-front-image', 'ready');
  await expect(page.locator('.toast')).toContainText(name === 'safe' ? 'Slab removed safely' : 'Card damaged');
  await expect(page.locator('[data-crack-slab]')).toHaveCount(0);
  const after = (await saved(page)).cards[0];
  expect(after.gradingHistory).toEqual(before.gradingHistory); expect(after.crackHistory).toHaveLength(1);
  if (name === 'safe') expect(after.condition).toEqual(before.condition); else expect(after.condition.corners).toBeLessThan(before.condition.corners);
  await page.screenshot({ path: `artifacts/slab-crack-${name}-result.png` });
  await page.locator('[data-flip]').click(); await expect(page.locator('.physical-card-canvas')).toHaveAttribute('data-side', 'back');
  await page.reload(); await ready(page); expect((await saved(page)).cards[0]).toEqual(after);
  await binder(page); await page.locator(`[data-inspect="${before.uid}"]`).click();
  await expect(page.locator('[data-grade]')).toBeVisible(); await page.locator('[data-grade]').click();
  await page.locator('[data-submit]').click(); expect((await saved(page)).cards[0].status).toBe('grading');
  expect((await saved(page)).cards[0].crackHistory).toEqual(after.crackHistory); expect(errors).toEqual([]);
  await info.attach('slab-crack-report', { body: JSON.stringify({ url: page.url(), outcome: name, persistedBeforeAnimation: true, uid: before.uid, conditionBefore: before.condition, conditionAfter: after.condition, regrading: true, errors }), contentType: 'application/json' });
});

for (const interruption of ['reload', 'close'] as const) test(`${interruption} during slab animation cannot undo or reroll a failed crack`, async ({ page }) => {
  const state = initial(); await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state, key: SAVE_KEY });
  await page.goto('/'); await ready(page); await binder(page); await page.locator('[data-inspect]').click();
  await page.locator('[data-crack-slab]').click(); await fixSeed(page, 1000); await page.locator('[data-confirm-crack]').click();
  const committed = (await saved(page)).cards[0];
  if (interruption === 'close') { await page.keyboard.press('Escape'); expect((await saved(page)).cards[0]).toEqual(committed); }
  await page.reload(); await ready(page);
  expect((await saved(page)).cards[0]).toEqual(committed); expect(committed.crackHistory![0].outcome).toBe('damaged');
  await binder(page); await page.locator('[data-inspect]').click(); await expect(page.locator('[data-crack-slab]')).toHaveCount(0);
});
