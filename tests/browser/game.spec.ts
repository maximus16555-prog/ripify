import { test, expect, type Page } from '@playwright/test';
import { newSave } from '../../src/core/save';
import { createSealed } from '../../src/core/inventory';
import { PRODUCTS } from '../../src/data/products';
import { generatePack } from '../../src/core/packs';

type Debug = { position: number[]; camera: number[]; grounded: boolean; focus: boolean; preset: string };
const debug = (page: Page) => page.evaluate(() => (window as unknown as { __ripifyDebug: Debug }).__ripifyDebug);
const save = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('ripify.save.v1')!));
async function ready(page: Page) {
  const seed = newSave(); seed.settings.graphics = 'Low';
  await page.addInitScript(s => { if (!localStorage.getItem('ripify.save.v1')) localStorage.setItem('ripify.save.v1', JSON.stringify(s)); }, seed);
  await page.goto('/'); await expect(page.locator('.game-canvas')).toBeVisible(); await expect(page.locator('.loading')).toHaveCount(0);
}
async function coordinate(page: Page, key: string, axis: number, target: number, greater = false) {
  await expect.poll(() => debug(page)).toBeTruthy();
  await page.keyboard.down(key);
  try { await expect.poll(async () => { const value = (await debug(page)).position[axis]; return greater ? value >= target : value <= target; }, { timeout: 15000, intervals: [60] }).toBe(true); }
  finally { await page.keyboard.up(key); } await page.waitForTimeout(180);
}
async function walkToPrompt(page: Page, key: string, text: string) {
  await page.keyboard.down(key);
  try { await expect(page.locator('.interaction-prompt')).toContainText(text, { timeout: 15000 }); await expect(page.locator('.interaction-prompt')).toBeVisible(); }
  finally { await page.keyboard.up(key); } await page.waitForTimeout(180);
}
async function desk(page: Page) { await coordinate(page, 'w', 2, -1.30); await expect(page.locator('.interaction-prompt')).toContainText('Open Pack'); await page.keyboard.press('e'); }

test('old room opens directly and manual pack reveals survive Escape and reload', async ({ page }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await ready(page); await expect(page.locator('.modal-root')).toBeHidden(); expect((await debug(page)).position).toEqual([0, 0, 1.8]);
  await page.screenshot({ path: 'test-results/restored-room.png' }); await desk(page);
  const seam = (await page.locator('[data-tear]').boundingBox())!;
  await page.mouse.move(seam.x + 16, seam.y + seam.height / 2); await page.mouse.down(); await page.mouse.move(seam.x + 25, seam.y + seam.height / 2); await page.mouse.up();
  expect((await save(page)).opening.stage).toBe('sealed');
  await page.mouse.move(seam.x + 16, seam.y + seam.height / 2); await page.mouse.down(); await page.mouse.move(seam.x + seam.width - 16, seam.y + seam.height / 2, { steps: 15 }); await page.mouse.up();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-index', '0'); await page.waitForTimeout(600); expect((await save(page)).opening.index).toBe(0);
  const card = (await page.locator('[data-card]').boundingBox())!;
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2); await page.mouse.down(); await page.mouse.move(card.x + card.width / 2 + 170, card.y + card.height / 2 - 20, { steps: 12 }); await page.mouse.up();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-index', '1'); const cards = (await save(page)).opening.cards;
  await page.keyboard.press('Escape'); await page.reload(); await desk(page); await expect(page.locator('[data-card]')).toHaveAttribute('data-index', '1'); expect((await save(page)).opening.cards).toEqual(cards);
  for (let index = 2; index <= 10; index++) { await page.locator('[data-next]').click(); await expect(page.locator('[data-card]')).toHaveAttribute('data-index', String(index)); }
  await page.waitForTimeout(600); expect((await save(page)).opening.index).toBe(10); await page.locator('[data-next]').click(); await expect(page.locator('[data-collect]')).toBeVisible(); expect((await save(page)).cards).toHaveLength(0);
  await page.locator('[data-collect]').click(); expect((await save(page)).cards).toHaveLength(11);
  await walkToPrompt(page, 'd', 'Open Binder'); await page.keyboard.press('e'); await expect(page.locator('[data-inspect]')).toHaveCount(11);
  await page.locator('[data-inspect]').first().click(); await page.locator('[data-display]').click(); await page.locator('[data-slot="0"]').click(); expect((await save(page)).displays[0]).toBeTruthy();
  await page.keyboard.press('e'); await page.locator('[data-inspect]').first().click(); await page.locator('[data-sell]').click(); await page.locator('[data-sell]').click(); expect((await save(page)).cards).toHaveLength(10);
  await page.keyboard.press('Escape'); await page.reload(); expect((await save(page)).cards).toHaveLength(10); expect(errors).toEqual([]);
});

