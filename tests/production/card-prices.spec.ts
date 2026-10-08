import { test, expect } from '@playwright/test';
import { newSave, SAVE_KEY } from '../../src/core/save';
import { createCard, seeded } from '../../src/core/inventory';
import { makeDefect } from '../../src/core/rare-events';
import { money, ownedValue, rawValue } from '../../src/core/economy';
import { CARD_BY_ID } from '../../src/data/cards';
import { portfolioValue } from '../../src/core/computer';

test('individual prices propagate through binder, inspection, Collectr, eBay and reload', async ({ page }, info) => {
  const state = newSave(), errors: string[] = [];
  state.marketSeed = 0; state.settings.controlsLearned = true;
  state.cards = ['sv03.5-001', 'sv03.5-004', 'sv03.5-010', 'sv03.5-006', 'sv03.5-026', 'me02.5-276'].map((id, i) => {
    const card = createCard(id, 'pricing-fixture', seeded(i), 'normal', 'pack');
    card.condition = { centering: 100, corners: 100, edges: 100, surface: 100, print: 100 };
    return card;
  });
  state.cards.push({ ...state.cards[0], uid: 'legacy-price-misprint', baseRawValue: .22, misprint: { version: 1, modifier: 30, defect: makeDefect(seeded(22)), origin: 'individual', packUid: 'pricing-fixture' } });
  state.cards.push({ ...state.cards[3], uid: 'priced-slab', status: 'graded', grader: 'PSA', grade: 9 });
  const values = Object.fromEntries(state.cards.map(c => [c.uid, money(ownedValue(c, state.marketSeed))]));
  const portfolio = money(portfolioValue(state));
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ state, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { state, key: SAVE_KEY });
  await page.goto('/'); await expect(page.locator('.game-canvas')).toBeVisible(); await expect(page.locator('.loading')).toHaveCount(0);
  await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack', { timeout: 15000 }); await page.waitForTimeout(700); } finally { await page.keyboard.up('w'); }
  await page.keyboard.down('d');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Binder', { timeout: 15000 }); } finally { await page.keyboard.up('d'); }
  await page.keyboard.press('e');
  for (const card of state.cards) {
    await expect(page.locator(`[data-inspect="${card.uid}"] .binder-card-label`)).toContainText(`${values[card.uid]} coins`);
    await page.locator(`[data-inspect="${card.uid}"]`).click();
    await expect(page.locator('.inspection-value')).toContainText(values[card.uid]);
    await page.locator('[data-back]').click();
  }
  await expect(page.locator(`[data-inspect="${state.cards[0].uid}"] .binder-card-label`)).toBeVisible();
  await page.screenshot({ path: 'artifacts/individual-prices-binder.png' });
  await page.reload(); await expect(page.locator('.game-canvas')).toBeVisible(); await expect(page.locator('.loading')).toHaveCount(0);
  await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack', { timeout: 15000 }); await page.waitForTimeout(650); } finally { await page.keyboard.up('w'); }
  await page.keyboard.down('a');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Use Computer', { timeout: 15000 }); } finally { await page.keyboard.up('a'); }
  await page.keyboard.press('e'); await expect(page.locator('.pc-monitor')).toBeVisible();
  await page.locator('[data-app="collectr"]').click();
  await expect(page.locator('.pc-portfolio > strong')).toHaveText(`$${portfolio}`);
  await page.locator('[data-action="route"][data-value="search"]').click(); await page.locator('[data-search]').fill('Bulbasaur');
  const definition = CARD_BY_ID.get('sv03.5-001')!;
  await expect(page.locator('[data-action="card"][data-value="sv03.5-001"]')).toContainText(`$${money(rawValue(definition, state.marketSeed))}`);
  await page.locator('[data-action="card"][data-value="sv03.5-001"]').click();
  await expect(page.locator('.pc-card-page .pc-price')).toHaveText(`$${money(rawValue(definition, state.marketSeed))}`);
  await expect(page.locator('[data-window="collectr"]')).toContainText(`MISPRINT raw $${values['legacy-price-misprint']}`);
  await page.screenshot({ path: 'artifacts/individual-prices-collectr.png' });
  await page.getByRole('button', { name: 'Minimize Collectr', exact: true }).click(); await page.locator('[data-app="ebay"]').click();
  for (const card of [state.cards[0], state.cards[6], state.cards[7]]) {
    await page.locator(`[data-action="item"][data-value="${card.uid}"]`).click();
    await expect(page.locator('.pc-product-page')).toContainText(`$${values[card.uid]}`);
    await expect(page.locator('[data-asking]')).toHaveValue(String(ownedValue(card, state.marketSeed)));
    await page.locator('[data-action="route"][data-value="home"]').click();
  }
  await page.keyboard.press('Escape'); await expect(page.locator('.pc-monitor')).toHaveCount(0);
  const persisted = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(persisted.cards).toEqual(state.cards); expect(errors).toEqual([]);
  await info.attach('individual-pricing-gameplay', { body: JSON.stringify({ url: page.url(), values, portfolio, cardsUnchanged: true, errors }), contentType: 'application/json' });
});
