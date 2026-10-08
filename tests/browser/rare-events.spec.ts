import { test, expect, type Page } from '@playwright/test';
import { newSave } from '../../src/core/save';
import { generatePack } from '../../src/core/packs';
import { CARD_BY_ID } from '../../src/data/cards';
import { ownedRawMarketValue } from '../../src/core/economy';
import { approachPackages, takePackage } from '../fixtures/shipping-gameplay';

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('ripify.save.v1')!));
async function exactImages(page: Page) {
  await page.route('**/assets.tcgdex.net/**', async route => {
    const url = new URL(route.request().url()), number = url.pathname.split('/').at(-2);
    try { await route.fulfill({ path: `.freebuff/151-source-audit/images/sv03.5-${number}.webp`, contentType: 'image/webp' }); }
    catch { await route.continue(); }
  });
}
async function desk(page: Page) {
  await expect.poll(() => page.evaluate(() => !!(window as any).__ripifyDebug)).toBe(true);
  await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack', { timeout: 15000 }); }
  finally { await page.keyboard.up('w'); }
  await page.keyboard.press('e');
}
async function binder(page: Page) {
  await expect.poll(() => page.evaluate(() => !!(window as any).__ripifyDebug)).toBe(true);
  await page.keyboard.down('w');
  try { await expect.poll(() => page.evaluate(() => (window as any).__ripifyDebug.position[2]), { timeout: 15000 }).toBeLessThan(-1.85); }
  finally { await page.keyboard.up('w'); }
  await page.keyboard.down('d');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Binder', { timeout: 15000 }); }
  finally { await page.keyboard.up('d'); }
  await page.keyboard.press('e');
}

test('natural special/full misprint remains hidden until manual reveals, with exact cached artwork and persistent results', async ({ page }) => {
  test.setTimeout(120000); await exactImages(page);
  const s = newSave(); s.settings.graphics = 'Low'; s.settings.controlsLearned = true;
  s.packs[0].seed = 9072854; const uid = s.packs[0].uid;
  await page.addInitScript(seed => { if (!localStorage.getItem('ripify.save.v1')) localStorage.setItem('ripify.save.v1', JSON.stringify(seed)); }, s);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await desk(page);
  const opening = (await saved(page)).opening;
  expect(opening.pack.uid).toBe(uid); expect(opening.pack.rareEvents).toMatchObject({ fullMisprint: true, special: { type: 'english-151-demigod' } });
  await expect(page.locator('.opening-stage')).not.toContainText(/misprint|god pack|demigod/i);
  const seam = (await page.locator('[data-tear]').boundingBox())!;
  await page.mouse.move(seam.x + 12, seam.y + 20); await page.mouse.down();
  await page.mouse.move(seam.x + seam.width - 8, seam.y + 20, { steps: 18 }); await page.mouse.up();
  await expect(page.locator('[data-next]')).toBeEnabled({ timeout: 15000 });
  expect(await page.locator('[data-card] .exact-card-image').getAttribute('src')).toBe(CARD_BY_ID.get(opening.cards[0].cardId)!.image);
  expect(await page.locator('[data-card] .exact-card-image').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await page.locator('[data-card] .exact-card-image').evaluate(el => (el as HTMLElement).style.transform)).toContain('translate(');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'artifacts/misprint-pack-reveal.png' });
  const state = await saved(page);
  expect(Number((await page.locator('.pull-value b').textContent())!.split(' ')[0])).toBeCloseTo(ownedRawMarketValue(state.opening.cards[0], state.marketSeed), 2);
  await page.locator('[data-next]').click(); await expect(page.locator('[data-card]')).toHaveAttribute('data-index', '1');
  await page.waitForTimeout(600); expect((await saved(page)).opening.index).toBe(1);
  await page.keyboard.press('Escape'); await page.reload(); await desk(page);
  await expect(page.locator('[data-next]')).toBeEnabled({ timeout: 15000 });
  expect((await saved(page)).opening.cards).toEqual(opening.cards);
  for (let index = 2; index <= 10; index++) {
    await page.locator('[data-next]').click(); await expect(page.locator('[data-card]')).toHaveAttribute('data-index', String(index));
    expect(await page.locator('[data-card] .exact-card-image').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await page.locator('[data-next]').click(); await page.locator('[data-collect]').click();
  const final = await saved(page); expect(final.cards).toEqual(opening.cards); expect(final.packReceipts).toHaveLength(1);
  expect(final.rareEventStats).toMatchObject({ generatedPacks: 1, specialPacks: 1, fullMisprintPacks: 1, combinedPacks: 1, fullPackMisprints: 11, individualMisprints: 0 });
  expect(errors).toEqual([]);
});

test('the same miscut survives raw front/back inspection, grading, slab rotation, stand display and reload', async ({ page }) => {
  test.setTimeout(120000); await exactImages(page);
  const s = newSave(); s.settings.graphics = 'Low'; s.settings.controlsLearned = true;
  s.packs[0].seed = 9072854; const c = generatePack(s.packs[0], undefined, 0)[0]; s.cards = [c]; s.packs = [];
  await page.addInitScript(seed => { if (!localStorage.getItem('ripify.save.v1')) localStorage.setItem('ripify.save.v1', JSON.stringify(seed)); }, s);
  await page.goto('/'); await binder(page); await page.locator(`[data-inspect="${c.uid}"]`).click();
  const canvas = page.locator('.physical-card-canvas');
  await expect(canvas).toHaveAttribute('data-front-image', 'ready'); await expect(canvas).toHaveAttribute('data-back-image', 'ready');
  await page.locator('.inspection-card').screenshot({ path: 'artifacts/misprint-raw-front.png' });
  await page.locator('[data-flip]').click(); await expect(canvas).toHaveAttribute('data-side', 'back');
  await page.locator('.inspection-card').screenshot({ path: 'artifacts/misprint-raw-back.png' });
  expect((await saved(page)).cards[0]).toEqual(c);
  await page.locator('[data-grade]').click(); await page.locator('[data-grader="BGS"]').click(); await page.locator('[data-service="Express"]').click(); await page.locator('[data-submit]').click();
  const order = (await saved(page)).orders[0]; await page.clock.setFixedTime(order.dueAt + 1); await page.keyboard.press('Escape'); await page.reload(); await approachPackages(page); await takePackage(page);
  await page.reload(); await binder(page); await page.locator(`[data-inspect="${c.uid}"]`).click();
  await expect(canvas).toHaveAttribute('data-kind', 'slab'); await expect(canvas).toHaveAttribute('data-front-image', 'ready');
  await page.locator('.inspection-card').screenshot({ path: 'artifacts/misprint-slab-front.png' });
  await page.locator('[data-flip]').click(); await page.locator('.inspection-card').screenshot({ path: 'artifacts/misprint-slab-back.png' });
  const slab = (await saved(page)).cards[0]; expect(slab.uid).toBe(c.uid); expect(slab.misprint).toEqual(c.misprint); expect(slab.condition).toEqual(c.condition);
  await page.locator('[data-display]').click(); await page.locator('[data-slot="0"]').click();
  await page.reload(); await expect(page.locator('.game-canvas')).toBeVisible();
  const reloaded = await saved(page); expect(reloaded.displays[0]).toBe(c.uid); expect(reloaded.cards[0]).toEqual(slab);
  expect(await page.evaluate(() => (window as any).__ripifyDebug.displays[0][0])).toMatchObject({ uid: c.uid, graded: true });
});
