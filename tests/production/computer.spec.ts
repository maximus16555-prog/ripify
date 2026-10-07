import { test, expect, type Page } from '@playwright/test';
import { GameStore } from '../../src/core/store';
import { ComputerServices } from '../../src/core/computer';
import { createCard, seeded, createSealed } from '../../src/core/inventory';
import { PRODUCT_BY_ID } from '../../src/data/products';
import { SAVE_KEY } from '../../src/core/save';
import type { Save } from '../../src/core/types';
const saved = (page: Page): Promise<Save> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
async function computer(page: Page) {
  await expect(page.locator('.game-canvas')).toBeVisible(); await expect(page.locator('.loading')).toHaveCount(0);
  await page.keyboard.down('w'); try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack', { timeout: 15000 }); await page.waitForTimeout(650); } finally { await page.keyboard.up('w'); }
  await page.keyboard.down('a'); try { await expect(page.locator('.interaction-prompt')).toContainText('Use Computer', { timeout: 15000 }); } finally { await page.keyboard.up('a'); }
  await page.keyboard.press('e'); await expect(page.locator('.pc-monitor')).toBeVisible();
}
test('physical computer: five connected apps, purchases, locks, grading, search, profile and reload', async ({ page }, info) => {
  test.setTimeout(180000);
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} }); new ComputerServices(store);
  store.state.currency = 1000; store.state.settings.controlsLearned = true; store.state.computer!.minute = 570; store.state.computer!.speed = 120;
  const raw = createCard('me02.5-276', 'test-source', seeded(21), 'holo', 'pack'), sale = createCard('sv03.5-001', 'test-source', seeded(22), 'normal', 'pack'), slab = createCard('svp-051', 'test-upc', seeded(23), 'holo', 'promo');
  store.state.cards = [raw, sale, slab]; store.submit(slab.uid, 'BGS', 'Standard'); const o = store.state.orders[0]; store.receive(o.uid, o.dueAt); store.state.sealedProducts.push(createSealed(PRODUCT_BY_ID.get('151-etb')!, 50));
  const state = store.state, errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state, key: SAVE_KEY });
  await page.goto('/'); await computer(page); await page.waitForTimeout(900);
  await page.screenshot({ path: 'artifacts/computer-desktop.png' });
  await page.locator('[data-app="store"]').click(); await expect(page.locator('[data-window="store"]')).toBeVisible();
  await page.getByRole('button', { name: 'Maximize Pokémon Store', exact: true }).click();
  await expect(page.locator('[data-window="store"]')).toHaveClass(/maximized/);
  await page.locator('[data-action="plus"][data-value="151-booster"]').click();
  await page.locator('[data-action="route"][data-value="cart"]').click(); await page.locator('[data-action="checkout"]').click();
  await expect(page.locator('.pc-order')).toContainText('Shipping');
  const ordered = await saved(page); expect(ordered.computer!.orders).toHaveLength(1); expect(ordered.packs).toHaveLength(1); expect(ordered.opening).toBeNull(); const orderPack = ordered.computer!.orders[0].items[0].uid;
  await page.screenshot({ path: 'artifacts/computer-store.png' });
  await page.getByRole('button', { name: 'Minimize Pokémon Store', exact: true }).click(); await expect(page.locator('[data-window="store"]')).toBeHidden();
  await page.getByRole('button', { name: 'Restore Pokémon Store', exact: true }).click(); await expect(page.locator('[data-window="store"]')).toBeVisible();
  await page.getByRole('button', { name: 'Close Pokémon Store', exact: true }).click();
  await page.locator('[data-app="ebay"]').click(); await page.locator(`[data-action="item"][data-value="${sale.uid}"]`).click();
  await page.locator('[data-asking]').fill('0.01');
  await page.evaluate(() => { const original = crypto.getRandomValues.bind(crypto); crypto.getRandomValues = ((a: Uint32Array) => { if (a instanceof Uint32Array && a.length === 1) { a[0] = 0; crypto.getRandomValues = original; return a; } return original(a); }) as typeof crypto.getRandomValues; });
  await page.locator('[data-action="list"]').click(); await expect(page.locator('.pc-listing')).toContainText('LISTED'); expect((await saved(page)).cards.find(c => c.uid === sale.uid)!.ownershipLock?.kind).toBe('ebay');
  await page.screenshot({ path: 'artifacts/computer-ebay.png' });
  await page.getByRole('button', { name: 'Minimize eBay', exact: true }).click();
  await page.locator('[data-app="grading"]').click(); await page.locator(`[data-action="item"][data-value="${raw.uid}"]`).click();
  await page.locator('[data-field="service"]').selectOption('Express'); await page.locator('[data-action="submit"]').click();
  await expect(page.locator('.pc-order')).toContainText('PSA'); expect((await saved(page)).cards.find(c => c.uid === raw.uid)!.status).toBe('grading');
  await page.screenshot({ path: 'artifacts/computer-grading.png' }); await page.getByRole('button', { name: 'Minimize Grading', exact: true }).click();
  await page.locator('[data-app="collectr"]').click(); await expect(page.locator('.pc-portfolio')).toContainText('Total portfolio value');
  await page.screenshot({ path: 'artifacts/computer-collectr.png' });
  await page.locator('[data-action="route"][data-value="collection"]').click(); await page.locator('[data-field="filter"]').selectOption('graded'); await expect(page.locator('.pc-item')).toHaveCount(1); await expect(page.locator('.pc-item')).toContainText('BGS');
  await page.locator('[data-action="route"][data-value="search"]').click(); await page.locator('[data-search]').fill('Pikachu ex');
  await expect(page.locator('[data-action="card"][data-value="me02.5-276"]')).toBeVisible(); await page.locator('[data-action="card"][data-value="me02.5-276"]').click();
  await expect(page.locator('.pc-card-page')).toContainText('$4,582.00'); await expect(page.locator('.pc-counts')).toContainText('PSA 10'); await expect(page.locator('.pc-chart')).toBeVisible(); await expect(page.locator('.pc-grade-prices')).toContainText('PSA 9');
  await expect.poll(() => page.locator('.pc-card-page img.exact-card-image').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect((await page.locator('.pc-card-page .real-card').boundingBox())!.height).toBeGreaterThan(200);
  await page.screenshot({ path: 'artifacts/computer-card-page.png' });
  await page.locator('[data-action="route"][data-value="trade"]').click(); await page.locator('[data-give]').selectOption(slab.uid); await page.locator('[data-action="give"]').click(); await page.locator('[data-trade-query]').fill('Pikachu ex'); await page.locator('[data-receive]').selectOption('me02.5-276'); await page.locator('[data-action="receiveTrade"]').click(); await expect(page.locator('.pc-trade')).toContainText('Pikachu ex');
  await page.getByRole('button', { name: 'Minimize Collectr', exact: true }).click();
  await page.locator('[data-app="profile"]').click(); await expect(page.locator('.pc-profile-header')).toContainText('Collector'); await page.locator('[name="name"]').fill('Max'); await page.locator('[data-action="profile"]').click(); await expect(page.locator('.pc-profile-header')).toContainText('Max');
  await page.screenshot({ path: 'artifacts/computer-profile.png' });
  // Real timers progress in the shared game even while a different application is foregrounded.
  await expect.poll(async () => (await saved(page)).computer!.orders[0].status, { timeout: 45000 }).toBe('DELIVERED');
  await expect.poll(async () => (await saved(page)).computer!.listings[0].status, { timeout: 80000 }).toBe('SOLD');
  await page.getByRole('button', { name: 'Minimize RIPIFY Profile', exact: true }).click(); await page.getByRole('button', { name: 'Restore Grading', exact: true }).click();
  await expect(page.locator('[data-action="receive"]')).toBeEnabled({ timeout: 70000 }); await page.locator('[data-action="receive"]').click();
  await expect(page.locator('.physical-card-canvas')).toHaveAttribute('data-kind', 'slab'); await expect(page.locator('.physical-card-canvas')).toHaveAttribute('data-front-image', 'ready'); await page.screenshot({ path: 'artifacts/computer-returned-slab.png' });
  const finished = await saved(page); expect(finished.cards.find(c => c.uid === raw.uid)!.status).toBe('graded'); expect(finished.cards.some(c => c.uid === sale.uid)).toBe(false); expect(finished.packs.filter(p => p.uid === orderPack)).toHaveLength(1);
  await page.keyboard.press('Escape'); await expect(page.locator('.pc-monitor')).toHaveCount(0); await page.reload(); await computer(page);
  const reloaded = await saved(page); expect(reloaded.cards).toEqual(finished.cards); expect(reloaded.computer!.orders).toEqual(finished.computer!.orders); expect(reloaded.computer!.listings).toEqual(finished.computer!.listings); expect(reloaded.computer!.profile.name).toBe('Max'); expect(reloaded.packs.filter(p => p.uid === orderPack)).toHaveLength(1); expect(errors).toEqual([]);
  await info.attach('computer-report', { body: JSON.stringify({ url: page.url(), errors, deliveredPackUid: orderPack, cardUids: reloaded.cards.map(c => c.uid), apps: ['store', 'ebay', 'grading', 'collectr', 'profile'], profile: reloaded.computer!.profile }, null, 2), contentType: 'application/json' });
});

