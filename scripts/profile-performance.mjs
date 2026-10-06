import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const output = process.argv[2] ?? 'artifacts/performance-current.json';
const duration = Number(process.env.RIPIFY_PROFILE_SECONDS ?? 8);
const soakSeconds = Number(process.env.RIPIFY_PROFILE_SOAK ?? 180);
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { newSave } = await server.ssrLoadModule('/src/core/save.ts');
const { generatePack } = await server.ssrLoadModule('/src/core/packs.ts');
const seed = newSave(); seed.settings.graphics = 'High'; seed.settings.controlsLearned = true; seed.marketSeed = 42;
for (let i = 0; i < 10; i++) seed.cards.push(...generatePack({ ...seed.packs[0], uid: `profile-${i}`, seed: 100 + i }, undefined, 1000 + i));
seed.cards[0] = { ...seed.cards[0], status: 'graded', grader: 'BGS', grade: 9.5, subgrades: [9.5, 9, 9.5, 10] };
seed.displays = seed.cards.slice(0, 3).map(c => c.uid);
await server.close();
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', `--use-angle=${process.env.RIPIFY_PROFILE_BACKEND ?? 'd3d11'}`] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('Profiler.enable');
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.route('https://assets.tcgdex.net/en/sv/sv03.5/**/high.webp', async route => {
  const id = route.request().url().split('/').at(-2);
  try { await route.fulfill({ body: await readFile(`.freebuff/151-source-audit/images/sv03.5-${id}.webp`), contentType: 'image/webp' }); }
  catch { await route.continue(); }
});
await page.addInitScript(state => {
  if (!localStorage.getItem('ripify.save.v1')) localStorage.setItem('ripify.save.v1', JSON.stringify(state));
  const probe = window.__profile = { active: false, intervals: [], callbacks: [], stages: {}, draws: 0, textureUploads: 0, renders: 0, last: 0, gpu: '', contexts: 0 };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(time => {
    const start = performance.now();
    if (probe.active && callback.name === 'tick') { if (probe.last) probe.intervals.push(time - probe.last); probe.last = time; probe.renders++; }
    callback(time);
    if (probe.active && callback.name === 'tick') probe.callbacks.push(performance.now() - start);
  });
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const gl = get.call(this, type, ...args);
    if (gl && type === 'webgl2' && !gl.__profiled) {
      gl.__profiled = true; probe.contexts++;
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      probe.gpu = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      for (const method of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'texImage2D', 'texSubImage2D']) {
        const original = gl[method].bind(gl);
        gl[method] = (...values) => { if (probe.active) { if (method.startsWith('draw')) probe.draws++; else probe.textureUploads++; } return original(...values); };
      }
    }
    return gl;
  };
}, seed);
await page.goto('http://127.0.0.1:5173'); await page.locator('.loading').waitFor({ state: 'detached' });
await page.evaluate(async () => {
  const modules = [
    ['/src/game/camera.ts', 'FollowCamera', ['update', 'clearDistance', 'focusDesk']],
    ['/src/game/player.ts', 'Player', ['update']],
    ['/src/ui/game-ui.ts', 'GameUI', ['pointAt', 'setPrompt', 'updateHUD', 'fps', 'renderBinderGrid']],
    ['/src/game/renderer.ts', 'GameRenderer', ['apply']]
  ];
  for (const [url, name, methods] of modules) {
    const module = await import(url);
    for (const method of methods) {
      const original = module[name].prototype[method];
      module[name].prototype[method] = function(...args) {
        const start = performance.now(), result = original.apply(this, args), probe = window.__profile;
        if (probe.active) { const entry = probe.stages[`${name}.${method}`] ??= { calls: 0, milliseconds: 0, max: 0 }; const elapsed = performance.now() - start; entry.calls++; entry.milliseconds += elapsed; entry.max = Math.max(entry.max, elapsed); }
        return result;
      };
    }
  }
});
await page.waitForTimeout(2500);
const phases = [];
const percentile = (values, n) => values[Math.min(values.length - 1, Math.floor(values.length * n))] ?? 0;
async function sample(name, action, seconds = duration) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
  await page.evaluate(() => { const p = window.__profile; Object.assign(p, { active: true, intervals: [], callbacks: [], stages: {}, draws: 0, textureUploads: 0, renders: 0, last: 0 }); });
  const start = Date.now(); if (action) await action(); await page.waitForTimeout(Math.max(0, seconds * 1000 - (Date.now() - start)));
  const probe = await page.evaluate(() => { window.__profile.active = false; return window.__profile; });
  const { profile } = await cdp.send('Profiler.stop');
  const functions = new Map(profile.nodes.map(n => [n.id, `${n.callFrame.functionName || '(anonymous)'} ${n.callFrame.url.split('/').at(-1)}`]));
  const counts = {};
  for (const id of profile.samples ?? []) { const name = functions.get(id); counts[name] = (counts[name] ?? 0) + 1; }
  const elapsed = (Date.now() - start) / 1000;
  await cdp.send('HeapProfiler.collectGarbage');
  const metrics = await cdp.send('Performance.getMetrics'), dom = await cdp.send('Memory.getDOMCounters');
  probe.intervals.sort((a,b)=>a-b); probe.callbacks.sort((a,b)=>a-b);
  const result = { name, elapsedSeconds: elapsed, tickHz: probe.renders / elapsed, frameMs: { median: percentile(probe.intervals,.5), p95: percentile(probe.intervals,.95), p99: percentile(probe.intervals,.99), max: Math.max(0,...probe.intervals), over33ms: probe.intervals.filter(v=>v>33.5).length }, tickCpuMs: { median: percentile(probe.callbacks,.5), p95: percentile(probe.callbacks,.95), max: Math.max(0,...probe.callbacks) }, glDrawsPerSecond: probe.draws/elapsed, textureUploads: probe.textureUploads, stages: probe.stages, cpuTop: Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,18), dom, heapUsed: metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value, world: await page.evaluate(()=>window.__ripifyDebug) };
  phases.push(result); console.log(JSON.stringify({ phase:name, gpu:probe.gpu, ...result.frameMs, cpu:result.tickCpuMs, draws:result.glDrawsPerSecond, textures:result.world.textures, listeners:dom.jsEventListeners }));
}
async function coordinate(key, axis, target, greater = false) {
  await page.keyboard.down(key);
  try { await page.waitForFunction(({axis,target,greater}) => greater ? window.__ripifyDebug.position[axis] >= target : window.__ripifyDebug.position[axis] <= target, {axis,target,greater}, {timeout:15000}); }
  finally { await page.keyboard.up(key); } await page.waitForTimeout(180);
}
async function prompt(key, text) {
  await page.keyboard.down(key);
  try { await page.waitForFunction(text => !document.querySelector('.interaction-prompt')?.hidden && document.querySelector('.interaction-prompt')?.textContent.includes(text), text, {timeout:15000}); }
  finally { await page.keyboard.up(key); } await page.waitForTimeout(180);
}
async function inspectSlab() {
  await page.keyboard.press('e'); await page.locator('[data-filter]').selectOption('graded');
  await page.locator(`[data-inspect="${seed.cards[0].uid}"]`).click();
  await page.locator('.physical-card-canvas[data-front-image="ready"]').waitFor();
}
async function swipe() {
  const card = await page.locator('[data-card]').boundingBox();
  const index = await page.locator('[data-card]').getAttribute('data-index');
  await page.mouse.move(card.x + card.width / 2,card.y + card.height / 2); await page.mouse.down();
  await page.mouse.move(card.x + card.width / 2 + 160,card.y + card.height / 2 - 20,{steps:10}); await page.mouse.up();
  if (Number(index)<10) await page.locator(`[data-card][data-index="${Number(index)+1}"]`).waitFor();
  else await page.locator('[data-collect]').waitFor();
  await page.waitForTimeout(160);
}
try {
  await sample('idle-room');
  await sample('walking', async()=> { for (const key of ['w','s','a','d']) { await page.keyboard.down(key); await page.waitForTimeout(duration * 200); await page.keyboard.up(key); } });
  await page.keyboard.down('w'); try { await page.waitForFunction(()=>window.__ripifyDebug.position[2]<=-1.35); } finally { await page.keyboard.up('w'); }
  await page.keyboard.down('d'); try { await page.waitForFunction(()=>document.querySelector('.interaction-prompt')?.textContent.includes('Open Binder')); } finally { await page.keyboard.up('d'); }
  await page.keyboard.press('e');
  await sample('binder');
  await page.locator('[data-filter]').selectOption('graded');
  await page.locator(`[data-inspect="${seed.cards[0].uid}"]`).click(); await page.waitForTimeout(1200);
  await sample('slab-inspection');
  await page.keyboard.press('Escape');
  await sample('room-after-inspection');
  await sample('inspection-and-display-churn', async () => {
    for (let i=0;i<6;i++) {
      await inspectSlab(); await page.locator('[data-flip]').click(); await page.locator('[data-display]').click();
      await page.locator(`[data-slot="${i%3}"]`).click(); await page.waitForTimeout(250);
    }
  });
  await coordinate('a',0,.2);
  await page.keyboard.press('e'); await page.locator('[data-tear]').waitFor(); await page.waitForTimeout(1500);
  await sample('ripping', async () => {
    const seam=await page.locator('[data-tear]').boundingBox();
    await page.mouse.move(seam.x+16,seam.y+20); await page.mouse.down();
    for(let i=1;i<=18;i++){ await page.mouse.move(seam.x+16+(seam.width-21)*i/18,seam.y+20); await page.waitForTimeout(70); }
    await page.mouse.up(); await page.locator('[data-card]').waitFor();
  });
  await sample('card-swiping', async () => { for(let i=0;i<11;i++) await swipe(); });
  await page.locator('[data-collect]').click();
  await prompt('d','Open Binder');
  await sample('soak-inspections-and-travel', async () => {
    const end=Date.now()+soakSeconds*1000; let cycles=0;
    while(Date.now()<end){
      await inspectSlab(); await page.locator('[data-flip]').click(); await page.locator('[data-back]').click(); await page.keyboard.press('Escape');
      await coordinate('s',2,.8,true); await prompt('a','Enter Card Shop'); await page.keyboard.press('e');
      await page.locator('[data-location]').filter({hasText:'Corner Card Shop'}).waitFor();
      await coordinate('a',0,-3.4); await prompt('w','Return Home'); await page.keyboard.press('e');
      await page.locator('[data-location]').filter({hasText:'Your room'}).waitFor();
      await coordinate('w',2,-1.35); await prompt('d','Open Binder');
      console.log(`Soak cycle ${++cycles}`); await page.waitForTimeout(700);
    }
  },soakSeconds);
  await sample('room-after-soak');
  const gpu = await page.evaluate(()=>window.__profile.gpu);
  await mkdir('artifacts',{recursive:true}); await writeFile(output,JSON.stringify({gpu,viewport:{width:1280,height:720},graphics:'High',duration,phases,errors},null,2)+'\n');
} finally {
  await mkdir('artifacts',{recursive:true}); await writeFile(output,JSON.stringify({gpu:await page.evaluate(()=>window.__profile.gpu).catch(()=>''),viewport:{width:1280,height:720},graphics:'High',duration,soakSeconds,phases,errors},null,2)+'\n');
  await browser.close();
}
