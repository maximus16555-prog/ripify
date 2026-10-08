import { test, expect, type Page } from '@playwright/test';
import { GameStore } from '../../src/core/store';
import { ComputerServices } from '../../src/core/computer';
import { createCard, seeded } from '../../src/core/inventory';
import { makeDefect } from '../../src/core/rare-events';
import { SAVE_KEY } from '../../src/core/save';
import { layoutPackages } from '../../src/core/delivery';
import type { Save } from '../../src/core/types';

import { saved, approachPackages, takePackage } from '../fixtures/shipping-gameplay';
test('one order: real cardboard, cancelled drag, physical flaps, exact sealed items, interrupted opening and reload', async ({ page }, info) => {
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} }), services = new ComputerServices(store);
  store.state.currency = 1000; store.state.computer!.minute = 570; store.state.settings.controlsLearned = true;
  services.checkout({ '151-booster': 2, '151-etb': 1, '151-upc': 1 }); const items = structuredClone(store.state.computer!.orders[0].items);
  store.state.computer!.minute += 60; services.advance(); const state = structuredClone(store.state), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ key, state }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { key: SAVE_KEY, state });
  await page.goto('/'); await approachPackages(page); await page.screenshot({ path: 'artifacts/shipping-one-room.png' }); await page.keyboard.press('e');
  const canvas = page.locator('.shipping-canvas'); await expect(canvas).toHaveAttribute('data-ready', 'true'); await expect(canvas).toHaveAttribute('data-phase', 'tape');
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + rect.width * .5, rect.y + rect.height * .5); await page.mouse.down(); await page.mouse.move(rect.x + rect.width * .5 + 55, rect.y + rect.height * .5, { steps: 12 }); await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-progress', '0'); expect((await saved(page)).shippingPackages![0].stage).toBe('sealed');
  await page.screenshot({ path: 'artifacts/shipping-sealed.png' });
  await page.locator('[data-shipping-action]').click(); await expect(canvas).toHaveAttribute('data-phase', 'flaps');
  await page.keyboard.press('Escape'); await page.reload(); await approachPackages(page); await page.keyboard.press('e');
  await expect(canvas).toHaveAttribute('data-ready', 'true'); await expect(canvas).toHaveAttribute('data-phase', 'flaps');
  await page.mouse.move(rect.x + rect.width * .5, rect.y + rect.height * .5); await page.mouse.down(); await page.mouse.move(rect.x + rect.width * .5, rect.y + rect.height * .5 - 225, { steps: 18 }); await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-phase', 'contents'); expect((await saved(page)).packs).toHaveLength(1);
  expect(JSON.parse((await canvas.getAttribute('data-item-uids'))!)).toEqual(items.map(i => i.uid));
  await page.screenshot({ path: 'artifacts/shipping-open-products.png' });
  await page.locator('[data-shipping-orbit="1"]').click(); await page.screenshot({ path: 'artifacts/shipping-open-angled.png' });
  await page.locator('[data-shipping-action]').click(); await expect(canvas).toHaveCount(0);
  const after = await saved(page); expect(after.packs).toHaveLength(3); expect(after.sealedProducts).toHaveLength(2); expect(after.cards).toHaveLength(0); expect(after.opening).toBeNull();
  for (const item of items) expect([...after.packs, ...after.sealedProducts].find(i => i.uid === item.uid)).toEqual(item);
  await page.reload(); await expect(page.locator('.loading')).toHaveCount(0); expect((await saved(page)).shippingPackages![0].stage).toBe('claimed'); expect((await saved(page)).packs).toEqual(after.packs); expect(errors).toEqual([]);
  await info.attach('shipping-one-order', { body: JSON.stringify({ uid: after.shippingPackages![0].uid, exactItems: items.map(i => i.uid), retainedSealed: true, reload: true, errors }), contentType: 'application/json' });
});
test('mixed sizes and grading returns: multiple neat stacks, real slabs, exact fulfillment, no duplicates after refresh', async ({ page }, info) => {
  test.setTimeout(180000);
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} }), services = new ComputerServices(store); store.state.currency = 10000; store.state.computer!.minute = 570; store.state.settings.controlsLearned = true;
  for (let i = 0; i < 10; i++) services.checkout({ [i % 3 === 0 ? '151-upc' : i % 3 === 1 ? '151-etb' : '151-booster']: 1 });
  const raw = createCard('me02.5-276', 'real-pull', seeded(21), 'holo', 'pack'); raw.misprint = { version: 1, modifier: 30, origin: 'individual', packUid: raw.source, defect: makeDefect(seeded(9)) }; store.state.cards.push(raw);
  const normal = createCard('sv03.5-026', 'real-pull', seeded(22), 'holo', 'pack'); store.state.cards.push(normal); store.submit(raw.uid, 'BGS', 'Standard'); store.submit(normal.uid, 'PSA', 'Standard');
  const orders = structuredClone(store.state.orders), now = Math.max(...orders.map(o => o.dueAt)); store.state.computer!.minute += 60; store.arriveDeliveries(now);
  const state = structuredClone(store.state), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ key, state, now }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); Date.now = () => now + 1; }, { key: SAVE_KEY, state, now });
  await page.goto('/'); await approachPackages(page); await expect(page.locator('.game-canvas')).toHaveAttribute('data-delivery-count', '12'); await page.screenshot({ path: 'artifacts/shipping-mixed-stacks.png' });
  await page.reload(); await approachPackages(page); expect((await saved(page)).shippingPackages).toEqual(state.shippingPackages);
  const claimed: string[] = [], levels: number[] = [];
  for (let i = 0; i < 12; i++) {
    await expect(page.locator('.interaction-prompt')).toContainText('Open Package'); await page.keyboard.press('e');
    const canvas = page.locator('.shipping-canvas'); await expect(canvas).toHaveAttribute('data-ready', 'true'); const uid = (await canvas.getAttribute('data-package-uid'))!, box = (await saved(page)).shippingPackages!.find(p => p.uid === uid)!;
    levels.push(layoutPackages((await saved(page)).shippingPackages!).find(p => p.uid === uid)!.level);
    expect(claimed).not.toContain(uid); claimed.push(uid);
    for (const phase of ['flaps', 'contents']) { await page.locator('[data-shipping-action]').click(); await expect(canvas).toHaveAttribute('data-phase', phase); }
    if (box.source === 'grading') { await page.screenshot({ path: `artifacts/shipping-${orders.find(o => o.uid === box.orderUids[0])!.grader.toLowerCase()}-return.png` }); expect(JSON.parse((await canvas.getAttribute('data-item-uids'))!)).toEqual(box.itemUids); }
    await page.locator('[data-shipping-action]').click(); await expect(canvas).toHaveCount(0); await page.waitForTimeout(700);
    if (i < 11 && !(await page.locator('.interaction-prompt').textContent())?.includes('Open Package')) { await page.keyboard.down('a'); try { await expect(page.locator('.interaction-prompt')).toContainText('Open Package', { timeout: 15000 }); } finally { await page.keyboard.up('a'); } }
  }
  const after = await saved(page); expect(after.shippingPackages!.every(p => p.stage === 'claimed')).toBe(true); expect(after.orders).toHaveLength(0); expect(after.cards).toHaveLength(2);
  expect(after.cards.find(c => c.uid === raw.uid)!.condition).toEqual(raw.condition); expect(after.cards.find(c => c.uid === raw.uid)!.misprint).toEqual(raw.misprint);
  for (const o of orders) { const card = after.cards.find(c => c.uid === o.cardUid)!; expect(card.grade).toBe(o.result); expect(card.grader).toBe(o.grader); expect(card.gradingHistory).toHaveLength(1); }
  const exactItems = state.computer!.orders.flatMap(o => o.items); for (const item of exactItems) expect([...after.packs, ...after.sealedProducts].find(i => i.uid === item.uid)).toEqual(item);
  expect(new Set([...after.packs, ...after.sealedProducts, ...after.cards].map(i => i.uid)).size).toBe(after.packs.length + after.sealedProducts.length + after.cards.length);
  await page.screenshot({ path: 'artifacts/shipping-cleared-floor.png' }); await page.reload(); await expect(page.locator('.loading')).toHaveCount(0); expect((await saved(page)).cards).toEqual(after.cards); expect((await saved(page)).shippingPackages).toEqual(after.shippingPackages); expect(errors).toEqual([]);
  await info.attach('shipping-mixed', { body: JSON.stringify({ packages: claimed, levelsOpened: levels, exactCards: after.cards, items: exactItems.map(i => i.uid), errors }), contentType: 'application/json' });
});
