import { test, expect, type Page } from '@playwright/test';
import { newSave } from '../../src/core/save';
import { CARD_BY_ID } from '../../src/data/cards';
import { PRODUCT_BY_ID } from '../../src/data/products';
import { SPECIAL_LINES } from '../../src/core/rare-events';
import type { Save } from '../../src/core/types';

test.use({ launchOptions: { args: ['--enable-webgl', '--use-angle=d3d11', '--ignore-gpu-blocklist'] } });
const save = (page: Page): Promise<Save> => page.evaluate(() => JSON.parse(localStorage.getItem('ripify.save.v1')!));
const position = (page: Page) => page.evaluate(() => (window as unknown as {__ripifyDebug: {position:number[]}}).__ripifyDebug.position);
async function ready(page: Page) {
  const state = newSave(); state.packs = []; state.settings.graphics = 'Low'; state.settings.controlsLearned = true;
  await page.addInitScript(s => { if (!localStorage.getItem('ripify.save.v1')) localStorage.setItem('ripify.save.v1', JSON.stringify(s)); }, state);
  await page.goto('/'); await expect(page.locator('.loading')).toHaveCount(0);
  await page.waitForFunction(() => !!(window as unknown as {__ripifyDebug: unknown}).__ripifyDebug);
}
async function coordinate(page: Page, key: string, axis: number, target: number, greater = false) {
  await page.keyboard.down(key);
  try { await expect.poll(async () => greater ? (await position(page))[axis] >= target : (await position(page))[axis] <= target, {timeout:20000, intervals:[50]}).toBe(true); }
  catch (error) { console.log('Blocked test route', {key,axis,target,debug:await page.evaluate(()=>(window as any).__ripifyDebug)}); throw error; }
  finally { await page.keyboard.up(key); }
  await page.waitForTimeout(180);
}
async function walk(page: Page, key: string, prompt: string) {
  await page.keyboard.down(key);
  try { await expect(page.locator('.interaction-prompt')).toContainText(prompt, {timeout:20000}); await expect(page.locator('.interaction-prompt')).toBeVisible(); }
  finally { await page.keyboard.up(key); }
  await page.waitForTimeout(180);
}
async function desk(page: Page) { await coordinate(page,'w',2,-1.3); await expect(page.locator('.interaction-prompt')).toContainText('Open Pack'); await page.keyboard.press('e'); }
async function reveal(page: Page, set: string, prefix: string) {
  const generated = (await save(page)).opening!;
  const seam = (await page.locator('[data-tear]').boundingBox())!;
  await page.mouse.move(seam.x+16,seam.y+seam.height/2); await page.mouse.down();
  await page.mouse.move(seam.x+seam.width-16,seam.y+seam.height/2,{steps:16}); await page.mouse.up();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-index','0',{timeout:20000});
  for (let i=0;i<11;i++) {
    expect((await save(page)).opening!.index).toBe(i);
    const card = generated.cards[i], definition = CARD_BY_ID.get(card.cardId)!;
    expect([set,'sve']).toContain(definition.setCode);
    await expect(page.locator('[data-card] .exact-card-image')).toHaveAttribute('src',definition.image!);
    await expect.poll(() => page.locator('[data-card] .exact-card-image').evaluate((img:HTMLImageElement)=>img.naturalWidth),{timeout:20000}).toBeGreaterThan(0);
    if(i===1) await page.screenshot({path:`artifacts/${prefix}-reveal.png`});
    await page.locator('[data-next]').click();
    if(i<10) await expect(page.locator('[data-card]')).toHaveAttribute('data-index',String(i+1));
  }
  await expect(page.locator('[data-collect]')).toBeVisible(); await page.locator('[data-collect]').click();
  expect((await save(page)).opening).toBeNull();
}

