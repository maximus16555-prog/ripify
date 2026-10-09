import { test, expect, type Page } from '@playwright/test';
import { GameStore } from '../../src/core/store';
import { ComputerServices } from '../../src/core/computer';
import { CARDS } from '../../src/data/cards';
import { createCard, seeded } from '../../src/core/inventory';
import { SAVE_KEY } from '../../src/core/save';

async function computer(page: Page) {
  await expect(page.locator('.game-canvas')).toBeVisible();
  await expect(page.locator('.loading')).toHaveCount(0);
  await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack', { timeout: 15000 }); await page.waitForTimeout(650); }
  finally { await page.keyboard.up('w'); }
  await page.keyboard.down('a');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Use Computer', { timeout: 15000 }); }
  finally { await page.keyboard.up('a'); }
  await page.keyboard.press('e');
  await expect(page.locator('.pc-monitor')).toBeVisible();
}

test('grading previews survive timers, scrolling, selection and unrelated save updates', async ({ page }, info) => {
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} });
  new ComputerServices(store);
  store.state.currency = 1000;
  store.state.settings.controlsLearned = true;
  const definitions = ['sv03.5', 'me02.5'].flatMap(set => CARDS.filter(c => c.setCode === set).slice(0, 24));
  store.state.cards = definitions.map((d, i) => createCard(d.id, 'test-source', seeded(i + 800), 'normal', 'pack'));
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().includes('/artwork/cards/')) requests.push(r.url()); });
  // Delayed image responses make a hidden/recreated image observable instead of masking it with the HTTP cache.
  await page.route('**/artwork/cards/**', async route => { await new Promise(resolve => setTimeout(resolve, 150)); await route.continue(); });
  await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state: store.state, key: SAVE_KEY });
  await page.goto('/'); await computer(page);
  await page.locator('[data-app="grading"]').click();
  await expect(page.locator('.pc-card-grid .pc-item')).toHaveCount(36);
  const content = page.locator('[data-window="grading"] .pc-app-content');
  await content.evaluate(el => { el.scrollTop = 200; });
  const first = page.locator('.pc-card-grid img.exact-card-image').first();
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && !img.classList.contains('image-loading'))).toBe(true);
  await page.evaluate(() => {
    const root = document.querySelector('[data-window="grading"] .pc-app-content')!;
    const originals = [...root.querySelectorAll<HTMLImageElement>('img.exact-card-image')];
    const stats = { addedImages: 0, removedImages: 0, loads: 0 };
    root.addEventListener('load', e => { if ((e.target as Element).matches?.('img.exact-card-image')) stats.loads++; }, true);
    const count = (node: Node) => node instanceof Element ? Number(node.matches('img.exact-card-image')) + node.querySelectorAll('img.exact-card-image').length : 0;
    const observer = new MutationObserver(records => { for (const r of records) { stats.addedImages += [...r.addedNodes].reduce((n, el) => n + count(el), 0); stats.removedImages += [...r.removedNodes].reduce((n, el) => n + count(el), 0); } });
    observer.observe(root, { childList: true, subtree: true });
    (window as any).gradingImages = { originals, stats, observer };
  });
  const beforeRequests = requests.length;
  await page.waitForTimeout(3300);
  const idle = await page.evaluate(() => {
    const { originals, stats } = (window as any).gradingImages;
    return { ...stats, stableNodes: originals.every((img: HTMLImageElement) => img.isConnected), scrollTop: document.querySelector('.pc-app-content')!.scrollTop };
  });
  await info.attach('grading-idle-images', { body: JSON.stringify({ ...idle, requestsDuringIdle: requests.length - beforeRequests }), contentType: 'application/json' });
  expect(idle.removedImages).toBe(0);
  expect(idle.addedImages).toBe(0);
  expect(idle.stableNodes).toBe(true);
  expect(idle.scrollTop).toBe(200);
  // A store notification unrelated to grading must leave the decoded nodes alone.
  await page.keyboard.press('Control+Shift+x'); await page.waitForTimeout(300);
  const selectedUid = (await page.locator('.pc-card-grid .pc-item').nth(5).getAttribute('data-value'))!;
  await page.locator(`[data-action="item"][data-value="${selectedUid}"]`).click();
  await expect(page.locator('[data-action="submit"]')).toHaveAttribute('data-value', selectedUid);
  await page.locator('[data-action="grader"][data-value="BGS"]').click();
  await page.locator('[data-field="service"]').selectOption('Express');
  const retained = await page.evaluate(() => (window as any).gradingImages.originals.every((img: HTMLImageElement) => img.isConnected && document.querySelector('.pc-card-grid')!.contains(img)));
  expect(retained).toBe(true);
  await expect(page.locator('.pc-review')).toContainText('BGS-inspired');
  await expect(first).not.toHaveClass(/image-loading/);
  const loadsAfterSelection = await page.evaluate(() => (window as any).gradingImages.stats.loads);
  expect(loadsAfterSelection).toBe(idle.loads);
  // Browse the remaining page and return; image URLs retain their exact printing mapping.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.pc-card-grid .pc-item')).toHaveCount(12);
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.locator('.pc-card-grid .pc-item')).toHaveCount(36);
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const final = JSON.parse(await page.evaluate(key => localStorage.getItem(key)!, SAVE_KEY));
  expect(final.cards).toEqual(store.state.cards);
  expect(final.orders).toEqual([]);
  expect(errors).toEqual([]);
  expect(requests.length).toBe(new Set(requests).size);
  await page.screenshot({ path: 'artifacts/grading-stable-images.png' });
  await info.attach('grading-image-summary', { body: JSON.stringify({ idle, retainedAcrossSelection: retained, loadsAfterSelection, errors, requests: requests.length, uniqueImageUrls: new Set(requests).size }), contentType: 'application/json' });
});
