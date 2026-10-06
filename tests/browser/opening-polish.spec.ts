import { expect, test, type Page } from '@playwright/test';
import { newSave } from '../../src/core/save';
import { generatePack } from '../../src/core/packs';
import { CARD_BY_ID } from '../../src/data/cards';
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('ripify.save.v1')!));
function fixture(stage: 'sealed' | 'cards' = 'sealed') {
  const s = newSave(); s.settings.graphics = 'Low'; s.settings.controlsLearned = true;
  const pack = s.packs.pop()!; pack.seed = 1234;
  s.opening = { pack, cards: generatePack(pack), stage, index: 0 }; return s;
}
async function open(page: Page, state = fixture()) {
  await page.addInitScript(s => { if (!localStorage.getItem('ripify.save.v1')) localStorage.setItem('ripify.save.v1', JSON.stringify(s)); }, state);
  await page.goto('/'); await expect(page.locator('.game-canvas')).toBeVisible();
  await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack', { timeout:15000 }); } finally { await page.keyboard.up('w'); }
  await page.keyboard.press('e');
}
async function drag(page: Page, x: number, y: number, dx: number, dy: number, slow = false) {
  await page.mouse.move(x,y); await page.mouse.down();
  for (let i=1;i<=8;i++) { await page.mouse.move(x+dx*i/8,y+dy*i/8); if (slow) await page.waitForTimeout(55); }
}
test('slow progressive tear, release, reverse movement and fast finish', async ({ page }) => {
  test.setTimeout(90000); await open(page);
  const seam = (await page.locator('[data-tear]').boundingBox())!;
  await drag(page,seam.x+12,seam.y+20,seam.width*.4,0,true);
  const progress = Number(await page.locator('[data-wrapper]').getAttribute('data-tear-progress'));
  expect(progress).toBeGreaterThan(.4); expect(progress).toBeLessThan(.6);
  expect((await saved(page)).opening.stage).toBe('sealed');
  await expect(page.locator('.tear-strip')).toHaveCSS('transform','none');
  const untouched = await page.locator('.tear-strip').evaluate(el => (el as HTMLElement).style.clipPath);
  expect(untouched).toContain('100%');
  await page.mouse.move(seam.x+35,seam.y+20); expect(Number(await page.locator('[data-wrapper]').getAttribute('data-tear-progress'))).toBe(progress);
  await page.mouse.up(); expect((await saved(page)).opening.stage).toBe('sealed');
  await page.screenshot({ path:'artifacts/progressive-tear.png' });
  await page.mouse.move(seam.x+seam.width*progress,seam.y+20); await page.mouse.down();
  await page.mouse.move(seam.x+seam.width-8,seam.y+20); await page.mouse.up();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-index','0',{timeout:15000}); expect((await saved(page)).opening.index).toBe(0);
});
test('right-to-left tear requires most of the width and releases only crossed foil', async ({ page }) => {
  test.setTimeout(90000); await open(page);
  const seam = (await page.locator('[data-tear]').boundingBox())!;
  await drag(page,seam.x+seam.width-12,seam.y+20,-seam.width*.3,0);
  expect((await saved(page)).opening.stage).toBe('sealed');
  expect(await page.locator('[data-wrapper]').getAttribute('data-tear-direction')).toBe('-1');
  expect(await page.locator('.wrapper-body').evaluate(el => (el as HTMLElement).style.clipPath)).toContain('0% 0%');
  await page.mouse.move(seam.x+8,seam.y+20); await page.mouse.up();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-index','0',{timeout:15000});
});

test('partial keyboard rip can resume with the mouse without opening early', async ({ page }) => {
  test.setTimeout(90000); await open(page);
  await page.keyboard.down('r');
  await expect.poll(async () => Number(await page.locator('[data-wrapper]').getAttribute('data-tear-progress')), { timeout: 2000, intervals: [20] }).toBeGreaterThan(0);
  await page.keyboard.up('r');
  const progress = Number(await page.locator('[data-wrapper]').getAttribute('data-tear-progress'));
  expect(progress).toBeGreaterThan(0); expect(progress).toBeLessThan(.8);
  const seam = (await page.locator('[data-tear]').boundingBox())!;
  await page.mouse.move(seam.x+seam.width*progress,seam.y+20); await page.mouse.down();
  await page.mouse.move(seam.x+seam.width*progress+3,seam.y+20); await page.mouse.up();
  expect((await saved(page)).opening.stage).toBe('sealed');
  const resumed = Number(await page.locator('[data-wrapper]').getAttribute('data-tear-progress'));
  expect(resumed).toBeGreaterThanOrEqual(progress); expect(resumed).toBeLessThan(progress+.04);
  await page.mouse.move(seam.x+seam.width*resumed,seam.y+20); await page.mouse.down();
  await page.mouse.move(seam.x+seam.width+3,seam.y+20); await page.mouse.up();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-index','0',{timeout:15000});
});
test('real next card stays underneath and is promoted without replacement', async ({ page }) => {
  test.setTimeout(90000); await open(page,fixture('cards')); await expect(page.locator('[data-next]')).toBeEnabled({timeout:15000});
  const next = page.locator('[data-under-card][data-index="1"]');
  await next.evaluate(el => { (el as HTMLElement & { identity?: string }).identity = 'original-next'; });
  const pose = await next.evaluate(el => getComputedStyle(el).transform);
  const card = (await page.locator('[data-card]').boundingBox())!;
  await drag(page,card.x+card.width/2,card.y+card.height/2,165,-14,true);
  expect(await next.evaluate(el => getComputedStyle(el).transform)).toBe(pose); expect((await saved(page)).opening.index).toBe(0);
  await page.screenshot({ path:'artifacts/card-underneath.png' });
  await page.mouse.up();
  await page.evaluate(() => { const card = document.querySelector('[data-card]')!; card.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,bubbles:true})); document.querySelector<HTMLButtonElement>('[data-next]')!.click(); });
  await expect(page.locator('[data-card]')).toHaveAttribute('data-index','1'); await expect(page.locator('[data-next]')).toBeEnabled();
  expect(await page.locator('[data-card]').evaluate(el => (el as HTMLElement & { identity?: string }).identity)).toBe('original-next');
  expect((await saved(page)).opening.index).toBe(1); await page.waitForTimeout(600); expect((await saved(page)).opening.index).toBe(1);
  const realCard = (await page.locator('[data-card]').boundingBox())!;
  await drag(page,realCard.x+realCard.width/2,realCard.y+realCard.height/2,165,-14,true);
  await page.screenshot({ path:'artifacts/card-underneath-real.png' });
  await page.locator('[data-card]').evaluate(el => el.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
  await page.mouse.up();
  await expect.poll(() => page.locator('[data-card]').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41)).toBe(0);
  await page.keyboard.down('ArrowRight'); await expect(page.locator('[data-card]')).toHaveAttribute('data-index','2');
  for (let i=0;i<12;i++) await page.keyboard.down('ArrowRight'); await page.keyboard.up('ArrowRight'); expect((await saved(page)).opening.index).toBe(2);
});

