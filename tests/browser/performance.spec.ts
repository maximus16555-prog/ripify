import { test, expect, type Page } from '@playwright/test';
import { newSave } from '../../src/core/save';
import type { OwnedCard } from '../../src/core/types';

const raw: OwnedCard = { uid: 'performance-raw', cardId: 'sve-1', condition: { centering: 90, corners: 80, edges: 85, surface: 90, print: 95 }, status: 'raw', favorite: false, acquiredAt: 0, source: 'test', finish: 'normal', origin: 'pack', owner: 'local-player' };
const graded: OwnedCard = { ...raw, uid: 'performance-graded', cardId: 'sve-2', status: 'graded', grader: 'BGS', grade: 9, subgrades: [9, 9, 9, 9] };

test('frozen menus render on invalidation; preview reuse stays bounded and keeps raw/slab identity', async ({ page }) => {
  test.setTimeout(90000);
  const seed = newSave(); seed.settings.graphics = 'Low'; seed.settings.controlsLearned = true; seed.cards = [raw, graded]; seed.displays = [raw.uid, graded.uid, null];
  await page.addInitScript(state => {
    localStorage.setItem('ripify.save.v1', JSON.stringify(state));
    const probe = (window as unknown as { __performanceTest: { contexts: number; worldDraws: number; previewDraws: number; previewProgramChecks: number } }).__performanceTest = { contexts: 0, worldDraws: 0, previewDraws: 0, previewProgramChecks: 0 };
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      const result = get.apply(this, [type, ...args] as Parameters<typeof get>);
      if (type === 'webgl2' && result) {
        const gl = result as WebGL2RenderingContext & { __counted?: boolean };
        if (!gl.__counted) {
          gl.__counted = true; probe.contexts++; const canvas = this;
          const draw = gl.drawElements.bind(gl);
          gl.drawElements = (...values) => { if (canvas.classList.contains('game-canvas')) probe.worldDraws++; else probe.previewDraws++; return draw(...values); };
          const log = gl.getProgramInfoLog.bind(gl);
          gl.getProgramInfoLog = program => { if (!canvas.classList.contains('game-canvas')) probe.previewProgramChecks++; return log(program); };
        }
      }
      return result;
    } as typeof get;
  }, seed);
  const probe = () => page.evaluate(() => (window as unknown as { __performanceTest: { contexts: number; worldDraws: number; previewDraws: number; previewProgramChecks: number } }).__performanceTest);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('.loading')).toHaveCount(0);
  await page.keyboard.down('w');
  try { await expect.poll(() => page.evaluate(() => (window as unknown as { __ripifyDebug: { position: number[] } }).__ripifyDebug.position[2]), { timeout: 15000 }).toBeLessThan(-1.35); }
  finally { await page.keyboard.up('w'); }
  await page.keyboard.down('d');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Binder', { timeout: 15000 }); }
  finally { await page.keyboard.up('d'); }
  await page.keyboard.press('e'); await page.waitForTimeout(800);
  const frozen = (await probe()).worldDraws; await page.waitForTimeout(700); expect((await probe()).worldDraws).toBe(frozen);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(async () => (await probe()).worldDraws).toBeGreaterThan(frozen);
  await page.waitForTimeout(300); const resized = (await probe()).worldDraws; await page.waitForTimeout(500); expect((await probe()).worldDraws).toBe(resized);
  const cdp = await page.context().newCDPSession(page);
  let warmListeners = 0;
  let warmPrograms = 0;
  for (let cycle = 0; cycle < 12; cycle++) {
    const owned = cycle % 2 ? raw : graded;
    await page.locator(`[data-inspect="${owned.uid}"]`).click();
    const canvas = page.locator('.physical-card-canvas');
    await expect(canvas).toHaveAttribute('data-front-image', 'ready'); await expect(canvas).toHaveAttribute('data-back-image', 'ready');
    await expect(canvas).toHaveAttribute('data-kind', owned.status === 'graded' ? 'slab' : 'raw');
    if (owned.status === 'raw') await expect(canvas).not.toHaveAttribute('data-cert');
    await page.locator('[data-flip]').click(); await expect(canvas).toHaveAttribute('data-side', 'back');
    if (owned.status === 'raw') await expect(page.locator('.physical-card-caption')).toHaveText('Back');
    await page.locator('[data-back]').click();
    expect((await probe()).contexts).toBe(2);
    if (cycle === 1) warmPrograms = (await probe()).previewProgramChecks;
    else if (cycle > 1) expect((await probe()).previewProgramChecks).toBe(warmPrograms);
    if (cycle === 1 || cycle === 11) {
      await page.waitForTimeout(500); // Let detached DOM image decode callbacks finish.
      await cdp.send('HeapProfiler.collectGarbage');
      const dom = await cdp.send('Memory.getDOMCounters');
      if (cycle === 1) warmListeners = dom.jsEventListeners;
      else expect(dom.jsEventListeners).toBeLessThanOrEqual(warmListeners + 2);
    }
  }
  const resting = await probe(); await page.waitForTimeout(600);
  expect((await probe()).worldDraws).toBe(resting.worldDraws); expect((await probe()).previewDraws).toBe(resting.previewDraws);
  expect(errors).toEqual([]);
});

