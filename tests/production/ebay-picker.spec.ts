import { test, expect, type Page } from '@playwright/test';
import { GameStore } from '../../src/core/store';
import { ComputerServices } from '../../src/core/computer';
import { CARD_BY_ID } from '../../src/data/cards';
import { createCard, createPack, seeded } from '../../src/core/inventory';
import { ownedValue } from '../../src/core/economy';
import { makeDefect } from '../../src/core/rare-events';
import { SAVE_KEY, parseSave } from '../../src/core/save';
import { receiveReturn } from '../fixtures/receive-return';

async function computer(page: Page) {
  await expect(page.locator('.game-canvas')).toBeVisible(); await expect(page.locator('.loading')).toHaveCount(0);
  await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack'); await page.waitForTimeout(650); }
  finally { await page.keyboard.up('w'); }
  await page.keyboard.down('a');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Use Computer'); }
  finally { await page.keyboard.up('a'); }
  await page.keyboard.press('e'); await page.locator('[data-app="ebay"]').click();
}

test('eBay picker sorts authoritative values, combines filters and retains decoded previews', async ({ page }, info) => {
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} });
  new ComputerServices(store); store.state.currency = 1000; store.state.settings.controlsLearned = true;
  const ids = ['sv03.5-001', 'sv03.5-005', 'sv03.5-026', 'sv03.5-173', 'me02.5-276', 'me02.5-284'];
  store.state.cards = Array.from({ length: 44 }, (_, i) => {
    const c = createCard(ids[i % ids.length], 'ebay-picker-fixture', seeded(i + 1200), 'normal', 'pack', 1700000000000 + (44 - i) * 1000);
    const score = [98, 88, 75, 60][i % 4];
    c.condition = { centering: score, corners: score, edges: score, surface: score, print: score };
    if (i === 4 || i === 5) c.misprint = { version: 1, modifier: 30, origin: 'individual', packUid: c.source, defect: makeDefect(seeded(i)) };
    return c;
  });
  const slabUids = store.state.cards.slice(40).map(c => c.uid);
  for (const [i, uid] of slabUids.entries()) {
    store.submit(uid, i < 2 ? 'PSA' : i === 2 ? 'BGS' : 'CGC', 'Standard');
    const order = store.state.orders.at(-1)!; order.result = [9, 10, 9.5, 8][i];
    receiveReturn(store, order.uid, order.dueAt);
  }
  store.state.packs = [createPack()];
  const before = structuredClone(store.state), requests: string[] = [], errors: string[] = [];
  expect(parseSave(JSON.stringify(before)).cards).toHaveLength(44);
  page.on('request', r => { if (r.url().includes('/artwork/cards/')) requests.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state: before, key: SAVE_KEY });
  await page.goto('/'); await computer(page);
  const grid = page.locator('.pc-card-grid .pc-item'), sort = page.getByRole('combobox', { name: 'Sort By', exact: true });
  const filter = page.getByRole('combobox', { name: 'Filter By', exact: true });
  const rows = before.cards.map(c => ({ ...c, d: CARD_BY_ID.get(c.cardId)!, value: ownedValue(c, before.marketSeed) }));
  const compare = {
    value: (a: typeof rows[number], b: typeof rows[number]) => b.value - a.value,
    'value-low': (a: typeof rows[number], b: typeof rows[number]) => a.value - b.value,
    newest: (a: typeof rows[number], b: typeof rows[number]) => b.acquiredAt - a.acquiredAt,
    oldest: (a: typeof rows[number], b: typeof rows[number]) => a.acquiredAt - b.acquiredAt,
    name: (a: typeof rows[number], b: typeof rows[number]) => a.d.name.localeCompare(b.d.name),
    rarity: (a: typeof rows[number], b: typeof rows[number]) => a.d.rarity.localeCompare(b.d.rarity),
  };
  for (const [key, comparator] of Object.entries(compare)) {
    await sort.selectOption(key);
    const expected = [...rows].sort(comparator).map(c => c.uid);
    await expect.poll(() => grid.evaluateAll(tiles => tiles.map(t => (t as HTMLElement).dataset.value))).toEqual(expected.slice(0, 36));
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect.poll(() => grid.evaluateAll(tiles => tiles.map(t => (t as HTMLElement).dataset.value))).toEqual(expected.slice(36));
  }
  await filter.selectOption('raw'); await expect(grid).toHaveCount(36);
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await expect(grid).toHaveCount(4);
  await filter.selectOption('graded'); await expect(grid).toHaveCount(4);
  await filter.selectOption('misprints'); await expect(grid).toHaveCount(2);
  // Both visible misprints must be decoded before reversing their order.
  await expect.poll(() => grid.locator('img').evaluateAll(images => images.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.evaluate(() => { (window as any).ebayImages = [...document.querySelectorAll('.pc-card-grid img')]; });
  const requestCount = requests.length;
  for (const key of ['value', 'value-low', 'newest', 'oldest', 'name', 'rarity']) await sort.selectOption(key);
  expect(await page.evaluate(() => (window as any).ebayImages.every((img: HTMLImageElement) => img.isConnected && !img.classList.contains('image-loading')))).toBe(true);
  expect(requests.length).toBe(requestCount);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as any).ebayImages.every((img: HTMLImageElement) => img.isConnected))).toBe(true);
  await page.locator('[data-ebay-filters] summary').click();
  await filter.selectOption('all');
  const set = page.getByRole('combobox', { name: 'Set', exact: true });
  const condition = page.getByRole('combobox', { name: 'Condition', exact: true });
  const company = page.getByRole('combobox', { name: 'Grading Company', exact: true });
  const grade = page.getByRole('combobox', { name: 'Grade', exact: true });
  await set.selectOption('sv03.5'); await expect(grid).toHaveCount(rows.filter(c => c.d.setCode === 'sv03.5').length);
  await condition.selectOption('worn'); await expect(grid).toHaveCount(rows.filter(c => c.d.setCode === 'sv03.5' && c.condition.surface === 60).length);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await company.selectOption('PSA'); await expect(grid).toHaveCount(2);
  await grade.selectOption('10'); await expect(grid).toHaveCount(1);
  await expect(grid).toHaveAttribute('data-value', slabUids[1]);
  await condition.selectOption('worn'); await expect(grid).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(grid).toHaveCount(36);
  await filter.selectOption('misprints'); await sort.selectOption('value');
  await page.screenshot({ path: 'artifacts/ebay-picker.png' });
  const snapshot = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(snapshot.cards).toEqual(before.cards); expect(snapshot.packs).toEqual(before.packs); expect(snapshot.computer.listings).toEqual([]);
  const target = before.cards[4], market = ownedValue(target, before.marketSeed);
  await page.locator(`[data-action="item"][data-value="${target.uid}"]`).click();
  await expect(page.locator('[data-asking]')).toHaveValue(String(market));
  await page.locator('[data-asking]').fill(String(Math.round(market * .9 * 100) / 100));
  await page.locator('[data-action="list"]').click();
  const listed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(listed.computer.listings[0]).toMatchObject({ itemUid: target.uid, market });
  expect(listed.cards.find((c: any) => c.uid === target.uid).ownershipLock.kind).toBe('ebay');
  await page.getByRole('button', { name: 'Sell an item', exact: true }).click();
  await page.getByRole('button', { name: 'Sealed products', exact: true }).click(); await expect(grid).toHaveCount(1);
  await grid.click(); await expect(page.locator('[data-action="list"]')).toBeEnabled();
  await page.reload(); await expect(page.locator('.loading')).toHaveCount(0);
  const loaded = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(loaded.cards).toEqual(listed.cards); expect(loaded.computer.listings).toEqual(listed.computer.listings);
  expect(errors).toEqual([]);
  await info.attach('ebay-picker', { body: JSON.stringify({ sorts: Object.keys(compare), filters: ['raw', 'graded', 'misprints', 'set', 'condition', 'company', 'grade'], noImageRequestsDuringSort: true, listingPersisted: true, errors }), contentType: 'application/json' });
});