test('old shop sells unopened packs and its left door returns home', async ({ page }) => {
  test.setTimeout(90000); await ready(page); await walkToPrompt(page, 'a', 'Enter Card Shop'); await page.keyboard.press('e'); await expect(page.locator('[data-location]')).toHaveText('Corner Card Shop');
  await coordinate(page, 'a', 0, -3.4); await walkToPrompt(page, 'w', 'Buy'); await page.keyboard.press('e'); await page.locator('[data-buy]').first().click(); const bought = await save(page);
  expect(bought.packs).toHaveLength(2); expect(bought.cards).toHaveLength(0); expect(bought.opening).toBeNull(); expect(bought.currency).toBeLessThan(120);
  await page.keyboard.press('Escape'); await coordinate(page, 's', 2, 2.8, true); await coordinate(page, 'a', 0, -3.25); await walkToPrompt(page, 'w', 'Return Home'); await page.keyboard.press('e'); await expect(page.locator('[data-location]')).toHaveText('Your room');
});

test('old computer grading, settings and saved preferences remain usable', async ({ page }) => {
  test.setTimeout(90000); const seed = newSave(); seed.settings.graphics = 'Low'; seed.cards = generatePack(seed.packs[0]);
  await page.addInitScript(s => { if (!localStorage.getItem('ripify.save.v1')) localStorage.setItem('ripify.save.v1', JSON.stringify(s)); }, seed);
  await ready(page); await coordinate(page, 'w', 2, -1.3); await walkToPrompt(page, 'd', 'Open Binder'); await page.keyboard.press('e'); await page.locator('[data-inspect]').first().click(); await page.locator('[data-grade]').click(); await page.locator('[data-grader="BGS"]').click(); await page.locator('[data-service="Express"]').click(); await page.locator('[data-submit]').click();
  const order = (await save(page)).orders[0]; await page.clock.setFixedTime(order.dueAt + 1); await page.locator('[data-receive]').click(); const stored = await save(page);
  expect(stored.orders).toHaveLength(0); expect(stored.cards[0].status).toBe('graded'); expect(stored.cards[0].subgrades).toHaveLength(4);
  await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1024, height: 640 }); await page.getByRole('button', { name: 'Settings', exact: true }).click(); await expect(page.locator('[data-graphics]')).toHaveCount(4); await page.locator('[data-fps]').check();
  const download = page.waitForEvent('download'); await page.locator('[data-export]').click(); expect((await download).suggestedFilename()).toBe('ripify-save.json'); await page.locator('[data-resume]').click(); await page.reload(); expect((await save(page)).settings.fps).toBe(true); expect((await save(page)).cards[0].status).toBe('graded');
});

test('unsupported graphics offers recovery', async ({ page }) => {
  await page.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...args: unknown[]) { if (type === 'webgl2') return null; return get.apply(this, [type, ...args] as Parameters<typeof get>); } as typeof get; });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Couldn’t start the game' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});