test('lazy room cache plateaus across repeat visits and preserves displayed owned copies', async ({ page }) => {
  test.setTimeout(120000);
  const seed = newSave(); seed.settings.graphics = 'Low'; seed.settings.controlsLearned = true;
  seed.cards = [raw, graded]; seed.displays = [raw.uid, graded.uid, null];
  await page.addInitScript(state => {
    if (!localStorage.getItem('ripify.save.v1')) localStorage.setItem('ripify.save.v1', JSON.stringify(state));
  }, seed);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const resources = () => page.evaluate(() => {
    const debug = (window as unknown as { __ripifyDebug: { geometries: number; textures: number; displays: { uid: string; kind: string }[][] } }).__ripifyDebug;
    return { geometries: debug.geometries, textures: debug.textures, displays: debug.displays };
  });
  async function walkUntil(key: string, condition: (page: Page) => Promise<void>) {
    await page.keyboard.down(key);
    try { await condition(page); } finally { await page.keyboard.up(key); }
    await page.waitForTimeout(180);
  }
  await page.goto('/'); await expect(page.locator('.loading')).toHaveCount(0);
  const cdp = await page.context().newCDPSession(page);
  let warm: Awaited<ReturnType<typeof resources>> | undefined;
  let warmListeners = 0;
  for (let cycle = 0; cycle < 4; cycle++) {
    await walkUntil('a', async p => { await expect(p.locator('.interaction-prompt')).toContainText('Enter Card Shop'); });
    await page.keyboard.press('e'); await expect(page.locator('[data-location]')).toHaveText('Corner Card Shop');
    await walkUntil('a', async p => {
      await p.waitForFunction(() => (window as unknown as { __ripifyDebug: { position: number[] } }).__ripifyDebug.position[0] <= -3.4);
    });
    await walkUntil('w', async p => { await expect(p.locator('.interaction-prompt')).toContainText('Return Home'); });
    await page.keyboard.press('e'); await expect(page.locator('[data-location]')).toHaveText('Your room');
    await page.waitForTimeout(700);
    const current = await resources();
    expect(current.displays[0][0]).toMatchObject({ uid: raw.uid, kind: 'raw-card' });
    expect(current.displays[1][0]).toMatchObject({ uid: graded.uid, kind: 'graded-card' });
    await cdp.send('HeapProfiler.collectGarbage');
    const dom = await cdp.send('Memory.getDOMCounters');
    if (!warm) { warm = current; warmListeners = dom.jsEventListeners; }
    else {
      expect(current.geometries).toBe(warm.geometries);
      expect(current.textures).toBe(warm.textures);
      expect(dom.jsEventListeners).toBeLessThanOrEqual(warmListeners + 2);
    }
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ripify.save.v1')!));
    expect(saved.cards).toEqual(seed.cards); expect(saved.displays).toEqual(seed.displays);
  }
  expect(errors).toEqual([]);
});
