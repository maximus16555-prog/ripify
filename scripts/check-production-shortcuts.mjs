import { chromium } from '@playwright/test';
import { readdir, readFile, writeFile } from 'node:fs/promises';
const js = await Promise.all((await readdir('dist/assets')).filter(f=>f.endsWith('.js')).map(f=>readFile(`dist/assets/${f}`,'utf8')));
if (js.some(s=>s.includes('Dev: 151 test pack added') || s.includes('Dev: Ascended Heroes test pack added') || s.includes('createTestPack'))) throw new Error('Development controls in production bundle');
const browser = await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=d3d11','--ignore-gpu-blocklist']});
try {
  const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5191'); await page.locator('.loading').waitFor({state:'detached'});
  // Gameplay input must actually be initialized, not merely an early HUD.
  await page.keyboard.press('Escape'); await page.locator('[data-resume]').waitFor(); await page.locator('[data-resume]').click();
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('ripify.save.v1')||'null'));
  await page.keyboard.press('Control+Shift+Digit1'); await page.keyboard.press('Control+Shift+Digit2');
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('ripify.save.v1')||'null'));
  if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Production shortcuts changed inventory');
  if(await page.evaluate(()=>!!window.__ripifyDebug))throw new Error('Production debug surface exposed');
  if(errors.length)throw new Error(errors.join('\n'));
  const report={bundleContainsDevControls:false,productionShortcutsChangeInventory:false,debugSurfaceExposed:false,runtimeErrors:errors};
  await writeFile('artifacts/production-shortcuts-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await browser.close();}
