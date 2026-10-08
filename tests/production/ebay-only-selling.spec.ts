import { test, expect, type Page } from '@playwright/test';
import { GameStore } from '../../src/core/store';
import { ComputerServices } from '../../src/core/computer';
import { createCard, seeded } from '../../src/core/inventory';
import { SAVE_KEY } from '../../src/core/save';
import type { Save } from '../../src/core/types';
import { sellOnEbay } from '../fixtures/ebay-sale';
import { receiveReturn } from '../fixtures/receive-return';

const saved = (page: Page): Promise<Save> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
async function approach(page: Page, direction: 'a' | 'd', label: string) {
  await expect(page.locator('.game-canvas')).toBeVisible(); await expect(page.locator('.loading')).toHaveCount(0);
  await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack'); await page.waitForTimeout(650); }
  finally { await page.keyboard.up('w'); }
  await page.keyboard.down(direction);
  try { await expect(page.locator('.interaction-prompt')).toContainText(label); }
  finally { await page.keyboard.up(direction); }
  await page.keyboard.press('e');
}

test('eBay is the only sale path; existing listings, ownership and single/bulk deletion survive', async ({ page }, info) => {
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} });
  const services = new ComputerServices(store);
  store.state.currency = 1000; store.state.settings.controlsLearned = true;
  const make = (id: string, n: number) => createCard(id, 'ebay-access-fixture', seeded(n), 'normal', 'pack');
  const raw = make('sv03.5-026', 1), slab = make('sv03.5-094', 2), offered = make('sv03.5-006', 3);
  const pending = make('sv03.5-025', 4), disposable = make('sv03.5-010', 5), sold = make('sv03.5-001', 6);
  const bulk = Array.from({ length: 55 }, (_, i) => make('sv03.5-013', 100 + i));
  store.state.cards = [raw, slab, offered, pending, disposable, sold, ...bulk];
  expect(store.submit(slab.uid, 'BGS', 'Standard')).toBe(true);
  const grading = store.state.orders[0]; receiveReturn(store, grading.uid, grading.dueAt);
  expect(sellOnEbay(store, sold.uid)).toBe(true);
  expect(services.list('card', offered.uid, 10)).toBe(true);
  const offer = store.state.computer!.listings.at(-1)!;
  offer.outcome = 'offer'; offer.status = 'OFFER'; offer.started -= 61; offer.due += 10000;
  expect(services.list('card', pending.uid, 100)).toBe(true);
  const existing = store.state.computer!.listings.at(-1)!; existing.started -= 30; existing.due += 10000;
  const before = structuredClone(store.state), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state: before, key: SAVE_KEY });
  await page.goto('/'); await approach(page, 'd', 'Open Binder');
  for (const card of [raw, slab]) {
    await page.locator('[data-search]').fill(card.uid === raw.uid ? 'Raichu' : 'Gengar');
    await page.locator(`[data-inspect="${card.uid}"]`).click();
    await expect(page.getByRole('button', { name: /sell/i })).toHaveCount(0);
    await expect(page.locator('[data-sell], [data-quick-sell], [data-bulk-sell]')).toHaveCount(0);
    await expect(page.locator('[data-delete-card]')).toBeVisible();
    await expect(page.locator('.inspection-card canvas')).toBeVisible();
    await page.locator('[data-back]').click();
  }
  expect((await saved(page)).cards).toEqual(before.cards);
  await page.locator('[data-search]').fill('Caterpie');
  await page.locator(`[data-inspect="${disposable.uid}"]`).click();
  await page.locator('[data-delete-card]').click(); await page.locator('[data-cleanup-confirm]').click();
  await page.locator('[data-bulk-manage]').click(); await page.locator('[data-cleanup-query]').fill('Weedle');
  await page.locator('[data-cleanup-query]').press('Tab');
  await expect(page.getByRole('button', { name: /sell/i })).toHaveCount(0);
  await page.locator('[data-cleanup-all]').click(); await expect(page.locator('[data-cleanup-count]')).toHaveText('55 selected');
  await page.locator('[data-cleanup-delete]').click(); await page.locator('[data-cleanup-confirm]').click();
  const cleaned = await saved(page);
  expect(cleaned.cards).toHaveLength(4); expect(cleaned.currency).toBe(before.currency);
  expect(cleaned.computer!.listings.map(l => l.uid)).toEqual(before.computer!.listings.map(l => l.uid));
  await page.keyboard.press('Escape'); await page.reload(); await approach(page, 'a', 'Use Computer');
  await page.locator('[data-app="ebay"]').click();
  await page.locator(`[data-action="item"][data-value="${raw.uid}"]`).click();
  await page.locator('[data-asking]').fill('5.17'); await page.locator('[data-action="list"]').click();
  const listed = await saved(page), newListing = listed.computer!.listings.find(l => l.itemUid === raw.uid)!;
  expect(newListing.asking).toBe(5.17); expect(listed.currency).toBe(before.currency);
  expect(listed.cards.find(c => c.uid === raw.uid)!.ownershipLock).toEqual({ kind: 'ebay', uid: newListing.uid });
  await expect(page.locator(`[data-action="accept"][data-value="${offer.uid}"]`)).toBeVisible();
  await page.locator(`[data-action="accept"][data-value="${offer.uid}"]`).click();
  const after = await saved(page);
  expect(after.cards.some(c => c.uid === offered.uid)).toBe(false);
  expect(after.currency).toBe(Math.round((before.currency + offer.offer) * 100) / 100);
  expect(after.computer!.listings.find(l => l.uid === offer.uid)!.status).toBe('SOLD');
  expect(after.computer!.listings.find(l => l.itemUid === sold.uid)).toEqual(before.computer!.listings.find(l => l.itemUid === sold.uid));
  expect(after.cards.find(c => c.uid === pending.uid)).toEqual(before.cards.find(c => c.uid === pending.uid));
  expect(after.cards.find(c => c.uid === slab.uid)).toEqual(before.cards.find(c => c.uid === slab.uid));
  await page.screenshot({ path: 'artifacts/ebay-only-selling-listings.png' });
  await page.reload(); await expect(page.locator('.loading')).toHaveCount(0);
  const loaded = await saved(page);
  expect(loaded.cards).toEqual(after.cards); expect(loaded.computer!.listings).toEqual(after.computer!.listings);
  expect(loaded.currency).toBe(after.currency); expect(loaded.cardDisposals).toEqual(after.cardDisposals);
  expect(errors).toEqual([]);
  await info.attach('ebay-only-selling', { body: JSON.stringify({ url: page.url(), deleted: 56, payoutOnlyThroughEbay: true, previousSalePreserved: true, locksPreserved: true, reloadPreserved: true, errors }), contentType: 'application/json' });
});
