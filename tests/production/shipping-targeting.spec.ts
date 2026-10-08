import { test, expect, type Page } from '@playwright/test';
import { GameStore } from '../../src/core/store';
import { ComputerServices } from '../../src/core/computer';
import { SAVE_KEY } from '../../src/core/save';
import { layoutPackages } from '../../src/core/delivery';
import { saved, approachPackages } from '../fixtures/shipping-gameplay';

async function pointAtLevel(page: Page, level: number) {
  const candidates = new Set(layoutPackages((await saved(page)).shippingPackages!).filter(p => p.level === level).map(p => p.uid));
  for (const step of [16, 8]) for (let y = 490; y <= 760; y += step) for (let x = 580; x <= 810; x += step) {
    await page.mouse.move(x, y); await page.waitForTimeout(18);
    const uid = await page.locator('.interaction-prompt').getAttribute('data-package-uid');
    if (uid && candidates.has(uid)) return uid;
  }
  throw Error(`Could not point at physical package on level ${level}`);
}
test('point at exact top, middle and bottom boxes; pile settles, render context is reused and reload preserves contents', async ({ page }, info) => {
  test.setTimeout(180000);
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} }), services = new ComputerServices(store);
  store.state.currency = 1000; store.state.computer!.minute = 570; store.state.settings.controlsLearned = true;
  for (let i = 0; i < 4; i++) services.checkout({ '151-booster': 1 }); store.state.computer!.minute += 60; services.advance(); const state = structuredClone(store.state);
  await page.addInitScript(({ key, state }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
    const contexts = new WeakSet<object>(), stats = { contexts: 0, draws: 0 }; (window as any).shippingPerf = stats;
    const original = HTMLCanvasElement.prototype.getContext; (HTMLCanvasElement.prototype as any).getContext = function(...args: any[]) { const ctx = (original as any).apply(this, args); if (ctx && String(args[0]).startsWith('webgl') && !contexts.has(ctx)) { contexts.add(ctx); stats.contexts++; } return ctx; };
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype] as any[]) for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) if (proto[name]) { const original = proto[name]; proto[name] = function(...args: any[]) { stats.draws++; return original.apply(this, args); }; }
  }, { key: SAVE_KEY, state });
  await page.goto('/'); await approachPackages(page); const opened: { uid: string; level: number }[] = [];
  for (const level of [3, 1, 0]) {
    const uid = await pointAtLevel(page, level); await page.screenshot({ path: `artifacts/shipping-target-level-${level}.png` }); await page.keyboard.press('e');
    await expect(page.locator('.shipping-canvas')).toHaveAttribute('data-package-uid', uid); await expect(page.locator('.shipping-canvas')).toHaveAttribute('data-ready', 'true');
    const before = await page.evaluate(() => ({ ...(window as any).shippingPerf })); await page.waitForTimeout(500); const idle = await page.evaluate(() => ({ ...(window as any).shippingPerf })); expect(idle.draws - before.draws).toBe(0);
    for (const phase of ['flaps', 'contents']) { await page.locator('[data-shipping-action]').click(); await expect(page.locator('.shipping-canvas')).toHaveAttribute('data-phase', phase); }
    await page.locator('[data-shipping-action]').click(); await expect(page.locator('.shipping-canvas')).toHaveCount(0); await page.waitForTimeout(900); opened.push({ uid, level });
  }
  const final = await saved(page); expect(final.packs).toHaveLength(4); expect(final.shippingPackages!.filter(p => p.stage !== 'claimed')).toHaveLength(1); expect(await page.evaluate(() => (window as any).shippingPerf.contexts)).toBe(2);
  await page.screenshot({ path: 'artifacts/shipping-one-remaining.png' }); await page.reload(); await expect(page.locator('.loading')).toHaveCount(0); expect((await saved(page)).shippingPackages).toEqual(final.shippingPackages); expect((await saved(page)).packs).toEqual(final.packs);
  await info.attach('shipping-targeting', { body: JSON.stringify({ opened, contextsCreated: 2, idleDraws: 0, persistentRemaining: 1 }), contentType: 'application/json' });
});
