import { test, expect, type Page } from '@playwright/test';
import { GameStore } from '../../src/core/store';
import { ComputerServices } from '../../src/core/computer';
import { createCard, seeded } from '../../src/core/inventory';
import { SAVE_KEY } from '../../src/core/save';
import type { Save } from '../../src/core/types';
import { receiveReturn } from '../fixtures/receive-return';

const saved = (page: Page): Promise<Save> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
async function approach(page: Page, direction: 'a' | 'd', label: string) {
  await expect(page.locator('.game-canvas')).toBeVisible();
  await expect(page.locator('.loading')).toHaveCount(0);
  await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack'); await page.waitForTimeout(650); }
  finally { await page.keyboard.up('w'); }
  await page.keyboard.down(direction);
  try { await expect(page.locator('.interaction-prompt')).toContainText(label); }
  finally { await page.keyboard.up(direction); }
  await page.keyboard.press('e');
}

test('binder preserves inspection and saved grades; only computer app submits cards', async ({ page }, info) => {
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} });
  new ComputerServices(store);
  store.state.currency = 1000;
  store.state.settings.controlsLearned = true;
  const raw = createCard('sv03.5-001', 'grading-access-fixture', seeded(11), 'normal', 'pack');
  const slab = createCard('sv03.5-026', 'grading-access-fixture', seeded(12), 'holo', 'pack');
  const pending = createCard('sv03.5-010', 'grading-access-fixture', seeded(13), 'normal', 'pack');
  store.state.cards = [raw, slab, pending];
  expect(store.submit(slab.uid, 'BGS', 'Standard')).toBe(true);
  const returnOrder = store.state.orders[0];
  receiveReturn(store, returnOrder.uid, returnOrder.dueAt);
  expect(store.submit(pending.uid, 'PSA', 'Standard')).toBe(true);
  store.state.orders[0].dueAt = Date.now() + 3600000;
  const before = structuredClone(store.state), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state: before, key: SAVE_KEY });
  await page.goto('/');
  await approach(page, 'd', 'Open Binder');
  for (const card of [raw, slab, pending]) {
    await page.locator(`[data-inspect="${card.uid}"]`).click();
    await expect(page.locator('[data-grade], [data-submit], [data-grader], [data-service]')).toHaveCount(0);
    await expect(page.locator('.inspection-card canvas')).toBeVisible();
    await expect(page.locator('.printed-data').first()).toContainText('Printed card data');
    if (card.uid === slab.uid) {
      await expect(page.locator('.grade-summary')).toContainText('BGS');
      await expect(page.locator('.card-history')).toContainText('BGS grade');
    } else {
      await expect(page.locator('.condition-report')).toBeVisible();
      if (card.uid === pending.uid) await expect(page.locator('.short-status')).toHaveText('In Progress');
    }
    await page.keyboard.press('g');
    await expect(page.locator('[data-submit], [data-grade]')).toHaveCount(0);
    if (card.uid === raw.uid) await page.screenshot({ path: 'artifacts/computer-only-grading-binder.png' });
    await page.locator('[data-back]').click();
  }
  expect((await saved(page)).cards).toEqual(before.cards);
  expect((await saved(page)).orders).toEqual(before.orders);
  await page.keyboard.press('Escape');
  await page.reload();
  await approach(page, 'a', 'Use Computer');
  await page.locator('[data-app="grading"]').click();
  await page.locator(`[data-action="item"][data-value="${raw.uid}"]`).click();
  await expect(page.locator('.pc-review')).toContainText('Review submission');
  await page.locator('[data-action="submit"]').click();
  await expect(page.locator('.pc-order')).toHaveCount(2);
  const submitted = await saved(page);
  expect(submitted.orders.find(order => order.cardUid === pending.uid)).toEqual(before.orders[0]);
  expect(submitted.cards.find(card => card.uid === slab.uid)).toEqual(before.cards.find(card => card.uid === slab.uid));
  expect(submitted.cards.find(card => card.uid === raw.uid)!.status).toBe('grading');
  expect(submitted.cards.find(card => card.uid === raw.uid)!.condition).toEqual(raw.condition);
  expect(submitted.cards).toHaveLength(3);
  expect(submitted.currency).toBeLessThan(before.currency);
  await page.screenshot({ path: 'artifacts/computer-only-grading-submitted.png' });
  await page.reload();
  await expect(page.locator('.loading')).toHaveCount(0);
  expect((await saved(page)).orders).toEqual(submitted.orders);
  expect((await saved(page)).cards).toEqual(submitted.cards);
  expect(errors).toEqual([]);
  await info.attach('computer-only-grading', { body: JSON.stringify({ url: page.url(), cardsPreserved: 3, existingSubmissionPreserved: true, computerSubmissionCreated: true, reloadPreserved: true, errors }), contentType: 'application/json' });
});
