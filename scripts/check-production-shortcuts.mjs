import { chromium } from '@playwright/test';
import { readdir, readFile, writeFile } from 'node:fs/promises';
const js = await Promise.all((await readdir('dist/assets')).filter(f=>f.endsWith('.js')).map(f=>readFile(`dist/assets/${f}`,'utf8')));
if (!js.some(s=>s.includes('Dev: 151 test pack added') && s.includes('Dev: Ascended Heroes test pack added'))) throw new Error('Hidden shortcuts missing from production bundle');
const browser = await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=d3d11','--ignore-gpu-blocklist']});
try {
  const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.RIPIFY_URL || 'https://ripify.freebuff.app/'); await page.locator('.game-canvas').waitFor(); await page.locator('.loading').waitFor({state:'detached'});
  // Gameplay input must actually be initialized, not merely an early HUD.
  await page.keyboard.press('Escape'); await page.locator('[data-resume]').waitFor(); await page.locator('[data-resume]').click();
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('ripify.save.v1')||'null'));
  await page.keyboard.press('Control+Shift+Digit1'); await page.keyboard.press('Control+Shift+Digit2');
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('ripify.save.v1')||'null'));
  // A fresh game need not write its starter save until the first mutation.
  const added=after.packs.filter(p=>p.debugGenerated && !before?.packs.some(old=>old.uid===p.uid));
  if(added.length!==2 || added[0].productId!=='151-booster' || added[0].rareEvents?.special?.type!=='english-151-demigod' || added[1].productId!=='ascended-heroes-booster' || added[1].rareEvents?.special?.type!=='ascended-heroes-god')throw new Error('Production shortcuts did not add the correct special packs');
  if(after.opening || after.cards.length!==(before?.cards.length ?? 0) || added.some(p=>p.state!=='unopened'))throw new Error('Shortcut auto-opened inventory');
  if(await page.evaluate(()=>!!window.__ripifyDebug))throw new Error('Production debug surface exposed');
  if(errors.length)throw new Error(errors.join('\n'));
  const report={url:page.url(),bundleContainsHiddenShortcuts:true,productionShortcutsChangeInventory:true,addedSpecials:added.map(p=>p.rareEvents.special.type),debugSurfaceExposed:false,runtimeErrors:errors};
  await writeFile('artifacts/production-shortcuts-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await browser.close();}
