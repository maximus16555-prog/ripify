import { test, expect, type Page } from '@playwright/test';
import { newSave } from '../../src/core/save';
import { createSealed } from '../../src/core/inventory';
import { PRODUCT_BY_ID } from '../../src/data/products';
const state=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('ripify.save.v1')!));
async function enter(page:Page,id:string){
  const seed=newSave();seed.settings.graphics='High';seed.sealedProducts.push(createSealed(PRODUCT_BY_ID.get(id)!,0));
  await page.addInitScript(s=>{if(!localStorage.getItem('ripify.save.v1'))localStorage.setItem('ripify.save.v1',JSON.stringify(s));},seed);
  await page.goto('/');await expect(page.locator('.loading')).toHaveCount(0);
  await desk(page);await page.locator('[data-container]').click();
  await expect(page.locator('.container-canvas')).toHaveAttribute('data-loaded','true');
}
async function desk(page:Page){await expect(page.locator('.game-canvas')).toBeVisible();await expect(page.locator('.loading')).toHaveCount(0);await page.keyboard.down('w');try{await expect(page.locator('.interaction-prompt')).toContainText('Open Pack',{timeout:20000});}finally{await page.keyboard.up('w');}await page.keyboard.press('e');}
async function drag(page:Page,x:number,y:number){
  const canvas=page.locator('.container-canvas');const b=(await canvas.boundingBox())!;
  const p=await canvas.evaluate(e=>({x:Number((e as HTMLElement).dataset.handleX),y:Number((e as HTMLElement).dataset.handleY)}));
  const sx=b.x+b.width*p.x,sy=b.y+b.height*p.y;
  await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(sx+x,sy+y,{steps:12});
  await page.mouse.up();
}
test('3D ETB sleeve, lid, interrupted gestures, resume and atomic contents',async({page})=>{
  test.setTimeout(100000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await enter(page,'151-etb');const canvas=page.locator('.container-canvas');
  await expect(canvas).toHaveAttribute('data-construction','sleeve-lift');await expect(canvas).toHaveAttribute('data-phase','sleeve');
  await expect(canvas).toHaveAttribute('data-pack-count','9');await expect(canvas).toHaveAttribute('data-promo-count','1');
  const idleFrames=await canvas.getAttribute('data-frames');await page.waitForTimeout(300);expect(await canvas.getAttribute('data-frames')).toBe(idleFrames);
  expect(Number(await canvas.getAttribute('data-draw-calls'))).toBeLessThan(80);
  await page.screenshot({path:'artifacts/3d-etb-sealed.png'});
  await drag(page,22,0);await expect(canvas).toHaveAttribute('data-progress','0');expect((await state(page)).containerOpening.stage).toBe('sealed');
  await drag(page,430,0);await expect(canvas).toHaveAttribute('data-phase','lid');
  await page.screenshot({path:'artifacts/3d-etb-sleeve-removed.png'});
  await drag(page,0,-25);await expect(canvas).toHaveAttribute('data-progress','0');expect((await state(page)).containerOpening.stage).toBe('sealed');
  await drag(page,0,-260);await expect(canvas).toHaveAttribute('data-phase','contents');expect((await state(page)).cards).toHaveLength(0);
  await page.screenshot({path:'artifacts/3d-etb-open.png'});
  await page.setViewportSize({width:1024,height:640});await page.screenshot({path:'artifacts/3d-etb-small.png'});await page.setViewportSize({width:1440,height:900});
  await page.locator('[data-orbit="-1"]').click();await page.locator('[data-orbit="-1"]').click();await page.screenshot({path:'artifacts/3d-etb-angle.png'});
  await page.keyboard.press('Escape');await page.reload();await desk(page);
  await expect(page.locator('.container-canvas')).toHaveAttribute('data-phase','contents');
  await drag(page,0,-18);await expect(page.locator('.container-canvas')).toHaveAttribute('data-progress','0');expect((await state(page)).sealedProducts).toHaveLength(1);
  await drag(page,0,-210);await expect(page.locator('.container-canvas')).toHaveCount(0);
  const after=await state(page);expect(after.packs).toHaveLength(10);expect(after.cards.map((c:{cardId:string})=>c.cardId)).toEqual(['svp-051']);expect(after.productReceipts).toHaveLength(1);expect(after.opening).toBeNull();
  await page.reload();expect((await state(page)).packs).toHaveLength(10);expect(errors).toEqual([]);
});
test('3D UPC pivots at rear, retains two pack banks and exact three promos',async({page})=>{
  test.setTimeout(100000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await enter(page,'151-upc');const canvas=page.locator('.container-canvas');
  await expect(canvas).toHaveAttribute('data-construction','hinged-case');await expect(canvas).toHaveAttribute('data-phase','lid');
  await expect(canvas).toHaveAttribute('data-pack-count','16');await expect(canvas).toHaveAttribute('data-promo-count','3');
  expect(Number(await canvas.getAttribute('data-draw-calls'))).toBeLessThan(100);
  await page.screenshot({path:'artifacts/3d-upc-sealed.png'});
  await drag(page,0,-50);await expect(canvas).toHaveAttribute('data-progress','0');expect((await state(page)).cards).toHaveLength(0);
  await drag(page,0,-260);await expect(canvas).toHaveAttribute('data-phase','contents');await expect(canvas).toHaveAttribute('data-lid-angle','-1.92');
  await page.screenshot({path:'artifacts/3d-upc-open.png'});
  await page.setViewportSize({width:1024,height:640});await page.screenshot({path:'artifacts/3d-upc-small.png'});await page.setViewportSize({width:1440,height:900});
  for(let i=0;i<3;i++)await page.locator('[data-orbit="1"]').click();await page.screenshot({path:'artifacts/3d-upc-side.png'});
  for(let i=0;i<6;i++)await page.locator('[data-orbit="1"]').click();await page.screenshot({path:'artifacts/3d-upc-back.png'});
  // Accessible action uses the same physical settling path; multiple clicks cannot double fulfill.
  await page.locator('[data-action]').dblclick();await expect(canvas).toHaveCount(0);
  const after=await state(page);expect(after.packs).toHaveLength(17);expect(after.cards.map((c:{cardId:string;finish:string})=>[c.cardId,c.finish])).toEqual([['svp-052','holo'],['svp-053','holo'],['sv03.5-205','metal']]);expect(after.productReceipts).toHaveLength(1);expect(after.opening).toBeNull();
  await page.reload();expect((await state(page)).cards).toHaveLength(3);expect(errors).toEqual([]);
});

test('missing packaging art fails honestly and partial unboxing can be kept sealed',async({page})=>{
  await page.route('**/artwork/151-etb.jpg',route=>route.abort());
  await enter(page,'151-etb');const before=await state(page);
  await expect(page.locator('.container-warning')).toContainText('packaging artwork is unavailable');
  await page.locator('[data-action]').click();await expect(page.locator('.container-canvas')).toHaveAttribute('data-phase','lid');
  await page.locator('[data-close]').click();await expect(page.locator('.container-canvas')).toHaveCount(0);
  const after=await state(page);expect(after.containerOpening).toBeNull();expect(after.sealedProducts).toEqual(before.sealedProducts);expect(after.packs).toEqual(before.packs);expect(after.cards).toEqual(before.cards);
  await page.reload();await desk(page);await page.locator('[data-container]').click();await expect(page.locator('.container-canvas')).toHaveAttribute('data-phase','sleeve');
});