test('computer windows release hidden content and reuse the bounded physical preview', async ({ page }, info) => {
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} });
  const card = createCard('svp-051', 'test-upc', seeded(24), 'holo', 'promo'); card.status = 'graded'; card.grader = 'PSA'; card.grade = 9; store.state.cards = [card];
  const state = store.state;
  await page.addInitScript(({ state, key }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
    const stats = { contexts: 0, draws: 0 }, seen = new WeakSet<object>(); (window as any).computerPerf = stats;
    const proto = HTMLCanvasElement.prototype as any, original = proto.getContext;
    proto.getContext = function(...args: any[]) { const ctx = original.apply(this, args); if (ctx && String(args[0]).startsWith('webgl') && !seen.has(ctx)) { seen.add(ctx); stats.contexts++; } return ctx; };
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype] as any[]) for (const key of ['drawElements', 'drawArrays']) { const original = proto[key]; proto[key] = function(...args: any[]) { stats.draws++; return original.apply(this, args); }; }
  }, { state, key: SAVE_KEY });
  await page.goto('/'); await computer(page);
  for (let i = 0; i < 8; i++) {
    await page.locator('[data-app="grading"]').click(); await page.locator('[data-action="route"][data-value="returns"]').click(); await page.locator(`[data-action="item"][data-value="${card.uid}"]`).click(); await expect(page.locator('.physical-card-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Minimize Grading', exact: true }).click(); await expect(page.locator('.physical-card-canvas')).toHaveCount(0);
    await page.locator('[data-app="collectr"]').click(); await page.getByRole('button', { name: 'Minimize Collectr', exact: true }).click(); await expect(page.locator('.pc-chart')).toHaveCount(0); await expect(page.locator('.pc-app-content img')).toHaveCount(0);
  }
  await page.waitForTimeout(5000); const before = await page.evaluate(() => ({ ...(window as any).computerPerf })); await page.waitForTimeout(1000); const after = await page.evaluate(() => ({ ...(window as any).computerPerf }));
  expect(after.contexts).toBeLessThanOrEqual(2); expect(after.draws - before.draws).toBe(0);
  await page.keyboard.press('Escape'); await expect(page.locator('.pc-monitor')).toHaveCount(0);
  await info.attach('computer-performance', { body: JSON.stringify({ cycles: 8, contextsCreated: after.contexts, idleWorldDrawsPerSecond: after.draws - before.draws, hiddenImages: 0, hiddenPreviews: 0 }), contentType: 'application/json' });
});
