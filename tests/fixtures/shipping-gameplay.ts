import { expect, type Page } from '@playwright/test';
import { SAVE_KEY } from '../../src/core/save';
import type { Save } from '../../src/core/types';
export const saved = (page: Page): Promise<Save> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
export async function approachPackages(page: Page) {
  await expect(page.locator('.loading')).toHaveCount(0); await expect(page.locator('.game-canvas')).toBeVisible();
  await page.keyboard.down('w'); try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack', { timeout: 15000 }); await page.waitForTimeout(500); } finally { await page.keyboard.up('w'); }
  await page.keyboard.down('a'); try { await expect(page.locator('.interaction-prompt')).toContainText('Open Package', { timeout: 15000 }); } finally { await page.keyboard.up('a'); }
}
export async function takePackage(page: Page) {
  await page.keyboard.press('e'); const canvas = page.locator('.shipping-canvas'); await expect(canvas).toBeVisible(); await expect(canvas).toHaveAttribute('data-ready', 'true');
  const uid = await canvas.getAttribute('data-package-uid');
  for (const phase of ['tape', 'flaps', 'contents']) {
    await expect(canvas).toHaveAttribute('data-phase', phase); await page.locator('[data-shipping-action]').click();
    if (phase !== 'contents') await expect(canvas).toHaveAttribute('data-phase', phase === 'tape' ? 'flaps' : 'contents');
  }
  await expect(canvas).toHaveCount(0); await expect.poll(async () => (await saved(page)).shippingPackages!.find(p => p.uid === uid)!.stage).toBe('claimed'); await page.waitForTimeout(450);
  return uid;
}
