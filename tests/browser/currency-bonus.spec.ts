import { test, expect } from '@playwright/test';
import { newSave } from '../../src/core/save';

test('unlisted currency shortcut grants once per press and persists across reload', async ({ page }) => {
  const seed = newSave(); seed.settings.graphics = 'Low'; seed.settings.controlsLearned = true;
  await page.addInitScript(s => { if (!localStorage.getItem('ripify.save.v1')) localStorage.setItem('ripify.save.v1', JSON.stringify(s)); }, seed);
  await page.goto('/');
  await expect(page.locator('[data-currency]')).toHaveText('120.00');
  await page.keyboard.press('Control+x');
  await page.keyboard.press('Shift+x');
  await expect(page.locator('[data-currency]')).toHaveText('120.00');
  await page.keyboard.press('Control+Shift+x');
  await expect(page.locator('[data-currency]')).toHaveText('130.00');
  await page.keyboard.down('Control'); await page.keyboard.down('Shift');
  await page.keyboard.down('x'); await page.keyboard.down('x'); await page.keyboard.down('x');
  await expect(page.locator('[data-currency]')).toHaveText('140.00');
  await page.keyboard.up('x'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await page.keyboard.press('Escape'); // Shortcut remains available while exploration input is paused.
  await page.keyboard.press('Control+Shift+x');
  await expect(page.locator('[data-currency]')).toHaveText('150.00');
  await page.reload();
  await expect(page.locator('[data-currency]')).toHaveText('150.00');
});
