import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
await page.route('**/misprint-visual-harness', route => route.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#d9dfda"><div id="scene"></div></body>' }));
try {
  await page.goto('http://127.0.0.1:5173/misprint-visual-harness');
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { createPhysicalCard } = await import('/src/game/physical-card.ts');
    const { generatePack } = await import('/src/core/packs.ts');
    const { createPack } = await import('/src/core/inventory.ts');
    const { makeDefect, rareRandom } = await import('/src/core/rare-events.ts');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(1600, 1050); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.querySelector('#scene').append(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#d9dfda');
    scene.add(new THREE.HemisphereLight('#ffffff', '#9eaaae', 2));
    const light = new THREE.DirectionalLight('#fff5df', 2.2); light.position.set(-2, 3, 4); scene.add(light);
    const rear = new THREE.DirectionalLight('#edf6ff', 1.8); rear.position.set(2, 1, -4); scene.add(rear);
    const camera = new THREE.PerspectiveCamera(34, 1600 / 1050, .01, 10); camera.position.set(0, 0, 2.65); camera.lookAt(0, 0, 0);
    const copy = generatePack({ ...createPack(), uid: 'visual-production', seed: 9072854 }, undefined, 0)[0];
    const types = ['off-center', 'miscut', 'registration', 'ink-defect']; const items = [];
    for (let i = 0; i < 4; i++) for (const graded of [false, true]) {
      const owned = { ...copy, uid: `visual-${i}`, cardId: `sve-${i + 1}`, ...(graded ? { status: 'graded', grader: 'BGS', grade: 7, subgrades: [6, 8, 7, 8] } : {}), misprint: { ...copy.misprint, defect: { ...makeDefect(rareRandom(53, i)), type: types[i], side: 'both' } } };
      const item = createPhysicalCard(owned); item.group.position.set((i - 1.5) * .49, graded ? -.36 : .36, 0); scene.add(item.group); items.push(item);
    }
    await Promise.all(items.map(item => item.ready));
    window.__misprintVisual = { items, scene, renderer, camera }; renderer.render(scene, camera);
  });
  for (const side of ['front', 'back', 'angled']) {
    await page.evaluate(side => {
      const { items, scene, renderer, camera } = window.__misprintVisual;
      items.forEach(item => { item.group.rotation.y = side === 'back' ? Math.PI : side === 'angled' ? .65 : 0; }); renderer.render(scene, camera);
    }, side);
    await page.screenshot({ path: `artifacts/misprint-gallery-${side}.png` });
  }
  await page.evaluate(() => { const { items, renderer } = window.__misprintVisual; items.forEach(i => i.dispose()); renderer.dispose(); });
} finally { await browser.close(); }
