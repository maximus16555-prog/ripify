import { test, expect } from '@playwright/test';
import { newSave, SAVE_KEY } from '../../src/core/save';
import type { OwnedCard } from '../../src/core/types';

test('real common, energy, ex and chase cards remain clean front/back in gameplay', async ({ page }) => {
  test.setTimeout(120000);
  const state = newSave(), errors: string[] = [];
  state.settings.controlsLearned = true;
  state.cards = ['sve-1', 'sv03.5-001', 'sv03.5-006', 'sv03.5-199'].map((cardId, i): OwnedCard => ({ uid: `edge-audit-${i}`, cardId, condition: { centering: 91, corners: 87, edges: 87, surface: 87, print: 96 }, acquiredAt: 100, source: 'fixture', favorite: false, status: 'raw', owner: 'local-player', finish: i > 1 ? 'holo' : 'normal', origin: 'pack' }));
  state.cards.push({ ...state.cards[3], uid: 'edge-audit-slab', status: 'graded', grader: 'PSA', grade: 9 });
  state.displays = [state.cards[0].uid, state.cards[4].uid, null];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state, key: SAVE_KEY });
  await page.goto('/'); await expect(page.locator('.game-canvas')).toBeVisible();
  await expect(page.locator('.loading')).toHaveCount(0);
  await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack', { timeout: 15000 }); await page.waitForTimeout(700); } finally { await page.keyboard.up('w'); }
  await page.keyboard.down('d');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Binder', { timeout: 15000 }); } finally { await page.keyboard.up('d'); }
  await page.keyboard.press('e');
  await expect(page.locator('.crack-damage-overlay')).toHaveCount(0);
  const papers = await page.locator('.real-card .card-paper').evaluateAll(nodes => nodes.map(n => ({ background: getComputedStyle(n).backgroundColor, gradient: getComputedStyle(n).backgroundImage })));
  expect(papers).toHaveLength(state.cards.length);
  expect(papers.every(p => p.background === 'rgba(0, 0, 0, 0)' && p.gradient === 'none')).toBe(true);
  await expect(page.locator('.real-card .exact-card-image.image-loading')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('.real-card .exact-card-image[hidden]')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/clean-binder-cards.png' });
  for (const card of state.cards) {
    await page.locator(`[data-inspect="${card.uid}"]`).click();
    const canvas = page.locator('.physical-card-canvas');
    await expect(canvas).toHaveAttribute('data-front-image', 'ready');
    await expect(canvas).toHaveAttribute('data-back-image', 'ready');
    await canvas.screenshot({ path: `artifacts/clean-${card.uid}-front.png` });
    await page.locator('[data-flip]').click(); await expect(canvas).toHaveAttribute('data-side', 'back');
    await page.waitForTimeout(150);
    await canvas.screenshot({ path: `artifacts/clean-${card.uid}-back.png` });
    await canvas.focus(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    await canvas.screenshot({ path: `artifacts/clean-${card.uid}-angled.png` });
    await page.locator('[data-back]').click();
  }
  await page.reload(); await expect(page.locator('.game-canvas')).toBeVisible();
  const persisted = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(persisted.cards).toEqual(state.cards); expect(persisted.displays).toEqual(state.displays);
  expect(errors).toEqual([]);
});