test('underlying cards match the current card size on smaller desktops', async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({width:1024,height:640});
  await open(page,fixture('cards')); await expect(page.locator('[data-next]')).toBeEnabled({timeout:15000});
  const size = (selector: string) => page.locator(selector).evaluate(el => ({ width:(el as HTMLElement).offsetWidth, height:(el as HTMLElement).offsetHeight }));
  expect(await size('[data-under-card][data-index="1"] > .tcg-card')).toEqual(await size('[data-card] > .tcg-card'));
  const card = (await page.locator('[data-card]').boundingBox())!;
  await drag(page,card.x+100,card.y+140,-145,0,true); await page.mouse.up();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-index','1'); await expect(page.locator('[data-next]')).toBeEnabled();
  await page.screenshot({path:'artifacts/card-stack-small.png'});
});
test('short and cancelled swipes return smoothly without advancing', async ({ page }) => {
  test.setTimeout(90000); await open(page,fixture('cards')); await expect(page.locator('[data-next]')).toBeEnabled({timeout:15000});
  const card = (await page.locator('[data-card]').boundingBox())!;
  await drag(page,card.x+130,card.y+150,40,10,true); await page.mouse.up();
  expect((await saved(page)).opening.index).toBe(0); await expect.poll(() => page.locator('[data-card]').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41)).toBe(0);
  await drag(page,card.x+130,card.y+150,175,0);
  await page.locator('[data-card]').evaluate(el => el.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
  await page.mouse.up(); await expect.poll(() => page.locator('[data-card]').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41)).toBe(0);
  expect((await saved(page)).opening.index).toBe(0);
  await drag(page,card.x+130,card.y+150,-180,0); await page.mouse.up(); await expect(page.locator('[data-card]')).toHaveAttribute('data-index','1'); expect((await saved(page)).opening.index).toBe(1);
});
test('only active pack images preload and slow images block reveal input until settled', async ({ page }) => {
  test.setTimeout(90000); const state = fixture(); const urls = new Set(state.opening!.cards.map(c => CARD_BY_ID.get(c.cardId)!.image).filter(Boolean).map(url => new URL(url!, 'http://127.0.0.1:5173').href));
  const requested = new Set<string>(); let release!: () => void; const slow = new Promise<void>(resolve => { release = resolve; });
  const late = [...urls].at(-1)!;
  await page.route(/assets\.tcgdex\.net|\/artwork\/sve-\d+\.jpg/, async route => {
    const url = route.request().url(); requested.add(url); if (url === late) await slow;
    // Replay the exact audited scan when the development source cache exists.
    // The intentional delay still applies; a remote host outage should not turn
    // this preload/gesture regression into a missing-image test.
    if (url.startsWith('https://assets.tcgdex.net/en/sv/sv03.5/') && url.endsWith('/high.webp')) {
      try { await route.fulfill({ path: `.freebuff/151-source-audit/images/sv03.5-${url.split('/').at(-2)}.webp`, contentType: 'image/webp' }); return; }
      catch { /* A fresh checkout uses the live exact image URL. */ }
    }
    await route.continue();
  });
  await open(page,state); await expect.poll(() => requested.size).toBe(urls.size);
  const seam = (await page.locator('[data-tear]').boundingBox())!;
  await drag(page,seam.x+8,seam.y+20,seam.width-16,0); await page.mouse.up();
  expect((await saved(page)).opening.stage).toBe('cards'); await expect(page.locator('.gesture-caption')).toHaveText('Preparing cards...');
  await page.keyboard.press('ArrowRight'); expect((await saved(page)).opening.index).toBe(0); await expect(page.locator('[data-next]')).toHaveCount(0);
  release(); await expect(page.locator('[data-card]')).toBeVisible({timeout:15000});
  expect(requested).toEqual(urls);
  await expect(page.locator('[data-under-card] .exact-card-image.image-loading')).toHaveCount(0);
  await expect.poll(() => page.locator('[data-under-card] .exact-card-image').evaluateAll(images => images.every(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
});
