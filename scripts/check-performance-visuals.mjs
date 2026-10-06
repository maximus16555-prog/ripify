import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const label = process.argv[2] ?? 'before';
const browser = await chromium.launch({ headless:true, args:['--enable-webgl','--use-angle=d3d11','--ignore-gpu-blocklist'] });
const page = await browser.newPage({viewport:{width:1280,height:720}});
await page.route('**/performance-visual-harness', route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="scene"></div></body>'}));
await page.goto('http://127.0.0.1:5173/performance-visual-harness');
await mkdir('artifacts',{recursive:true});
try {
  for (const kind of ['home','shop']) {
    await page.evaluate(async kind=>{
      const THREE=await import('/node_modules/.vite/deps/three.js');
      const {buildWorld}=await import('/src/game/world.ts');
      const {Player}=await import('/src/game/player.ts');
      const {FollowCamera}=await import('/src/game/camera.ts');
      const {GameRenderer}=await import('/src/game/renderer.ts');
      const {createPhysicalCard,placeOnStand}=await import('/src/game/physical-card.ts');
      window.__visual?.dispose(); const root=document.querySelector('#scene'); root.replaceChildren();
      const scene=new THREE.Scene();scene.background=new THREE.Color('#e5dfd0');scene.fog=new THREE.Fog('#e5dfd0',24,48);
      const world=buildWorld(kind),player=new Player(),camera=new FollowCamera(),renderer=new GameRenderer(root);
      scene.add(world.group,player.group);player.reset(world.spawn);
      player.update(0,{keys:new Set()},0,world.colliders,()=>{});
      const items=[];
      for(let i=0;i<world.displaySlots.length;i++){
        const owned={uid:`visual-${i}`,cardId:`sve-${i+1}`,condition:{centering:90,corners:85,edges:80,surface:85,print:95},finish:'normal',status:i===0?'graded':'raw',...(i===0?{grader:'BGS',grade:9.5,subgrades:[9.5,9,9.5,10]}:{})};
        const item=createPhysicalCard(owned);placeOnStand(item);world.displaySlots[i].add(item.group);items.push(item);
      }
      await Promise.all(items.map(i=>i.ready)); await new Promise(r=>setTimeout(r,400));
      renderer.apply({graphics:'High',renderScale:1},scene);world.group.updateMatrixWorld(true);
      camera.update(0,player.group.position,{lookX:0,lookY:0},1,world.cameraMeshes,true);
      renderer.renderer.render(scene,camera.camera);
      window.__visual={scene,world,player,camera,renderer,dispose(){items.forEach(i=>i.dispose());world.dispose();player.dispose();renderer.dispose();}};
    },kind);
    await page.locator('.game-canvas').screenshot({path:`artifacts/performance-${label}-${kind}.png`});
    if(kind==='home'){
      await page.evaluate(()=>{const v=window.__visual;v.player.group.position.set(1,0,-1.4);v.camera.update(0,v.player.group.position,{lookX:0,lookY:0},1,v.world.cameraMeshes,true);v.renderer.renderer.render(v.scene,v.camera.camera);});
      await page.locator('.game-canvas').screenshot({path:`artifacts/performance-${label}-desk.png`});
    }
  }
}finally{await browser.close();}
