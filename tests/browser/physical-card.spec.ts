import { test, expect, type Page } from '@playwright/test';
import { newSave } from '../../src/core/save';
import type { OwnedCard } from '../../src/core/types';

const raw: OwnedCard = { uid: 'render-raw-copy', cardId: 'sve-1', condition: { centering: 91, corners: 74, edges: 68, surface: 63, print: 95 }, acquiredAt: 100, source: '151', favorite: false, status: 'raw', owner: 'local-player', finish: 'normal', origin: 'pack' };
const graded: OwnedCard = { ...raw, uid: 'render-slab-copy', cardId: 'sve-2', status: 'graded', grader: 'BGS', grade: 8.5, subgrades: [9, 8, 8.5, 9], gradingHistory: [{ grader: 'BGS', grade: 8.5, at: 200, orderUid: 'test-order' }] };
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('ripify.save.v1')!));
const displays = (page: Page) => page.evaluate(() => (window as unknown as { __ripifyDebug: { displays: { uid: string; graded: boolean; cert?: string; parts: string[] }[][] } }).__ripifyDebug.displays);
async function walk(page: Page, key: string, prompt: string) {
  await page.keyboard.down(key);
  try { await expect.poll(async () => {
    const bubble = page.locator('.interaction-prompt');
    return await bubble.isVisible() && (await bubble.textContent())!.includes(prompt);
  }, { timeout: 15000, intervals: [60] }).toBe(true); }
  finally { await page.keyboard.up(key); }
  await page.waitForTimeout(160);
}
async function start(page: Page) {
  const seed = newSave(); seed.settings.graphics = 'Low'; seed.settings.controlsLearned = true;
  seed.cards = [raw, graded]; seed.displays = [raw.uid, graded.uid, null];
  await page.addInitScript(s => { if (!localStorage.getItem('ripify.save.v1')) localStorage.setItem('ripify.save.v1', JSON.stringify(s)); }, seed);
  await page.goto('/'); await expect(page.locator('.game-canvas')).toBeVisible();
}
async function coordinate(page: Page, key: string, axis: number, target: number, greater: boolean) {
    await expect.poll(() => page.evaluate(() => (window as unknown as { __ripifyDebug?: unknown }).__ripifyDebug)).toBeTruthy();
    await page.keyboard.down(key);
    try { await expect.poll(async () => {
      const position = await page.evaluate(() => (window as unknown as { __ripifyDebug: { position: number[] } }).__ripifyDebug.position);
      return greater ? position[axis] >= target : position[axis] <= target;
    }, { timeout: 15000, intervals: [60] }).toBe(true); } finally { await page.keyboard.up(key); }
    await page.waitForTimeout(180);
}
async function binder(page: Page) {
  // Approach through open floor to the left of the desk stool. A screenshot
  // waypoint at x=.4 otherwise sends this test straight into that collider.
  await coordinate(page, 's', 2, .5, true); await coordinate(page, 'a', 0, -.1, false);
  await coordinate(page, 'w', 2, -1.9, false); await walk(page, 'd', 'Open Binder'); await page.keyboard.press('e');
}
async function roomShot(page: Page, path: string) {
  await coordinate(page, 'a', 0, .4, false); await coordinate(page, 's', 2, 1.2, true);
  await page.waitForTimeout(350); await page.screenshot({ path });
}

test('raw and slab show distinct front/back/edges throughout a full rotation', async ({ page }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page); await binder(page);
  for (const [owned, prefix] of [[raw, 'raw'], [graded, 'slab']] as const) {
    await page.locator(`[data-inspect="${owned.uid}"]`).click();
    const canvas = page.locator('.physical-card-canvas');
    await expect(canvas).toHaveAttribute('data-front-image', 'ready'); await expect(canvas).toHaveAttribute('data-back-image', 'ready');
    await page.locator('.inspection-card').screenshot({ path: `artifacts/physical-${prefix}-front.png` });
    await canvas.focus();
    for (let turn = 1; turn <= 4; turn++) {
      for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowRight');
      await expect.poll(async () => Number(await canvas.getAttribute('data-yaw'))).toBeCloseTo(turn * Math.PI / 2, 4);
      if (turn === 1 || turn === 2) await page.locator('.inspection-card').screenshot({ path: `artifacts/physical-${prefix}-${turn === 1 ? 'edge' : 'back'}.png` });
    }
    await expect(canvas).toHaveAttribute('data-side', 'front');
    // Pointer drag also rotates the existing model without any inventory transaction.
    const box = (await canvas.boundingBox())!; await page.mouse.move(box.x + 40, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 240, box.y + box.height / 2 + 22, { steps: 8 }); await page.mouse.up();
    await page.locator('[data-reset-view]').click(); await expect(canvas).toHaveAttribute('data-yaw', '0');
    await page.locator('[data-flip]').click(); await expect(canvas).toHaveAttribute('data-side', 'back');
    expect((await saved(page)).cards.find((c: OwnedCard) => c.uid === owned.uid)).toEqual(owned);
    await page.locator('[data-back]').click();
  }
  expect(errors).toEqual([]);
});

test('stand rendering follows the same graded UID across replacement, removal and reload', async ({ page }) => {
  test.setTimeout(120000); await start(page);
  const original = await saved(page), originalDisplays = await displays(page);
  expect(originalDisplays[0][0]).toMatchObject({ uid: raw.uid, graded: false });
  expect(originalDisplays[1][0]).toMatchObject({ uid: graded.uid, graded: true });
  expect(originalDisplays[1][0].parts).toContain('slab-cover-back');
  await binder(page); await page.locator(`[data-inspect="${graded.uid}"]`).click();
  await expect(page.locator('.physical-card-canvas')).toHaveAttribute('data-cert', originalDisplays[1][0].cert!);
  await page.locator('[data-display]').click(); await page.locator('[data-slot="0"]').click();
  expect((await saved(page)).displays).toEqual([graded.uid, null, null]);
  expect((await displays(page))[0][0]).toMatchObject({ uid: graded.uid, graded: true });
  await page.reload(); await expect(page.locator('.game-canvas')).toBeVisible();
  expect((await displays(page))[0][0].cert).toBe(originalDisplays[1][0].cert);
  expect((await saved(page)).cards).toEqual(original.cards);
  await binder(page); await page.keyboard.press('Escape');
  await walk(page, 'd', 'Arrange Display');
  await roomShot(page, 'artifacts/physical-graded-display-room.png');
  await binder(page); await page.keyboard.press('Escape'); await walk(page, 'd', 'Arrange Display');
  await page.keyboard.press('e');
  await page.locator('[data-clear="0"]').click(); expect((await saved(page)).displays).toEqual([null, null, null]);
  expect((await displays(page)).flat()).toHaveLength(0); expect((await saved(page)).cards).toEqual(original.cards);
  await page.locator(`[data-inspect="${raw.uid}"]`).click(); await page.locator('[data-display]').click(); await page.locator('[data-slot="2"]').click();
  expect((await displays(page))[2][0]).toMatchObject({ uid: raw.uid, graded: false });
  await roomShot(page, 'artifacts/physical-display-room.png');
});
