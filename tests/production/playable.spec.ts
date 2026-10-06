import { test, expect, type Page } from '@playwright/test';

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('ripify.save.v1')!));
async function walk(page: Page, key: string, prompt: string) {
  await page.keyboard.down(key);
  try { await expect(page.locator('.interaction-prompt')).toContainText(prompt, { timeout: 15000 }); }
  finally { await page.keyboard.up(key); }
  await expect(page.locator('.interaction-prompt')).toBeVisible();
}
test('production gameplay: room, shop, purchase, manual rip/swipes, collection and persistent refresh', async ({ page }, info) => {
  const errors: string[] = [], requests: string[] = [], failed: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => requests.push(r.url())); page.on('requestfailed', r => failed.push(r.url()));
  await page.addInitScript(() => {
    const contexts: AudioContext[] = []; const Native = window.AudioContext;
    const logs = { starts: 0, contexts }; (window as unknown as { productionAudio: typeof logs }).productionAudio = logs;
    window.AudioContext = class extends Native { constructor(...args: ConstructorParameters<typeof AudioContext>) { super(...args); contexts.push(this); }
      createBufferSource() { const source = super.createBufferSource(), start = source.start.bind(source);
        source.start = (...args) => { logs.starts++; return start(...args); }; return source; }
    };
  });
  await page.goto('/'); await expect(page.locator('.game-canvas')).toBeVisible(); await expect(page.locator('.loading')).toHaveCount(0);
  expect(await page.evaluate(() => '__ripifyDebug' in window)).toBe(false);
  await page.screenshot({ path: 'artifacts/production-room.png' });
  await walk(page, 'a', 'Enter Card Shop'); await page.keyboard.press('e');
  await expect(page.locator('[data-location]')).toHaveText('Corner Card Shop');
  await walk(page, 'd', 'Browse Products'); await page.keyboard.press('e');
  for (const id of ['151-booster', 'ascended-heroes-booster']) await expect(page.locator(`[data-buy="${id}"]`)).toBeEnabled();
  await page.locator('[data-buy="151-booster"]').click();
  const purchase = await saved(page); expect(purchase.packs).toHaveLength(2); expect(purchase.cards).toHaveLength(0);
  expect(purchase.currency).toBeLessThan(120); expect(purchase.opening).toBeNull();
  const purchasedUid = purchase.packs.at(-1).uid;
  const art = page.locator('[data-product="151-booster"] .product-art-image');
  await expect.poll(() => art.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  // Walk along the clear southern aisle, then approach the west exit.
  await page.keyboard.down('a'); await page.waitForTimeout(2400); await page.keyboard.up('a');
  await walk(page, 'w', 'Return Home'); await page.keyboard.press('e');
  await expect(page.locator('[data-location]')).toHaveText('Your room');
  await walk(page, 'w', 'Open Pack'); await page.keyboard.press('e');
  await page.locator(`[data-pack="${purchasedUid}"]`).click();
  const seam = (await page.locator('[data-tear]').boundingBox())!;
  await page.mouse.move(seam.x + 10, seam.y + 20); await page.mouse.down();
  await page.mouse.move(seam.x + seam.width + 3, seam.y + 20, { steps: 20 }); await page.mouse.up();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-index', '0');
  const generated = (await saved(page)).opening.cards; expect(generated.every((c: { cardId: string }) => /^sv03\.5-|^sve-/.test(c.cardId))).toBe(true);
  const images = page.locator('.card-stack .exact-card-image');
  await expect.poll(() => images.evaluateAll(imgs => imgs.every(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.waitForTimeout(400); expect((await saved(page)).opening.index).toBe(0);
  const card = (await page.locator('[data-card]').boundingBox())!;
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2); await page.mouse.down();
  await page.mouse.move(card.x + card.width / 2 + 180, card.y + card.height / 2, { steps: 10 }); await page.mouse.up();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-index', '1'); await expect(page.locator('[data-next]')).toBeEnabled();
  const audio = await page.evaluate(() => { const a = (window as unknown as { productionAudio: { starts: number; contexts: AudioContext[] } }).productionAudio; return { starts: a.starts, state: a.contexts[0]?.state }; });
  expect(audio.state).toBe('running'); expect(audio.starts).toBeGreaterThan(2);
  await page.keyboard.press('Escape'); await page.reload();
  expect((await saved(page)).opening.cards).toEqual(generated); expect((await saved(page)).opening.index).toBe(1);
  await walk(page, 'w', 'Open Pack'); await page.keyboard.press('e');
  for (let i = 2; i < generated.length; i++) { await page.locator('[data-next]').click(); await expect(page.locator('[data-card]')).toHaveAttribute('data-index', String(i)); await expect(page.locator('[data-next]')).toBeEnabled(); }
  await page.locator('[data-next]').click(); await page.locator('[data-collect]').click();
  expect((await saved(page)).cards).toHaveLength(generated.length);
  await page.reload(); expect((await saved(page)).cards).toHaveLength(generated.length); expect((await saved(page)).packs).toHaveLength(1);
  expect(errors).toEqual([]);
  if (new URL(page.url()).protocol === 'https:') expect(requests.filter(url => /^https?:\/\/(localhost|127\.0\.0\.1)/.test(url))).toEqual([]);
  await info.attach('production-report', { body: JSON.stringify({ url: page.url(), errors, failed, uniqueRequests: [...new Set(requests)], audio, packUid: purchasedUid, cardCount: generated.length }, null, 2), contentType: 'application/json' });
});
