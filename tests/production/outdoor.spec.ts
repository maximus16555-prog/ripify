import { test, expect, type Page } from '@playwright/test';
import { newSave, SAVE_KEY } from '../../src/core/save';

async function walk(page: Page, key: string, prompt: string) {
  await page.keyboard.down(key);
  try { await expect(page.locator('.interaction-prompt')).toContainText(prompt, { timeout: 15000 }); }
  finally { await page.keyboard.up(key); }
}
async function move(page: Page, key: string, ms: number) {
  await page.keyboard.down(key); try { await page.waitForTimeout(ms); } finally { await page.keyboard.up(key); }
}

test('walk outside, explore beyond room bounds, return and use the bedroom computer', async ({ page }, info) => {
  const state = newSave(); state.settings.controlsLearned = true;
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state, key: SAVE_KEY });
  await page.goto('/'); await expect(page.locator('.loading')).toHaveCount(0); await expect(page.locator('.game-canvas')).toBeVisible();
  await walk(page, 'a', 'Go Outside'); await page.keyboard.press('e');
  await expect(page.locator('[data-location]')).toHaveText('Outside'); await expect(page.locator('#app')).not.toHaveClass(/world-transition/);
  await page.screenshot({ path: 'artifacts/outdoor-spawn.png' });
  await move(page, 'w', 3000);
  // Use the existing drag camera to inspect the house, then restore its heading.
  await page.mouse.move(40, 450); await page.mouse.down({ button: 'right' });
  await page.mouse.move(1296, 450, { steps: 20 }); await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(700); await page.screenshot({ path: 'artifacts/outdoor-house.png' });
  await page.mouse.down({ button: 'right' }); await page.mouse.move(40, 450, { steps: 20 }); await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(300); await move(page, 'd', 3000);
  const explored = await page.evaluate(() => (window as any).__ripifyDebug);
  if (explored) { expect(explored.position[0]).toBeGreaterThan(6); expect(explored.position[2]).toBeLessThan(-5); expect(explored.grounded).toBe(true); }
  await page.screenshot({ path: 'artifacts/outdoor-baseplate.png' });
  await page.keyboard.press('Space'); await page.waitForTimeout(1100);
  await move(page, 'a', 3000); await walk(page, 's', 'Go Inside');
  await move(page, 's', 1900);
  const atWall = await page.evaluate(() => (window as any).__ripifyDebug);
  if (atWall) { expect(atWall.position[2]).toBeLessThan(4.73); expect(atWall.position[1]).toBe(0); }
  await move(page, 'w', 900); await expect(page.locator('.interaction-prompt')).toContainText('Go Inside');
  await page.screenshot({ path: 'artifacts/outdoor-entrance.png' });
  await page.keyboard.press('e'); await expect(page.locator('[data-location]')).toHaveText('Your room');
  await expect(page.locator('#app')).not.toHaveClass(/world-transition/);
  // Return spawn faces into the room: left now leads towards the desk/computer.
  await walk(page, 'a', 'Use Computer'); await page.keyboard.press('e');
  await expect(page.locator('.pc-monitor')).toBeVisible(); await expect(page.locator('[data-app="grading"]')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('.pc-monitor')).toHaveCount(0);
  await page.reload(); await expect(page.locator('.loading')).toHaveCount(0);
  // Repeated visits use cached scenes; held/repeated E cannot bounce between doors.
  const cachedGeometryCounts: number[] = [];
  for (let i = 0; i < 2; i++) {
    await walk(page, i === 0 ? 'a' : 's', 'Go Outside'); await page.keyboard.press('e');
    await expect(page.locator('[data-location]')).toHaveText('Outside');
    await page.waitForTimeout(250);
    const cached = await page.evaluate(() => (window as any).__ripifyDebug);
    if (cached) cachedGeometryCounts.push(cached.geometries);
    await walk(page, 's', 'Go Inside'); await page.keyboard.down('e');
    await expect(page.locator('[data-location]')).toHaveText('Your room');
    await page.waitForTimeout(400); await page.keyboard.up('e');
    await expect(page.locator('[data-location]')).toHaveText('Your room');
  }
  if (cachedGeometryCounts.length) expect(cachedGeometryCounts[1]).toBe(cachedGeometryCounts[0]);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(saved.cards).toEqual(state.cards); expect(saved.packs).toEqual(state.packs); expect(saved.currency).toBe(state.currency);
  expect(errors).toEqual([]);
  await info.attach('outdoor-gameplay', { body: JSON.stringify({ url: page.url(), explored, cachedGeometryCounts, cycles: 3, computerAfterReturn: true, inventoryUnchanged: true, errors }), contentType: 'application/json' });
});
