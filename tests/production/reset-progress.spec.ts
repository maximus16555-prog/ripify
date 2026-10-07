import { test, expect } from '@playwright/test';
import { progressedGame } from '../fixtures/progressed-game';
import { newSave, SAVE_KEY } from '../../src/core/save';

test('settings reset requires confirmation, handles failure, clears progress and stays reset after refresh', async ({ page }, info) => {
  const state = progressedGame(), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ state, key }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(state));
      localStorage.setItem(`${key}.recovery`, 'old recovery progress');
      localStorage.setItem('unrelated-setting', 'keep');
    }
  }, { state, key: SAVE_KEY });
  const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  const ready = async () => { await expect(page.locator('.game-canvas')).toBeVisible(); await expect(page.locator('.loading')).toHaveCount(0); };
  await page.goto('/'); await ready();
  const before = await saved();
  await page.locator('[data-settings]').click(); await page.locator('[data-reset-progress]').click();
  await expect(page.locator('[data-confirm-reset]')).toBeVisible();
  await expect(page.locator('[data-cancel-reset]')).toBeFocused();
  expect(await saved()).toEqual(before);
  await expect(page.locator('.game-panel')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'artifacts/reset-progress-confirmation.png' });
  await page.locator('[data-cancel-reset]').click();
  await expect(page.locator('[data-reset-progress]')).toBeVisible(); expect(await saved()).toEqual(before);
  await page.locator('[data-reset-progress]').click(); await page.keyboard.press('Escape');
  expect(await saved()).toEqual(before);
  await page.locator('[data-settings]').click(); await page.locator('[data-reset-progress]').click();
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreTestStorage: () => void }).restoreTestStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException('Storage full', 'QuotaExceededError'); original.call(this, k, v); };
  }, SAVE_KEY);
  await page.locator('[data-confirm-reset]').click();
  await expect(page.locator('.toast')).toContainText('Reset failed');
  expect(await saved()).toEqual(before); await expect(page.locator('[data-confirm-reset]')).toBeVisible();
  await page.evaluate(() => (window as unknown as { restoreTestStorage: () => void }).restoreTestStorage());
  await page.locator('[data-confirm-reset]').click(); await ready();
  await expect.poll(async () => (await saved()).currency).toBe(120);
  const reset = await saved(), defaults = newSave();
  for (const field of ['cards', 'sealedProducts', 'orders', 'displays', 'opening', 'containerOpening', 'productReceipts', 'stats', 'history', 'rareEventStats'] as const) expect(reset[field]).toEqual(defaults[field]);
  expect(reset.packReceipts ?? []).toEqual([]); expect(reset.legacyArchive).toBeUndefined();
  expect(reset.packs).toHaveLength(1); expect(reset.packs[0]).toMatchObject({ productId: '151-booster', state: 'unopened' });
  expect(reset.settings).toEqual({ ...before.settings, controlsLearned: false });
  expect(await page.evaluate(key => localStorage.getItem(`${key}.recovery`), SAVE_KEY)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('unrelated-setting'))).toBe('keep');
  await expect(page.locator('[data-location]')).toHaveText('Your room');
  await page.reload(); await ready(); expect(await saved()).toEqual(reset);
  await expect(page.locator('[data-cards]')).toHaveText('0'); await expect(page.locator('[data-packs]')).toHaveText('1');
  expect(errors).toEqual([]);
  await info.attach('reset-report', { body: JSON.stringify({ url: page.url(), cancelPreservesSave: true, failurePreservesSave: true, resetPersists: true, preferencesKept: true, recoveryCleared: true, errors }), contentType: 'application/json' });
});
