import { test, expect, type Page } from '@playwright/test';
import { newSave } from '../../src/core/save';
import { CARD_BY_ID } from '../../src/data/cards';
import { SPECIAL_LINES } from '../../src/core/rare-events';
import type { Save } from '../../src/core/types';

const saved = (page: Page): Promise<Save> => page.evaluate(() => JSON.parse(localStorage.getItem('ripify.save.v1')!));
async function ready(page: Page) {
  await expect(page.locator('.game-canvas')).toBeVisible();
  await expect(page.locator('.loading')).toHaveCount(0);
}
async function desk(page: Page) {
  await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack', { timeout: 15000 }); }
  finally { await page.keyboard.up('w'); }
  await page.keyboard.press('e');
}
async function reveal(page: Page, set: string) {
  const cards = (await saved(page)).opening!.cards;
  const seam = (await page.locator('[data-tear]').boundingBox())!;
  await page.mouse.move(seam.x + 12, seam.y + seam.height / 2); await page.mouse.down();
  await page.mouse.move(seam.x + seam.width + 3, seam.y + seam.height / 2, { steps: 20 }); await page.mouse.up();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-index', '0');
  for (let i = 0; i < cards.length; i++) {
    await expect(page.locator('[data-card]')).toHaveAttribute('data-index', String(i));
    const definition = CARD_BY_ID.get(cards[i].cardId)!;
    expect([set, 'sve']).toContain(definition.setCode);
    await expect(page.locator('[data-card] .exact-card-image')).toHaveAttribute('src', definition.image!);
    await expect.poll(() => page.locator('[data-card] .exact-card-image').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    if (i === 1) await page.screenshot({ path: `artifacts/hosted-shortcut-${set}.png` });
    // One manual action per card; no timed progression, including while idle.
    if (i === 0) { await page.waitForTimeout(300); expect((await saved(page)).opening!.index).toBe(0); }
    await page.locator('[data-next]').click();
  }
  await page.locator('[data-collect]').click();
}

test('production hidden shortcuts add one persistent special pack per press and open through normal gameplay', async ({ page }, info) => {
  test.setTimeout(150000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const initial = newSave(); initial.packs = [];
  await page.addInitScript(state => {
    if (!localStorage.getItem('ripify.save.v1')) localStorage.setItem('ripify.save.v1', JSON.stringify(state));
  }, initial);
  await page.goto('/'); await ready(page);
  expect(await page.evaluate(() => '__ripifyDebug' in window)).toBe(false);
  await page.keyboard.press('Control+Digit1'); await page.keyboard.press('Shift+Digit2');
  expect((await saved(page)).packs).toHaveLength(0);
  await page.keyboard.press('Escape'); await page.locator('[data-resume]').focus();
  await page.keyboard.press('Control+Shift+Digit1');
  await expect(page.locator('.toast')).toContainText('151 test pack added');
  const first = (await saved(page)).packs[0];
  expect((await saved(page)).packs).toHaveLength(1);
  expect(first).toMatchObject({ productId: '151-booster', state: 'unopened', rareEvents: { special: { type: 'english-151-demigod' } } });
  await page.evaluate(() => { const input = document.createElement('input'); input.id = 'shortcut-typing'; document.body.append(input); input.focus(); });
  await page.keyboard.press('Control+Shift+Digit2'); expect((await saved(page)).packs).toHaveLength(1);
  await page.evaluate(() => document.querySelector('#shortcut-typing')!.remove());
  await page.locator('[data-resume]').click();
  await page.keyboard.down('Control'); await page.keyboard.down('Shift');
  await page.keyboard.down('Digit2'); await page.keyboard.down('Digit2'); await page.keyboard.down('Digit2');
  await page.keyboard.up('Digit2'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await expect(page.locator('.toast')).toContainText('Ascended Heroes test pack added');
  const state = await saved(page); expect(state.packs).toHaveLength(2);
  expect(state.opening).toBeNull(); expect(state.cards).toHaveLength(0); expect(state.currency).toBe(initial.currency);
  const second = state.packs[1];
  expect(second).toMatchObject({ productId: 'ascended-heroes-booster', state: 'unopened', rareEvents: { special: { type: 'ascended-heroes-god' } } });
  await page.keyboard.press('Control+Shift+Digit1'); expect((await saved(page)).packs).toHaveLength(3);
  await page.reload(); await ready(page); expect((await saved(page)).packs.slice(0, 2)).toEqual([first, second]);
  await desk(page);
  await expect(page.locator('.pack-picker')).not.toContainText(/god|demigod|misprint|debug|test pack/i);
  await page.locator(`[data-pack="${first.uid}"]`).click();
  const opening = (await saved(page)).opening!;
  const event = opening.pack.rareEvents!.special!;
  if (event.type !== 'english-151-demigod') throw new Error('Wrong 151 special event');
  expect(opening.cards.slice(-3).map(c => c.cardId)).toEqual(SPECIAL_LINES[event.line]);
  expect(new Set(opening.cards.map(c => c.cardId)).size).toBe(11);
  await page.keyboard.press('Escape'); await page.reload(); await ready(page); await desk(page);
  expect((await saved(page)).opening!.cards).toEqual(opening.cards);
  await reveal(page, 'sv03.5'); await page.keyboard.press('e');
  await page.locator(`[data-pack="${second.uid}"]`).click();
  const god = (await saved(page)).opening!;
  expect(god.cards.slice(1, 4).map(c => CARD_BY_ID.get(c.cardId)!.rarity)).toEqual(Array(3).fill('Mega attack rare'));
  expect(god.cards.slice(4).map(c => CARD_BY_ID.get(c.cardId)!.rarity)).toEqual(Array(7).fill('Special illustration rare'));
  expect(new Set(god.cards.map(c => c.cardId)).size).toBe(11);
  await reveal(page, 'me02.5');
  expect((await saved(page)).cards).toHaveLength(22); expect((await saved(page)).packs).toHaveLength(1);
  expect((await saved(page)).rareEventStats!.generatedPacks).toBe(0);
  expect(errors).toEqual([]);
  await info.attach('shortcut-report', { body: JSON.stringify({ url: page.url(), errors, heldKeyPackCount: 2, repeatedPressPackCount: 3, saveReload: true, cardsCollected: 22, first: first.rareEvents!.special, second: second.rareEvents!.special }), contentType: 'application/json' });
});
