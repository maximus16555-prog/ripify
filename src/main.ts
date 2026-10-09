import './style.css';
import * as THREE from 'three';
import { GameStore } from './core/store';
import { DisplayCards } from './game/display-cards';
import { GameAudio } from './game/audio';
import { GameRenderer } from './game/renderer';
import { Input } from './game/input';
import { Player } from './game/player';
import { FollowCamera } from './game/camera';
import { InteractionSystem } from './game/interaction';
import { softShadowTexture } from './game/materials';
import { buildWorld, type World, type Interactable, type WorldLocation } from './game/world';
import { buildOutdoorWorld, SHOP_RETURN_SPAWN } from './game/outdoor-world';
import { GameUI } from './ui/game-ui';
import { createTestPack } from './dev/test-packs';
import { DeliveryPile } from './game/delivery-pile';

const app = document.querySelector<HTMLElement>('#app')!;
async function start() {
  const store = new GameStore(); const audio = new GameAudio(() => store.state.settings);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e5dfd0'); scene.fog = new THREE.Fog('#e5dfd0', 24, 48);
  const renderer = new GameRenderer(app); const player = new Player(); const camera = new FollowCamera(); const interactions = new InteractionSystem();
  const contactTexture = softShadowTexture();
  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(.88, .88), new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false, opacity: .8 }));
  contactShadow.rotation.x = -Math.PI / 2; scene.add(contactShadow);
  let world: World = buildWorld('home', renderer.invalidate); let location: WorldLocation = 'home'; let nearest: Interactable | undefined; let switching = false;
  // Locations are loaded on first visit. Inactive groups are detached:
  // no rendering, interaction queries, physics or animation work continues.
  const worlds = new Map<WorldLocation, World>([['home', world]]);
  const deliveries = new DeliveryPile(world, renderer.invalidate); store.arriveDeliveries(); deliveries.sync(store.state.shippingPackages ?? []);
  scene.add(world.group, player.group); player.reset(world.spawn); world.group.updateMatrixWorld(true);
  app.querySelector('.loading')?.remove(); const overlay = document.createElement('div'); overlay.className = 'game-overlay'; app.append(overlay);
  const ui = new GameUI(overlay, store, audio, () => { input.pause(); audio.unlock(); }, () => { input.resume(); renderer.renderer.domElement.focus({ preventScroll: true }); }, () => renderer.activePreset);
  const input = new Input(renderer.renderer.domElement, () => {
    if (switching || ui.isOpen || !nearest) return;
    audio.unlock(); audio.play('click'); ui.learnControls(); const i = nearest;
    if (i.action === 'door' && i.destination) void switchWorld(i.destination);
    else if (i.action === 'desk') ui.packs();
    else if (i.action === 'binder') ui.binder();
    else if (i.action === 'computer') ui.computer();
    else if (i.action === 'package') ui.shippingPackage(i.id);
    else if (i.action === 'display') ui.displays();
    else if (i.action === 'buy') ui.buy(i.product?.code);
    else if (i.action === 'shop') ui.buy();
  }, () => { if (switching) return; if (ui.isOpen) ui.close(); else if (!document.pointerLockElement) ui.settings(); }, () => audio.unlock(), () => store.grantCurrencyBonus(), slot => {
    if (store.addUnopenedPack(createTestPack(slot))) ui.toast(slot === 1 ? 'Dev: 151 test pack added' : 'Dev: Ascended Heroes test pack added');
  });
  let deliveryPointer: THREE.Vector2 | undefined;
  const pointDelivery = (e: PointerEvent) => {
    if (document.pointerLockElement || e.buttons) { deliveryPointer = undefined; return; }
    const rect = renderer.renderer.domElement.getBoundingClientRect(); deliveryPointer = new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2);
  };
  const leaveDelivery = () => { deliveryPointer = undefined; };
  renderer.renderer.domElement.addEventListener('pointermove', pointDelivery); renderer.renderer.domElement.addEventListener('pointerleave', leaveDelivery);
  if (import.meta.env.DEV) Object.defineProperty(window, '__ripifyDebug', { configurable: true, get: () => ({ position: player.group.position.toArray(), camera: camera.camera.position.toArray(), velocity: player.velocity.toArray(), keys: [...input.keys], grounded: player.grounded, drawCalls: renderer.renderer.info.render.calls, triangles: renderer.renderer.info.render.triangles, geometries: renderer.renderer.info.memory.geometries, textures: renderer.renderer.info.memory.textures, preset: renderer.activePreset, focus: ui.openingActive, displays: world.displaySlots.map(slot => slot.children.map(item => ({ ...item.userData, kind: item.name, parts: item.children.map(p => p.name) }))) }) });
  renderer.apply(store.state.settings, scene); camera.update(0, player.group.position, input, store.state.settings.sensitivity, world.cameraMeshes, true);
  ui.setLocation(world.name);
  if (store.warning) ui.toast(store.warning);
  const displayResources = new DisplayCards(renderer.invalidate);
  const clearDisplays = () => displayResources.dispose();
  const updateDisplays = () => {
    if (location !== 'home') return;
    displayResources.sync(world.displaySlots, store.state.displays.map(uid => store.state.cards.find(c => c.uid === uid)));
  };
  updateDisplays();
  const unsubscribe = store.subscribe(() => { renderer.apply(store.state.settings, scene); audio.update(); updateDisplays(); deliveries.sync(store.state.shippingPackages ?? []); if (store.warning) ui.toast(store.warning); });
  async function switchWorld(destination: WorldLocation) {
    if (switching) return; switching = true; input.pause(); ui.setPrompt(); ui.pointAt();
    app.classList.add('world-transition');
    await new Promise(resolve => setTimeout(resolve, 180));
    const previous = location; clearDisplays(); scene.remove(world.group); location = destination;
    world = worlds.get(location) ?? (location === 'outside' ? buildOutdoorWorld() : buildWorld(location, renderer.invalidate)); worlds.set(location, world);
    const atmosphere = world.atmosphere ?? { sky: '#e5dfd0', fogNear: 24, fogFar: 48, viewDistance: 60 };
    scene.background = new THREE.Color(atmosphere.sky); scene.fog = new THREE.Fog(atmosphere.sky, atmosphere.fogNear, atmosphere.fogFar);
    camera.camera.far = atmosphere.viewDistance; camera.camera.updateProjectionMatrix();
    scene.add(world.group); world.group.updateMatrixWorld(true); const returningFromShop = location === 'outside' && previous === 'shop'; const yaw = returningFromShop ? 0 : world.entryYaw ?? world.spawnYaw ?? 0; player.reset(returningFromShop ? SHOP_RETURN_SPAWN : world.entrySpawn ?? world.spawn, yaw); camera.yaw = yaw; camera.pitch = .46; interactions.clear();
    camera.update(0, player.group.position, input, store.state.settings.sensitivity, world.cameraMeshes, true);
    renderer.worldChanged(); renderer.apply(store.state.settings, scene); updateDisplays(); nearest = undefined; ui.setPrompt();
    // Link the destination's shaders asynchronously during the existing fade,
    // before a normal render can block on getProgramInfoLog/getProgramParameter.
    try { await renderer.renderer.compileAsync(scene, camera.camera); } catch (error) { console.warn('Shader warmup failed; using normal rendering.', error); }
    ui.setLocation(world.name); app.classList.remove('world-transition'); input.resume(); switching = false;
  }
  const resize = () => renderer.resize(camera.camera); window.addEventListener('resize', resize);
  let frameId = 0; let last = performance.now(); let lastRender = 0; let fpsTime = last; let frames = 0; let notifiedOrder = '';
  let wasOpen = false; let wasOpening = false;
  const renderedPosition = new THREE.Vector3(), renderedRotation = new THREE.Quaternion();
  const tick = (time: number) => {
    if (document.hidden) return;
    frameId = requestAnimationFrame(tick); const elapsed = Math.max(0, time - last); const dt = Math.min(.15, elapsed / 1000); last = time;
    ui.tickComputer(elapsed / 1000);
    if (location === 'home' && !ui.isOpen) deliveries.update(dt);
    frames++; // Include responsive UI frames while the unchanged world is frozen.
    if (switching) return;
    if (ui.isOpen !== wasOpen || ui.openingActive !== wasOpening) { renderer.invalidate(); wasOpen = ui.isOpen; wasOpening = ui.openingActive; }
    if (!ui.isOpen && !switching) {
      // Small collision substeps keep movement consistent without tunnelling on slow frames.
      let remaining = dt;
      while (remaining > 0) { const step = Math.min(1 / 60, remaining); player.update(step, input, camera.yaw, world.colliders, () => audio.play('step'), world.bounds); remaining -= step; }

      ui.noteMovement(dt, Math.hypot(player.velocity.x, player.velocity.z));
      renderer.sampleFrame(elapsed, store.state.settings, scene);
    }
    if (!ui.isOpen && !switching) {
      camera.update(dt, player.group.position, input, store.state.settings.sensitivity, world.cameraMeshes);
      nearest = interactions.find(player.group.position, player.grounded, world);
      if (location === 'home' && player.grounded) nearest = deliveries.aimedAt(camera.camera, player.group.position, document.pointerLockElement ? undefined : deliveryPointer) ?? nearest;
      ui.setPrompt(nearest);
      if (nearest) { const anchor = interactions.screenAnchor(nearest, camera.camera); ui.pointAt(anchor.x, anchor.y, anchor.z); } else ui.pointAt();
    }
    if (ui.openingActive) camera.focusDesk(dt);
    if (ui.computerActive) camera.focusComputer(dt);
    player.group.visible = contactShadow.visible = !(ui.openingActive || ui.computerActive);
    contactShadow.position.set(player.group.position.x, player.groundHeight + .009, player.group.position.z);
    const lift = Math.max(0, player.group.position.y - player.groundHeight);
    contactShadow.scale.setScalar(1 + lift * .3); contactShadow.material.opacity = .8 / (1 + lift * 2);
    const cameraChanged = !renderedPosition.equals(camera.camera.position) || !renderedRotation.equals(camera.camera.quaternion);
    const redraw = !ui.isOpen || renderer.needsRender || ((ui.openingActive || ui.computerActive) && cameraChanged);
    const throttled = ui.isOpen && !renderer.needsRender && (!(ui.openingActive || ui.computerActive) || !camera.transitioning) && time - lastRender < 65;
    if (redraw && !throttled) {
      lastRender = time; renderer.renderer.render(scene, camera.camera); renderer.needsRender = false;
      renderedPosition.copy(camera.camera.position); renderedRotation.copy(camera.camera.quaternion);
      renderer.renderer.domElement.dataset.deliveryCount = String((deliveries.group.userData.packages ?? []).length);
      renderer.renderer.domElement.dataset.deliveryQueued = String(deliveries.group.userData.queued ?? 0);
    }
    if (time - fpsTime > 1000) {
      ui.fps(Math.round(frames * 1000 / (time - fpsTime))); frames = 0; fpsTime = time;
      const delivered = store.state.shippingPackages?.filter(p => p.stage !== 'claimed').at(-1);
      if (delivered && delivered.uid !== notifiedOrder) { notifiedOrder = delivered.uid; ui.updateHUD(); const queued = deliveries.group.userData.queued ?? 0; ui.toast(queued ? `Packages are waiting by the bedroom door. ${queued} more will be placed as space clears.` : 'A shipping package is waiting by the bedroom door.'); }
    }
  };
  frameId = requestAnimationFrame(tick);
  const visibility = () => { input.clear(); if (document.hidden) { cancelAnimationFrame(frameId); audio.suspend(); store.persist(); } else { last = performance.now(); fpsTime = last; frames = 0; audio.resume(); frameId = requestAnimationFrame(tick); } };
  document.addEventListener('visibilitychange', visibility);
  renderer.renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(frameId); input.pause(); store.persist(); const recovery = document.createElement('section'); recovery.className = 'graphics-error'; recovery.innerHTML = '<b>RIPIFY</b><h1>Graphics interrupted</h1><p>Reload to restore your saved game.</p><button>Reload game</button>'; recovery.querySelector('button')!.onclick = () => window.location.reload(); app.append(recovery); });
  renderer.renderer.domElement.addEventListener('webglcontextrestored', () => locationReload());
  const locationReload = () => window.location.reload();
  const saveOnExit = () => store.persist(); window.addEventListener('pagehide', saveOnExit);
  if (import.meta.hot) import.meta.hot.dispose(() => { cancelAnimationFrame(frameId); unsubscribe(); ui.dispose(); input.dispose(); audio.dispose(); clearDisplays(); deliveries.dispose(); renderer.renderer.domElement.removeEventListener('pointermove', pointDelivery); renderer.renderer.domElement.removeEventListener('pointerleave', leaveDelivery); worlds.forEach(room => room.dispose()); worlds.clear(); player.dispose(); contactShadow.geometry.dispose(); contactShadow.material.dispose(); contactTexture.dispose(); renderer.dispose(); window.removeEventListener('resize', resize); window.removeEventListener('pagehide', saveOnExit); document.removeEventListener('visibilitychange', visibility); overlay.remove(); });
}
start().catch(error => {
  console.error(error); app.replaceChildren(); const panel = document.createElement('section'); panel.className = 'graphics-error'; panel.innerHTML = '<b>RIPIFY</b><h1>Couldn’t start the game</h1><p>Enable hardware acceleration and use a desktop browser with WebGL2 support.</p><button>Try again</button>'; panel.querySelector('button')!.onclick = () => window.location.reload(); app.append(panel);
});
