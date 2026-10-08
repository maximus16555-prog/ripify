import { test, expect, type Page } from '@playwright/test';
import { GameStore } from '../../src/core/store';
import { ComputerServices } from '../../src/core/computer';
import { createCard, seeded } from '../../src/core/inventory';
import { SAVE_KEY } from '../../src/core/save';
import { ownedValue } from '../../src/core/economy';
import type { Save } from '../../src/core/types';

const saved = (page: Page): Promise<Save> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
async function computer(page: Page) {
  await expect(page.locator('.game-canvas')).toBeVisible(); await expect(page.locator('.loading')).toHaveCount(0);
  await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack'); await page.waitForTimeout(650); }
  finally { await page.keyboard.up('w'); }
  await page.keyboard.down('a');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Use Computer'); }
  finally { await page.keyboard.up('a'); }
  await page.keyboard.press('e'); await page.locator('[data-app="ebay"]').click();
}

test('discounted listings attract buyers and sell earlier through the live eBay app, including reload', async ({ page }, info) => {
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} }); new ComputerServices(store);
  store.state.settings.controlsLearned = true; store.state.computer!.speed = 120;
  store.state.cards = Array.from({ length: 3 }, () => createCard('sv03.5-173', 'discount-fixture', seeded(100), 'holo', 'pack'));
  const cards = structuredClone(store.state.cards), market = ownedValue(cards[0], store.state.marketSeed), currency = store.state.currency;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ state, key }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
    // Identical seeded buyers isolate asking price; no production odds are changed.
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = ((array: Uint32Array) => {
      if (array instanceof Uint32Array && array.length === 1) { array[0] = 0; return array; }
      return original(array);
    }) as typeof crypto.getRandomValues;
  }, { state: store.state, key: SAVE_KEY });
  await page.goto('/'); await computer(page);
  for (let i = 0; i < cards.length; i++) {
    if (i) await page.locator('[data-action="route"][data-value="home"]').click();
    await page.locator(`[data-action="item"][data-value="${cards[i].uid}"]`).click();
    await page.locator('[data-asking]').fill((market * [19.5 / 22, 1, 25 / 22][i]).toFixed(2));
    await page.locator('[data-action="list"]').click();
  }
  const created = await saved(page), listings = created.computer!.listings;
  expect(listings).toHaveLength(3); expect(listings.every(l => l.outcome === 'sale')).toBe(true);
  expect(listings[0].due - listings[0].started).toBeLessThan(listings[1].due - listings[1].started);
  expect(listings[1].due - listings[1].started).toBeLessThan(listings[2].due - listings[2].started);
  expect(listings[0].watchAt! - listings[0].started).toBeLessThan(listings[1].watchAt! - listings[1].started);
  expect(created.currency).toBe(currency); expect(created.cards.map(c => c.condition)).toEqual(cards.map(c => c.condition));
  await page.reload(); await expect(page.locator('.loading')).toHaveCount(0);
  expect((await saved(page)).computer!.listings).toEqual(listings);
  await computer(page); await page.locator('[data-action="route"][data-value="listings"]').click();
  await expect.poll(async () => (await saved(page)).computer!.listings[0].status, { timeout: 90000 }).toBe('SOLD');
  const firstSale = await saved(page);
  expect(firstSale.computer!.listings[1].status).not.toBe('SOLD'); expect(firstSale.computer!.listings[2].status).not.toBe('SOLD');
  expect(firstSale.cards.some(c => c.uid === cards[0].uid)).toBe(false); expect(firstSale.cards).toHaveLength(2);
  expect(firstSale.currency).toBe(Math.round((currency + listings[0].asking) * 100) / 100);
  await page.screenshot({ path: 'artifacts/ebay-discount-first-sale.png' });
  await page.reload(); await expect(page.locator('.loading')).toHaveCount(0);
  const reloaded = await saved(page);
  expect(reloaded.currency).toBe(firstSale.currency); expect(reloaded.cards).toEqual(firstSale.cards);
  expect(reloaded.computer!.listings).toEqual(firstSale.computer!.listings); expect(errors).toEqual([]);
  await info.attach('discount-gameplay', { body: JSON.stringify({ url: page.url(), market, asking: listings.map(l => l.asking), minutes: listings.map(l => l.due - l.started), discountedSoldFirst: true, persistedWithoutReroll: true, errors }), contentType: 'application/json' });
});
