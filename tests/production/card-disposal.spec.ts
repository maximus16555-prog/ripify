import { test, expect, type Page } from '@playwright/test';
import { GameStore } from '../../src/core/store';
import { ComputerServices, portfolioValue } from '../../src/core/computer';
import { createCard, seeded } from '../../src/core/inventory';
import { SAVE_KEY } from '../../src/core/save';
import { makeDefect } from '../../src/core/rare-events';
import { money } from '../../src/core/economy';
import type { Save } from '../../src/core/types';

const saved = (page: Page): Promise<Save> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
async function approach(page: Page, direction: 'd' | 'a', label: string) {
  await expect(page.locator('.game-canvas')).toBeVisible(); await expect(page.locator('.loading')).toHaveCount(0);
  await page.keyboard.down('w'); try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack'); await page.waitForTimeout(650); } finally { await page.keyboard.up('w'); }
  await page.keyboard.down(direction); try { await expect(page.locator('.interaction-prompt')).toContainText(label); } finally { await page.keyboard.up(direction); }
  await page.keyboard.press('e');
}
test('binder and Collectr: disposal, protected copies, duplicate cleanup, valuable warning and reload', async ({ page }, info) => {
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} }), services = new ComputerServices(store);
  store.state.settings.controlsLearned = true;
  const make = (id: string, uid: string) => ({ ...createCard(id, 'disposal-fixture', seeded(5), 'normal', 'pack'), uid });
  store.state.cards = Array.from({ length: 62 }, (_, i) => make(i % 2 ? 'sv03.5-001' : 'sv03.5-005', `cleanup-${i}`));
  const single = make('sv03.5-010', 'single-common'), graded = { ...make('sv03.5-026', 'protected-slab'), status: 'graded' as const, grader: 'PSA' as const, grade: 9 };
  const misprint = { ...make('sv03.5-026', 'protected-misprint'), misprint: { version: 1 as const, modifier: 30 as const, defect: makeDefect(seeded(8)), origin: 'individual' as const, packUid: 'disposal-fixture' } };
  const favorite = { ...make('sv03.5-001', 'protected-favorite'), favorite: true };
  const trade = { ...make('sv03.5-026', 'protected-trade'), ownershipLock: { kind: 'trade' as const, uid: 'trade-fixture' } };
  const listed = make('sv03.5-026', 'protected-listing'), chase = make('me02.5-276', 'valuable-chase');
  store.state.cards.push(single, graded, misprint, favorite, trade, listed, chase);
  expect(services.list('card', listed.uid, 100)).toBe(true);
  const state = structuredClone(store.state), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state, key: SAVE_KEY });
  await page.goto('/'); await approach(page, 'd', 'Open Binder');
  await page.locator('[data-search]').fill('Caterpie');
  await page.locator(`[data-inspect="${single.uid}"]`).click(); await page.locator('[data-delete-card]').click();
  await expect(page.locator('.cleanup-confirm')).toContainText('This cannot be undone');
  await page.locator('[data-cleanup-cancel]').click(); expect((await saved(page)).cards.length).toBe(state.cards.length);
  await page.locator('[data-delete-card]').click(); await page.locator('[data-cleanup-confirm]').click();
  expect((await saved(page)).cards.some(c => c.uid === single.uid)).toBe(false);
  await page.locator('[data-search]').fill('');
  for (const card of [graded, misprint, trade, listed]) {
    await page.locator('[data-search]').fill('Raichu');
    await page.locator(`[data-inspect="${card.uid}"]`).click(); await expect(page.locator('[data-delete-card]')).toBeDisabled(); await page.locator('[data-back]').click();
  }
  await page.locator('[data-search]').fill(''); await page.locator('[data-bulk-manage]').click();
  await page.locator('[data-cleanup-rarity="Common"]').check(); await page.locator('[data-cleanup-rarity="Uncommon"]').check();
  await page.locator('[data-cleanup-visible]').click(); await expect(page.locator('[data-cleanup-count]')).toHaveText('24 selected'); await page.locator('[data-cleanup-clear]').click();
  await page.locator('[data-cleanup-excess]').click(); await expect(page.locator('[data-cleanup-count]')).toHaveText('61 selected');
  await page.locator('[data-cleanup-card="cleanup-1"]').uncheck();
  await expect(page.locator('[data-cleanup-count]')).toHaveText('60 selected');
  await page.locator('[data-cleanup-excess]').click();
  await page.locator('[data-cleanup-delete]').click(); await expect(page.locator('.cleanup-confirm h2')).toHaveText('Delete 61 cards permanently?');
  await page.screenshot({ path: 'artifacts/card-disposal-bulk-confirm.png' });
  await page.locator('[data-cleanup-confirm]').click();
  const after = await saved(page);
  expect(after.cards.filter(c => c.uid.startsWith('cleanup-'))).toHaveLength(1);
  expect(after.cards.some(c => c.cardId === 'sv03.5-001')).toBe(true); expect(after.cards.some(c => c.cardId === 'sv03.5-005')).toBe(true);
  expect(after.currency).toBe(state.currency); expect(after.stats.sold).toBe(state.stats.sold);
  await page.locator(`[data-inspect="${chase.uid}"]`).click(); await page.locator('[data-delete-card]').click();
  await expect(page.locator('.cleanup-warning')).toContainText('contains valuable cards'); await page.locator('[data-cleanup-cancel]').click(); await page.locator('[data-back]').click();
  await page.reload(); await approach(page, 'a', 'Use Computer');
  await page.locator('[data-app="collectr"]').click(); await expect(page.locator('.pc-portfolio>strong')).toHaveText(`$${money(portfolioValue(after))}`);
  await page.locator('[data-action="route"][data-value="collection"]').click(); await page.locator('[data-action="route"][data-value="cleanup"]').click();
  await expect(page.locator('[data-cleanup-card="protected-slab"]')).toBeDisabled(); await expect(page.locator('[data-cleanup-card="protected-misprint"]')).toBeDisabled();
  await expect(page.locator('[data-cleanup-card="protected-trade"]')).toBeDisabled(); await expect(page.locator('[data-cleanup-card="protected-listing"]')).toBeDisabled();
  await page.locator('[data-cleanup-all]').click(); await expect(page.locator('[data-cleanup-count]')).toHaveText('1 selected');
  await expect(page.locator('[data-cleanup-card="valuable-chase"]')).not.toBeChecked();
  await page.locator('[data-cleanup-card="valuable-chase"]').check();
  await page.locator('[data-cleanup-delete]').click(); await expect(page.locator('.cleanup-warning')).toContainText('contains valuable cards'); await page.locator('[data-cleanup-cancel]').click();
  await page.locator('[data-cleanup-card="valuable-chase"]').uncheck();
  await page.locator('[data-cleanup-rarity="Common"]').check(); await page.locator('[data-cleanup-rarity="Uncommon"]').check();
  await page.locator('[data-cleanup-all]').click(); await expect(page.locator('[data-cleanup-count]')).toHaveText('1 selected');
  await page.screenshot({ path: 'artifacts/card-disposal-collectr.png' });
  await page.locator('[data-cleanup-delete]').click(); await page.locator('[data-cleanup-confirm]').click();
  await expect(page.locator('[data-action="route"][data-value="cleanup"]')).toBeVisible();
  const final = await saved(page); expect(final.cards).toHaveLength(6); expect(final.cardDisposals?.flatMap(r => r.cards)).toHaveLength(63);
  expect(new Set(final.cards.map(c => c.uid)).size).toBe(final.cards.length); expect(final.currency).toBe(state.currency);
  await page.locator('[data-action="route"][data-value="home"]').click(); await expect(page.locator('.pc-portfolio>strong')).toHaveText(`$${money(portfolioValue(final))}`);
  await page.getByRole('button', { name: 'Minimize Collectr', exact: true }).click(); await page.locator('[data-app="profile"]').click();
  await expect(page.locator('.pc-counts')).toContainText('Cards owned6');
  await page.keyboard.press('Escape'); await page.reload(); await expect(page.locator('.loading')).toHaveCount(0);
  expect((await saved(page)).cards).toEqual(final.cards); expect((await saved(page)).cardDisposals).toEqual(final.cardDisposals); expect(errors).toEqual([]);
  await info.attach('card-disposal-gameplay', { body: JSON.stringify({ url: page.url(), disposed: 63, retained: final.cards.length, currencyUnchanged: true, protectedRetained: true, errors }), contentType: 'application/json' });
});