test('real ETB keeps sealed, manually opens, and leaves all contained packs unopened', async ({ page }) => {
  test.setTimeout(120000); const seed = newSave(); seed.settings.graphics = 'Low';
  await page.addInitScript(s => { if (!localStorage.getItem('ripify.save.v1')) localStorage.setItem('ripify.save.v1', JSON.stringify(s)); }, seed);
  await ready(page); await walkToPrompt(page, 'a', 'Enter Card Shop'); await page.keyboard.press('e');
  await coordinate(page, 'd', 0, -.3, true); await walkToPrompt(page, 'w', 'Elite Trainer Box'); await page.keyboard.press('e');
  await page.locator('[data-buy="151-etb"]').click(); const owned = (await save(page)).sealedProducts[0];
  expect((await save(page)).cards).toHaveLength(0); expect((await save(page)).packs).toHaveLength(1);
  await page.keyboard.press('Escape'); await coordinate(page, 's', 2, 2.8, true); await coordinate(page, 'a', 0, -3.25); await walkToPrompt(page, 'w', 'Return Home'); await page.keyboard.press('e'); await expect(page.locator('[data-location]')).toHaveText('Your room');
  await desk(page); await page.locator('[data-keep-sealed]').click(); await page.reload(); expect((await save(page)).sealedProducts[0]).toEqual(owned);
  await desk(page); await page.locator('[data-container]').click();
  await expect(page.locator('.container-canvas')).toHaveAttribute('data-phase', 'sleeve');
  await page.locator('[data-action]').click();
  await expect(page.locator('.container-canvas')).toHaveAttribute('data-phase', 'lid');
  expect((await save(page)).containerOpening.stage).toBe('sealed');
  await page.locator('[data-action]').click();
  await expect(page.locator('.container-canvas')).toHaveAttribute('data-phase', 'contents');
  expect((await save(page)).cards).toHaveLength(0);
  await page.keyboard.press('Escape'); await page.reload(); await ready(page); await desk(page);
  await expect(page.locator('.container-canvas')).toHaveAttribute('data-phase', 'contents');
  await page.screenshot({ path: 'artifacts/etb-contents.png' });
  await page.locator('[data-action]').click();
  await expect(page.locator('.container-canvas')).toHaveCount(0);
  const received = await save(page); expect(received.sealedProducts).toHaveLength(0); expect(received.packs).toHaveLength(10); expect(received.cards.map((c: {cardId: string}) => c.cardId)).toEqual(['svp-051']); expect(received.opening).toBeNull();
  await page.keyboard.press('e'); await page.locator('[data-pack]').first().click();
  const seam = (await page.locator('[data-tear]').boundingBox())!;
  await page.mouse.move(seam.x + 16, seam.y + 20); await page.mouse.down(); await page.mouse.move(seam.x + seam.width - 16, seam.y + 20, { steps: 15 }); await page.mouse.up();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-index','0');
  await page.locator('[data-next]').click(); await expect(page.locator('[data-card]')).toHaveAttribute('data-index','1');
  const image = page.locator('[data-card] .exact-card-image'); await expect(image).toBeVisible();
  await expect.poll(async () => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const printing = (await save(page)).opening.cards[1].cardId;
  await expect(image).toHaveAttribute('src', new RegExp('/sv03\\.5/' + printing.split('-').at(-1) + '/'));
  await image.evaluate((img: HTMLImageElement) => img.decode()); await expect(image).not.toHaveClass(/image-loading/);
  await page.waitForTimeout(600); await page.screenshot({ path: 'artifacts/real-card-reveal.png' });
  await page.waitForTimeout(600); expect((await save(page)).opening.index).toBe(1);
});


test('missing card image is explicit and never replaced with invented artwork', async ({ page }) => {
  const seed = newSave(); seed.settings.graphics = 'Low'; const pack = seed.packs.pop()!;
  seed.opening = { pack, cards: generatePack(pack), stage: 'cards', index: 1 };
  await page.route('https://assets.tcgdex.net/**', route => route.abort());
  await page.addInitScript(s => localStorage.setItem('ripify.save.v1', JSON.stringify(s)), seed);
  await ready(page); await desk(page);
  await expect(page.locator('[data-card] .missing-card-image')).toBeVisible();
  await expect(page.locator('[data-card] .missing-card-image strong')).toHaveText('Image unavailable');
  await expect(page.locator('[data-card] .exact-card-image')).toBeHidden();
  expect(await page.locator('[data-card]').innerHTML()).not.toContain('data:image');
  expect((await save(page)).opening.index).toBe(1);
  await page.locator('[data-next]').click(); await expect(page.locator('[data-card]')).toHaveAttribute('data-index', '2');
});

test('UPC uses the reusable box and resolves its own fixed contents', async ({ page }) => {
  test.setTimeout(60000); const seed = newSave(); seed.settings.graphics = 'Low';
  seed.sealedProducts.push(createSealed(PRODUCTS.find(p => p.code === '151-upc')!, 110));
  await page.addInitScript(s => { if (!localStorage.getItem('ripify.save.v1')) localStorage.setItem('ripify.save.v1', JSON.stringify(s)); }, seed);
  await ready(page); await desk(page); await page.locator('[data-container]').click();
  await page.locator('[data-action]').click(); await expect(page.locator('.container-canvas')).toHaveAttribute('data-phase', 'contents');
  await expect(page.locator('.container-canvas')).toHaveAttribute('data-promo-count', '3');
  await expect(page.locator('.container-warning')).toContainText('Metal Mew ex artwork unavailable');
  await page.waitForTimeout(500); await page.screenshot({ path: 'artifacts/upc-contents.png' });
  await page.locator('[data-action]').click(); await expect(page.locator('.container-canvas')).toHaveCount(0); const received = await save(page);
  expect(received.packs).toHaveLength(17); expect(received.cards.map((c: {cardId: string, finish: string}) => [c.cardId, c.finish])).toEqual([['svp-052', 'holo'], ['svp-053', 'holo'], ['sv03.5-205', 'metal']]);
  expect(received.opening).toBeNull(); expect(received.productReceipts).toHaveLength(1);
  await page.reload(); expect((await save(page)).packs).toHaveLength(17); expect((await save(page)).cards).toHaveLength(3);
});
