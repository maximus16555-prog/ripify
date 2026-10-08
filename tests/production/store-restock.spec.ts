import { test, expect, type Page } from '@playwright/test';
import { GameStore } from '../../src/core/store';
import { ComputerServices, COMMERCE, stock } from '../../src/core/computer';
import { SAVE_KEY } from '../../src/core/save';
import type { Save } from '../../src/core/types';

async function computer(page: Page) {
  await expect(page.locator('.loading')).toHaveCount(0);
  await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack', { timeout: 15000 }); await page.waitForTimeout(650); }
  finally { await page.keyboard.up('w'); }
  await page.keyboard.down('a');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Use Computer', { timeout: 15000 }); }
  finally { await page.keyboard.up('a'); }
  await page.keyboard.press('e');
  await expect(page.locator('.pc-monitor')).toBeVisible();
  await page.locator('[data-app="store"]').click();
}
const saved = (page: Page): Promise<Save> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);

test('sold-out saved store restocks in an open product view, accepts checkout, and retains stock/orders after reload', async ({ page }, info) => {
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} }); new ComputerServices(store);
  store.state.settings.controlsLearned = true; store.state.currency = 1000;
  store.state.computer!.minute = 1980; // Day 2, 9:00 AM: all of yesterday's inventory was purchased.
  store.state.computer!.speed = 120;
  for (const [id, n] of Object.entries(COMMERCE.stock)) store.state.computer!.drops[`0:${id}`] = n;
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state: store.state, key: SAVE_KEY });
  await page.goto('/'); await computer(page);
  await expect(page.locator('.pc-product-grid')).toContainText('SOLD OUT');
  await page.locator('[data-action="product"][data-value="151-booster"]').click();
  const add = page.locator('[data-action="plus"][data-value="151-booster"]');
  await expect(add).toBeDisabled();
  await expect(page.locator('.pc-product-page')).toContainText('Restocks');
  const art = page.locator('.pc-product-page img');
  await expect.poll(() => art.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await art.evaluate((img: HTMLImageElement) => {
    (window as any).storeArtwork = { node: img, loads: 0 };
    img.addEventListener('load', () => { (window as any).storeArtwork.loads++; });
  });
  // No navigation or user input while waiting: the existing gameplay clock must refresh this page.
  await expect(add).toBeEnabled({ timeout: 25000 });
  await expect.poll(async () => (await saved(page)).computer!.minute).toBeGreaterThanOrEqual(2010);
  const replenished = await saved(page);
  for (const id of Object.keys(COMMERCE.stock)) expect(stock(replenished, id)).toBe(COMMERCE.stock[id]);
  expect(await art.evaluate(img => img === (window as any).storeArtwork.node && (window as any).storeArtwork.loads === 0)).toBe(true);
  await add.click();
  await page.locator('[data-action="route"][data-value="cart"]').click();
  await expect(page.locator('[data-action="checkout"]')).toBeEnabled();
  await page.locator('[data-action="checkout"]').click();
  await expect(page.locator('.pc-order')).toContainText('Shipping');
  const ordered = await saved(page);
  expect(ordered.computer!.drops['1:151-booster']).toBe(1);
  expect(ordered.computer!.orders).toHaveLength(1);
  expect(ordered.computer!.orders[0].items[0].productId).toBe('151-booster');
  expect(ordered.currency).toBeLessThan(1000);
  expect(ordered.packs).toEqual(store.state.packs); // The purchased pack is still inside the real delivery order.
  await page.reload(); await computer(page);
  const reloaded = await saved(page);
  expect(reloaded.computer!.orders).toEqual(ordered.computer!.orders);
  expect(reloaded.computer!.drops).toEqual(ordered.computer!.drops);
  expect(reloaded.currency).toBe(ordered.currency);
  await expect(page.locator('.pc-product-grid')).not.toContainText('SOLD OUT');
  await expect(page.locator('.pc-store-banner')).toContainText('Next restock');
  await expect.poll(() => page.locator('.pc-product-grid img').evaluateAll(images => images.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: 'artifacts/store-restock.png' });
  expect(errors).toEqual([]);
  await info.attach('restock-gameplay', { body: JSON.stringify({ url: page.url(), stockAtDrop: Object.fromEntries(Object.keys(COMMERCE.stock).map(id => [id, stock(replenished, id)])), orderUid: ordered.computer!.orders[0].uid, reloadPreserved: true, errors }), contentType: 'application/json' });
});

test('store remains purchasable across midnight without a premature reset or morning closure', async ({ page }, info) => {
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} }); new ComputerServices(store);
  store.state.settings.controlsLearned = true; store.state.currency = 1000;
  store.state.computer!.minute = 1420; store.state.computer!.speed = 120;
  await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state: store.state, key: SAVE_KEY });
  await page.goto('/'); await computer(page);
  await expect(page.locator('.pc-product-grid')).not.toContainText('DROP AT');
  await expect.poll(() => page.locator('[data-pc-clock]').innerText(), { timeout: 20000 }).toMatch(/^12:0\d AM$/);
  await expect(page.locator('[data-action="plus"][data-value="151-booster"]')).toBeEnabled();
  await page.locator('[data-action="plus"][data-value="151-booster"]').click();
  await page.locator('[data-action="route"][data-value="cart"]').click();
  await page.locator('[data-action="checkout"]').click();
  const ordered = await saved(page);
  expect(ordered.computer!.minute).toBeGreaterThanOrEqual(1440);
  expect(ordered.computer!.drops['0:151-booster']).toBe(1);
  expect(ordered.computer!.drops['1:151-booster']).toBeUndefined();
  expect(stock(ordered, '151-booster')).toBeGreaterThan(0);
  expect(stock(ordered, '151-booster')).toBeLessThan(COMMERCE.stock['151-booster']);
  await info.attach('midnight-purchase', { body: JSON.stringify({ minute: ordered.computer!.minute, remaining: stock(ordered, '151-booster'), ledger: ordered.computer!.drops }), contentType: 'application/json' });
});

test('an open cart responds to demand sellout and the next scheduled restock without reserving or overselling stock', async ({ page }) => {
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} }); new ComputerServices(store);
  store.state.settings.controlsLearned = true; store.state.currency = 1000;
  const c = store.state.computer!; c.speed = 120;
  // Find a deterministic final-unit sale between 9:00 and 9:10, with time to walk to the computer first.
  let initial = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    store.state.marketSeed = seed / 10;
    c.minute = 1960; initial = stock(store.state, '151-booster');
    c.minute = 1980; const before = stock(store.state, '151-booster');
    c.minute = 1990; const after = stock(store.state, '151-booster');
    if (before === initial && after < before) break;
  }
  c.minute = 1960; c.drops['0:151-booster'] = initial - 1;
  expect(stock(store.state, '151-booster')).toBe(1);
  await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state: store.state, key: SAVE_KEY });
  await page.goto('/'); await computer(page);
  await page.locator('[data-action="plus"][data-value="151-booster"]').click();
  await page.locator('[data-action="route"][data-value="cart"]').click();
  const checkout = page.locator('[data-action="checkout"]');
  await expect(checkout).toBeEnabled();
  await expect(checkout).toBeDisabled({ timeout: 18000 });
  expect((await saved(page)).computer!.orders).toHaveLength(0);
  await expect(checkout).toBeEnabled({ timeout: 20000 });
  await checkout.click();
  await expect(page.locator('.pc-order')).toContainText('Shipping');
  const final = await saved(page);
  expect(final.computer!.orders).toHaveLength(1);
  expect(final.computer!.drops['1:151-booster']).toBe(1);
});