for (const [productId,setCode,targetX] of [['151-booster','sv03.5',-4.35],['ascended-heroes-booster','me02.5',-3.05]] as const) {
  test(`walk to shop, buy ${productId}, return and physically open correct set`,async({page})=>{
    test.setTimeout(120000); const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
    await ready(page); await walk(page,'a','Enter Card Shop'); await page.keyboard.press('e');
    await expect(page.locator('[data-location]')).toHaveText('Corner Card Shop');
    // Walk around the existing crate instead of testing movement through it.
    await coordinate(page,'a',0,-3.35);
    await coordinate(page,'w',2,2.4);
    await coordinate(page,targetX > -3.35 ? 'd' : 'a',0,targetX,targetX > -3.35); await walk(page,'w',PRODUCT_BY_ID.get(productId)!.name); await page.keyboard.press('e');
    await expect(page.locator(`[data-buy="${productId}"]`)).toBeVisible();
    await page.screenshot({path:`artifacts/shop-${productId}.png`});
    await page.locator(`[data-buy="${productId}"]`).click();
    const purchased=await save(page); expect(purchased.packs).toHaveLength(1); expect(purchased.currency).toBe(120-PRODUCT_BY_ID.get(productId)!.price);
    expect(purchased.packs[0].setCode).toBe(setCode); expect(purchased.opening).toBeNull(); expect(purchased.cards).toHaveLength(0);
    await page.keyboard.press('Escape');
    await coordinate(page,'a',0,-4.25);
    await walk(page,'s','Return Home'); await page.keyboard.press('e'); await expect(page.locator('[data-location]')).toHaveText('Your room');
    await desk(page); await reveal(page,setCode,`shop-${productId}`);
    expect((await save(page)).cards).toHaveLength(11); await page.reload(); expect((await save(page)).cards).toHaveLength(11); expect(errors).toEqual([]);
  });
}

test('both dev shortcuts create secret unopened packs, ignore held repeats, persist and reveal through normal gestures',async({page})=>{
  test.setTimeout(150000); const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message)); await ready(page);
  await page.keyboard.press('Control+1'); await page.keyboard.press('Shift+2'); expect((await save(page)).packs).toHaveLength(0);
  await page.keyboard.press('Control+Shift+Digit1'); await expect(page.locator('.toast')).toContainText('Dev: 151 test pack added');
  const first=(await save(page)).packs[0]; expect((await save(page)).packs).toHaveLength(1);
  await page.keyboard.down('Control'); await page.keyboard.down('Shift');
  await page.keyboard.down('Digit2'); await page.keyboard.down('Digit2'); await page.keyboard.down('Digit2');
  expect((await save(page)).packs).toHaveLength(2); await page.keyboard.up('Digit2'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  await expect(page.locator('.toast')).toContainText('Dev: Ascended Heroes test pack added');
  const second=(await save(page)).packs[1]; expect(second.productId).toBe('ascended-heroes-booster'); expect(second.rareEvents!.special!.type).toBe('ascended-heroes-god');
  await page.keyboard.press('Control+Shift+Digit1'); expect((await save(page)).packs).toHaveLength(3);
  await page.reload(); expect((await save(page)).packs.slice(0,2)).toEqual([first,second]); await desk(page);
  await expect(page.locator('.pack-picker')).not.toContainText(/god|demigod|misprint|debug|test pack/i);
  await page.locator(`[data-pack="${first.uid}"]`).click(); const opening=(await save(page)).opening!;
  const event=opening.pack.rareEvents!.special!; if(event.type!=='english-151-demigod') throw new Error('wrong 151 event');
  expect(opening.cards.slice(-3).map(c=>c.cardId)).toEqual(SPECIAL_LINES[event.line]);
  await page.keyboard.press('Escape'); await page.reload(); await desk(page); expect((await save(page)).opening!.cards).toEqual(opening.cards);
  await reveal(page,'sv03.5','shortcut-151'); await page.keyboard.press('e');
  await page.locator(`[data-pack="${second.uid}"]`).click(); const god=(await save(page)).opening!;
  expect(god.cards.slice(1,4).map(c=>CARD_BY_ID.get(c.cardId)!.rarity)).toEqual(Array(3).fill('Mega attack rare'));
  expect(god.cards.slice(4).map(c=>CARD_BY_ID.get(c.cardId)!.rarity)).toEqual(Array(7).fill('Special illustration rare'));
  await reveal(page,'me02.5','shortcut-ascended'); expect((await save(page)).cards).toHaveLength(22);
  expect((await save(page)).packs).toHaveLength(1); expect(errors).toEqual([]);
});

test('development shortcuts work with focused menu buttons but ignore text editing',async({page})=>{
  await ready(page); await page.keyboard.press('Escape'); await expect(page.locator('[data-resume]')).toBeVisible();
  await page.locator('[data-resume]').focus(); await page.keyboard.press('Control+Shift+Digit1');
  expect((await save(page)).packs).toHaveLength(1); expect((await save(page)).opening).toBeNull();
  await page.evaluate(()=>{ const field=document.createElement('input');field.id='test-typing';document.body.append(field);field.focus(); });
  await page.keyboard.press('Control+Shift+Digit2'); expect((await save(page)).packs).toHaveLength(1);
  await page.evaluate(()=>document.querySelector('#test-typing')!.remove());
  await page.locator('[data-resume]').click(); await page.keyboard.press('Control+Shift+Digit2');
  expect((await save(page)).packs).toHaveLength(2);
});
