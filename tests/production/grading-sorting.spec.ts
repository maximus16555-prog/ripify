import { test, expect, type Page } from '@playwright/test';
import { GameStore } from '../../src/core/store';
import { ComputerServices } from '../../src/core/computer';
import { CARD_BY_ID } from '../../src/data/cards';
import { createCard, seeded } from '../../src/core/inventory';
import { ownedValue } from '../../src/core/economy';
import { SAVE_KEY } from '../../src/core/save';

async function computer(page: Page) {
  await expect(page.locator('.game-canvas')).toBeVisible();
  await expect(page.locator('.loading')).toHaveCount(0);
  await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack'); await page.waitForTimeout(650); }
  finally { await page.keyboard.up('w'); }
  await page.keyboard.down('a');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Use Computer'); }
  finally { await page.keyboard.up('a'); }
  await page.keyboard.press('e');
  await page.locator('[data-app="grading"]').click();
}

test('all grading sorts use owned-copy values and preserve selection, previews and saves', async ({ page }, info) => {
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} });
  new ComputerServices(store);
  store.state.currency = 1000;
  store.state.settings.controlsLearned = true;
  const ids = ['sv03.5-001', 'sv03.5-005', 'sv03.5-026', 'sv03.5-173', 'me02.5-276', 'me02.5-284'];
  store.state.cards = Array.from({ length: 40 }, (_, i) => {
    const card = createCard(ids[i % ids.length], 'sorting-fixture', seeded(500 + i), 'normal', 'pack', 1700000000000 + (39 - i) * 1000);
    // Identical printings have different physical condition; some equal-valued
    // copies exercise stable ties, while identity and inventory order stay fixed.
    const score = i % 4 === 0 ? 60 : 95;
    card.condition = { centering: score, corners: score, edges: score, surface: score, print: score };
    return card;
  });
  const before = structuredClone(store.state), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state: before, key: SAVE_KEY });
  await page.goto('/'); await computer(page);
  const grid = page.locator('.pc-card-grid .pc-item'), sort = page.getByRole('combobox', { name: 'Sort By', exact: true });
  await expect(sort.locator('option')).toHaveText(['Highest Market Value', 'Lowest Market Value', 'Newest Acquired', 'Oldest Acquired', 'Name (A–Z)', 'Rarity', 'Set']);
  const cards = before.cards.map(c => ({ ...c, definition: CARD_BY_ID.get(c.cardId)!, value: ownedValue(c, before.marketSeed) }));
  const compare = {
    value: (a: typeof cards[number], b: typeof cards[number]) => b.value - a.value,
    'value-low': (a: typeof cards[number], b: typeof cards[number]) => a.value - b.value,
    newest: (a: typeof cards[number], b: typeof cards[number]) => b.acquiredAt - a.acquiredAt,
    oldest: (a: typeof cards[number], b: typeof cards[number]) => a.acquiredAt - b.acquiredAt,
    name: (a: typeof cards[number], b: typeof cards[number]) => a.definition.name.localeCompare(b.definition.name),
    rarity: (a: typeof cards[number], b: typeof cards[number]) => a.definition.rarity.localeCompare(b.definition.rarity),
    set: (a: typeof cards[number], b: typeof cards[number]) => a.definition.set.localeCompare(b.definition.set),
  };
  expect(new Set(cards.filter(c => c.cardId === ids[0]).map(c => c.value)).size).toBeGreaterThan(1);
  await expect(sort).toHaveValue('value');
  const selected = (await grid.first().getAttribute('data-value'))!;
  await grid.first().click();
  await page.locator('[data-action="grader"][data-value="BGS"]').click();
  await page.locator('[data-field="service"]').selectOption('Express');
  await page.evaluate(() => {
    (window as any).sortImages = new Map([...document.querySelectorAll<HTMLElement>('.pc-card-grid .pc-item')].map(tile => [tile.dataset.value, tile.querySelector('img')]));
  });
  let retained = 0;
  for (const [key, comparator] of Object.entries(compare)) {
    await sort.selectOption(key);
    const expected = [...cards].sort(comparator).map(c => c.uid);
    await expect.poll(() => grid.evaluateAll(tiles => tiles.map(tile => (tile as HTMLElement).dataset.value))).toEqual(expected.slice(0, 36));
    await expect(page.locator('[data-action="submit"]')).toHaveAttribute('data-value', selected);
    await expect(page.locator('[data-field="service"]')).toHaveValue('Express');
    await expect(page.locator('.pc-review')).toContainText('BGS-inspired');
    if (key === 'value') {
      await sort.selectOption('value-low');
      const overlap = await page.evaluate(() => {
        const previous: Map<string, HTMLImageElement> = (window as any).sortImages;
        const visible = [...document.querySelectorAll<HTMLElement>('.pc-card-grid .pc-item')].filter(tile => previous.has(tile.dataset.value!));
        return { count: visible.length, retained: visible.every(tile => previous.get(tile.dataset.value!) === tile.querySelector('img')) };
      });
      expect(overlap.retained).toBe(true); expect(overlap.count).toBeGreaterThan(0);
      retained = overlap.count;
      await sort.selectOption('value');
    }
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect.poll(() => grid.evaluateAll(tiles => tiles.map(tile => (tile as HTMLElement).dataset.value))).toEqual(expected.slice(36));
    // Changing sort resets the page instead of leaving the player on a sparse page.
  }
  expect(retained).toBeGreaterThan(0);
  await sort.selectOption('value-low');
  await expect(grid).toHaveCount(36);
  const unchanged = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(unchanged.cards).toEqual(before.cards);
  expect(unchanged.orders).toEqual(before.orders);
  await page.screenshot({ path: 'artifacts/grading-sorting.png' });
  await page.locator('[data-action="submit"]').click();
  const submitted = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(submitted.orders).toHaveLength(1);
  expect(submitted.orders[0]).toMatchObject({ cardUid: selected, grader: 'BGS', service: 'Express' });
  expect(submitted.cards.find((c: any) => c.uid === selected).condition).toEqual(before.cards.find(c => c.uid === selected)!.condition);
  expect(submitted.cards).toHaveLength(40);
  await page.reload(); await expect(page.locator('.loading')).toHaveCount(0);
  const reloaded = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(reloaded.cards).toEqual(submitted.cards);
  expect(reloaded.orders).toEqual(submitted.orders);
  expect(errors).toEqual([]);
  await info.attach('grading-sorting', { body: JSON.stringify({ url: page.url(), sorts: Object.keys(compare), retainedPreviews: retained, selectionPreserved: selected, reloadPreserved: true, errors }), contentType: 'application/json' });
});
