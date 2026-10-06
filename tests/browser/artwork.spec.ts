import { test, expect } from '@playwright/test';
import { newSave } from '../../src/core/save';
import { generatePack } from '../../src/core/packs';
import { createSealed } from '../../src/core/inventory';
import { PRODUCTS } from '../../src/data/products';
import artwork from '../../src/data/verified/artwork.json' with { type: 'json' };

test('all supported product and Energy images decode locally without external hosts', async ({ page }) => {
  await page.goto('/');
  await page.route('https://**/*', route => route.abort());
  const results = await page.evaluate(async assets => Promise.all(assets.map(async asset => {
    const img = new Image(); img.src = asset.path;
    try { await img.decode(); return { id:asset.id, width:img.naturalWidth, height:img.naturalHeight }; }
    catch { return { id:asset.id, width:0, height:0 }; }
  })), artwork.assets);
  for (const asset of artwork.assets) expect(results.find(r => r.id === asset.id)).toEqual({id:asset.id,width:asset.width,height:asset.height});
});

test('pack tear and first Energy reveal show real artwork', async ({ page }) => {
  test.setTimeout(90000); const seed = newSave(); seed.settings.graphics = 'Low'; seed.settings.controlsLearned = true;
  const pack = seed.packs.pop()!; pack.seed = 1234;
  seed.opening = {pack,cards:generatePack(pack),stage:'sealed',index:0};
  await page.addInitScript(s => localStorage.setItem('ripify.save.v1',JSON.stringify(s)),seed);
  await page.goto('/'); await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack',{timeout:15000}); } finally { await page.keyboard.up('w'); }
  await page.keyboard.press('e');
  await expect(page.locator('.wrapper-body .product-art-image')).not.toHaveClass(/image-loading/);
  await expect(page.locator('.wrapper-body .product-artwork-fallback')).toBeHidden();
  await page.screenshot({path:'artifacts/151-wrapper-artwork.png'});
  const seam = (await page.locator('[data-tear]').boundingBox())!;
  await page.mouse.move(seam.x+8,seam.y+20); await page.mouse.down(); await page.mouse.move(seam.x+seam.width-8,seam.y+20,{steps:12}); await page.mouse.up();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-index','0',{timeout:15000});
  await expect(page.locator('[data-card] .exact-card-image')).toHaveAttribute('src',/\/artwork\/sve-\d\.jpg/);
  await expect(page.locator('[data-card] .exact-card-image')).not.toHaveClass(/image-loading/);
  await expect(page.locator('[data-card] .missing-card-image')).toBeHidden();
  await page.screenshot({path:'artifacts/151-energy-artwork.png'});
});

for (const id of ['151-etb','151-upc']) test(`${id} displays its own artwork through lid opening`, async ({ page }) => {
  test.setTimeout(90000); const seed = newSave(); seed.settings.graphics = 'Low'; seed.settings.controlsLearned = true;
  seed.sealedProducts.push(createSealed(PRODUCTS.find(p => p.code === id)!,0));
  await page.addInitScript(s => localStorage.setItem('ripify.save.v1',JSON.stringify(s)),seed);
  await page.goto('/'); await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack',{timeout:15000}); } finally { await page.keyboard.up('w'); }
  await page.keyboard.press('e'); await page.locator('[data-container]').click();
  await expect(page.locator('.container-canvas')).toHaveAttribute('data-loaded','true');
  if(id==='151-etb')await expect(page.locator('.container-warning')).toBeEmpty();
  else await expect(page.locator('.container-warning')).toContainText('Metal Mew ex artwork unavailable');
  await page.screenshot({path:`artifacts/${id}-artwork.png`});
  await page.locator('[data-action]').click();
  if(id==='151-etb') {
    await expect(page.locator('.container-canvas')).toHaveAttribute('data-phase','lid');
    await page.locator('[data-action]').click();
  }
  await expect(page.locator('.container-canvas')).toHaveAttribute('data-phase','contents');
  await expect(page.locator('.container-canvas')).toHaveAttribute('data-pack-count',id==='151-etb'?'9':'16');

});

test('failed local product artwork restores an honest fallback', async ({ page }) => {
  test.setTimeout(90000); const seed = newSave(); seed.settings.graphics = 'Low';
  await page.addInitScript(s => localStorage.setItem('ripify.save.v1',JSON.stringify(s)),seed);
  await page.route('**/artwork/151-booster.jpg', route => route.abort());
  await page.goto('/'); await page.keyboard.down('w');
  try { await expect(page.locator('.interaction-prompt')).toContainText('Open Pack',{timeout:15000}); } finally { await page.keyboard.up('w'); }
  await page.keyboard.press('e'); await expect(page.locator('.wrapper-body .product-art-image')).toBeHidden();
  await expect(page.locator('.wrapper-body .product-asset-unavailable')).toHaveText('Artwork unavailable');
});
