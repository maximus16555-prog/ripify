import { test, expect, type Page } from '@playwright/test';
import { newSave, SAVE_KEY } from '../../src/core/save';
import { createCard, createPack, seeded } from '../../src/core/inventory';
import { CARDS, CARD_BY_ID } from '../../src/data/cards';
import { generatePack } from '../../src/core/packs';
import { PRODUCT_BY_ID } from '../../src/data/products';
import { ownedValue } from '../../src/core/economy';
import type { Save } from '../../src/core/types';
const saved = (p: Page): Promise<Save> => p.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
async function walk(p: Page,key: string,prompt: string) {
  await p.keyboard.down(key); try { await expect(p.locator('.interaction-prompt')).toContainText(prompt,{timeout:15000}); } finally { await p.keyboard.up(key); }
}
async function move(p: Page,key: string,ms: number) { await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key); }
async function enter(p: Page) {
  await expect(p.locator('.loading')).toHaveCount(0);await expect(p.locator('.game-canvas')).toBeVisible();
  await walk(p,'a','Go Outside');await p.keyboard.press('e');await expect(p.locator('[data-location]')).toHaveText('Outside');await expect(p.locator('#app')).not.toHaveClass(/world-transition/);
  await move(p,'w',2500);await move(p,'d',5300);await walk(p,'s','Enter Card Shop');await p.mouse.move(40,450);await p.mouse.down({button:'right'});await p.mouse.move(1296,450,{steps:20});await p.mouse.up({button:'right'});await p.waitForTimeout(600);await p.screenshot({path:'artifacts/local-shop-storefront.png'});
  await p.keyboard.press('e');await expect(p.locator('[data-location]')).toHaveText('Corner Card Shop');await expect(p.locator('#app')).not.toHaveClass(/world-transition/);
  await walk(p,'d','Talk / Shop');await p.screenshot({path:'artifacts/local-shop-interior.png'});await p.keyboard.press('e');await expect(p.locator('[data-local-shop]')).toBeVisible();
}
async function initialize(p: Page,s: Save) {
  s.settings.controlsLearned=true;
  await p.addInitScript(({s,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(s));},{s,key:SAVE_KEY});await p.goto('/');
}
test('physical storefront, employee, immediate purchase, return and unchanged pack opener',async({page},info)=>{
  const s=newSave(), errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await initialize(page,s);await enter(page);
  await expect(page.locator('[data-id="151-booster"]')).toBeEnabled();await expect(page.locator('[data-id="ascended-heroes-booster"]')).toBeEnabled();
  await page.locator('[data-id="151-booster"]').click();const after=await saved(page),pack=after.packs.at(-1)!;
  expect(after.currency).toBe(s.currency-PRODUCT_BY_ID.get('151-booster')!.physicalStorePrice);expect(after.packs.length).toBe(s.packs.length+1);expect(after.computer!.orders).toHaveLength(0);expect(after.shippingPackages??[]).toHaveLength(0);expect(after.opening).toBeNull();
  await page.screenshot({path:'artifacts/local-shop-products.png'});await page.keyboard.press('Escape');
  await move(page,'a',2400);await walk(page,'w','Go Outside');await page.keyboard.press('e');await expect(page.locator('[data-location]')).toHaveText('Outside');await expect(page.locator('#app')).not.toHaveClass(/world-transition/);
  await move(page,'a',5300);await walk(page,'s','Go Inside');await page.keyboard.press('e');await expect(page.locator('[data-location]')).toHaveText('Your room');
  await page.reload();await expect(page.locator('.loading')).toHaveCount(0);await walk(page,'w','Open Pack');await page.keyboard.press('e');await page.locator(`[data-pack="${pack.uid}"]`).click();
  const seam=(await page.locator('[data-tear]').boundingBox())!;await page.mouse.move(seam.x+10,seam.y+20);await page.mouse.down();await page.mouse.move(seam.x+seam.width+3,seam.y+20,{steps:20});await page.mouse.up();await expect(page.locator('[data-card]')).toHaveAttribute('data-index','0');
  const generated=(await saved(page)).opening!.cards;expect(generated.every(c=>['sv03.5','sve'].includes(CARD_BY_ID.get(c.cardId)!.setCode))).toBe(true);
  await expect.poll(()=>page.locator('.card-stack .exact-card-image').evaluateAll(imgs=>imgs.every(i=>(i as HTMLImageElement).naturalWidth>0))).toBe(true);
  const card=(await page.locator('[data-card]').boundingBox())!;await page.mouse.move(card.x+card.width/2,card.y+card.height/2);await page.mouse.down();await page.mouse.move(card.x+card.width/2+180,card.y+card.height/2,{steps:10});await page.mouse.up();await expect(page.locator('[data-card]')).toHaveAttribute('data-index','1');await expect(page.locator('[data-next]')).toBeEnabled();
  for(let i=2;i<11;i++){await page.locator('[data-next]').click();await expect(page.locator('[data-next]')).toBeEnabled();}await page.locator('[data-next]').click();await page.locator('[data-collect]').click();await page.reload();await expect(page.locator('.loading')).toHaveCount(0);expect((await saved(page)).cards.map(c=>c.uid)).toEqual(generated.map(c=>c.uid));expect(errors).toEqual([]);
  await info.attach('local-shop-purchase',{body:JSON.stringify({packUid:pack.uid,immediate:true,openedNormally:true,errors}),contentType:'application/json'});
});
test('single and 100+ bulk sales, protections, real valuations, duplicates and persistent restocks',async({page},info)=>{
  const s=newSave();s.currency=5000;s.computer={version:1,minute:430,speed:120,profile:{name:'Collector',avatar:'mint'},drops:{},orders:[],listings:[],portfolio:[]};
  const commons=CARDS.filter(c=>c.setCode==='sv03.5'&&c.rarity==='Common').slice(0,10);
  for(let i=0;i<150;i++)s.cards.push(createCard(commons[i%10].id,'bulk-fixture',seeded(i+2),'normal','pack',Date.now()+i));
  const favorite=createCard('sv03.5-004','fixture',seeded(5),'normal','pack');favorite.favorite=true;s.cards.push(favorite);
  const trade=createCard('sv03.5-005','fixture',seeded(5),'normal','pack');trade.ownershipLock={kind:'trade',uid:'trade-fixture'};s.cards.push(trade);
  const graded=createCard('me02.5-276','fixture',seeded(5),'holo','pack');graded.status='graded';graded.grader='PSA';graded.grade=10;s.cards.push(graded);
  let seed=0,misprint;while(!misprint){misprint=generatePack(createPack('151-booster',0,undefined,seed++),undefined,Date.now()).find(c=>c.misprint);}s.cards.push(misprint);
  s.localShop={version:1,purchases:{'1:151-booster':999,'1:ascended-heroes-booster':999},sales:[]};
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await initialize(page,s);await enter(page);
  // Cross an actual game-clock restock while the playable shop remains open.
  await expect(page.locator('[data-id="151-booster"]')).toBeDisabled();await expect(page.locator('[data-id="ascended-heroes-booster"]')).toBeDisabled();
  await expect(page.locator('[data-id="151-booster"]')).toBeEnabled({timeout:30000});await expect(page.locator('[data-id="ascended-heroes-booster"]')).toBeEnabled();
  await page.locator('[data-shop-action="sell"]').click();
  for (const c of [favorite,trade]) { await page.locator('[data-shop-filter="query"]').fill(CARD_BY_ID.get(c.cardId)!.name); await page.locator('[data-shop-filter="query"]').press('Tab'); await expect(page.locator(`[data-sale-card="${c.uid}"]`)).toBeDisabled(); }
  await page.locator('[data-shop-filter="query"]').fill('');await page.locator('[data-shop-filter="query"]').press('Tab');
  const first=page.locator('[data-sale-card]:enabled').first();await first.check();await page.locator('[data-shop-action="review"]').click();await page.locator('[data-shop-action="commit"]').click();
  let state=await saved(page);expect(state.localShop!.sales).toHaveLength(1);expect(state.localShop!.sales[0].cards).toHaveLength(1);expect(state.cards).toHaveLength(s.cards.length-1);
  await page.locator('[data-shop-filter="rarity"]').selectOption('Common');await page.locator('[data-shop-action="duplicates"]').click();await expect(page.locator('[data-shop-count]')).toContainText('selected');
  const before=await saved(page);await page.locator('[data-shop-action="all"]').click();await page.locator('[data-shop-action="review"]').click();await page.screenshot({path:'artifacts/local-shop-bulk-confirm.png'});await page.locator('[data-shop-action="commit"]').click();
  state=await saved(page);const sale=state.localShop!.sales.at(-1)!;expect(sale.cards.length).toBeGreaterThan(100);expect(sale.cards.every(c=>c.rate>=.70&&c.rate<=.75)).toBe(true);expect(sale.market).toBeCloseTo(sale.cards.reduce((n,c)=>n+ownedValue(c.card,state.marketSeed,sale.at),0),2);expect(state.currency).toBeCloseTo(before.currency+sale.offer,2);
  expect(state.cards.some(c=>c.uid===favorite.uid)).toBe(true);expect(state.cards.some(c=>c.uid===trade.uid)).toBe(true);expect(state.cards.some(c=>c.uid===graded.uid)).toBe(true);expect(state.cards.some(c=>c.uid===misprint!.uid)).toBe(true);
  await page.locator('[data-shop-filter="rarity"]').selectOption('');await page.locator('[data-shop-filter="kind"]').selectOption('graded');await page.locator(`[data-sale-card="${graded.uid}"]`).check();await page.locator('[data-shop-action="review"]').click();await expect(page.locator('[data-shop-action="commit"]')).toBeDisabled();await page.locator('[data-special-confirm]').check();await page.locator('[data-shop-action="commit"]').click();
  state=await saved(page);expect(state.localShop!.sales.at(-1)!.cards[0].market).toBe(ownedValue(graded,state.marketSeed));
  await page.locator('[data-shop-filter="kind"]').selectOption('misprint');await page.locator(`[data-sale-card="${misprint!.uid}"]`).check();await page.locator('[data-shop-action="review"]').click();await page.locator('[data-special-confirm]').check();await page.locator('[data-shop-action="commit"]').click();
  state=await saved(page);expect(state.localShop!.sales.at(-1)!.cards[0].card.misprint).toEqual(misprint!.misprint);expect(state.localShop!.sales.at(-1)!.cards[0].market).toBe(ownedValue(misprint!,state.marketSeed));
  await page.reload();await expect(page.locator('.loading')).toHaveCount(0);const reloaded=await saved(page);expect(reloaded.cards).toEqual(state.cards);expect(reloaded.localShop).toEqual(state.localShop);expect(reloaded.currency).toBe(state.currency);expect(errors).toEqual([]);
  await info.attach('local-shop-sales',{body:JSON.stringify({bulkCards:sale.cards.length,bulkOffer:sale.offer,market:sale.market,protected:true,gradedAndMisprint:true,saveReload:true,errors}),contentType:'application/json'});
});
