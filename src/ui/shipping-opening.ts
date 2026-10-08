import * as THREE from 'three';
import './shipping.css';
import { ShippingBox } from '../game/shipping-box';
import { acquireContainerRenderer, releaseContainerRenderer } from './container-view';
import type { GameStore } from '../core/store';
import type { GameAudio } from '../game/audio';

/** Close-up of the selected real package. Only presentation animates; stages and
 * final fulfillment must be durably committed before the interaction can advance. */
export class ShippingOpening {
  private renderer = acquireContainerRenderer(); private scene = new THREE.Scene(); private camera = new THREE.PerspectiveCamera(37, 1, .01, 20);
  private model: ShippingBox; private observer: ResizeObserver; private abort = new AbortController();
  private frame = 0; private disposed = false; private yaw = .28; private pitch = .86;
  private progress = 0; private drag?: { id: number; x: number; y: number; start: number; orbit: boolean };
  private animation?: { from: number; to: number; start: number; commit: boolean };
  private phase: 'tape' | 'flaps' | 'contents'; private ready = false;
  private mat: THREE.Mesh; private light: THREE.DirectionalLight;
  constructor(private host: HTMLElement, private store: GameStore, private audio: GameAudio, private uid: string, private close: () => void, private notify: (text: string) => void) {
    const p = store.state.shippingPackages!.find(p => p.uid === uid && p.stage !== 'claimed')!;
    this.phase = p.stage === 'sealed' ? 'tape' : p.stage === 'untaped' ? 'flaps' : 'contents';
    host.className = 'modal-root opening-root'; host.innerHTML = `<section class="shipping-stage" role="dialog" aria-modal="true" aria-label="Open Package"><header><div><span class="eyebrow">DELIVERY</span><h1>${p.source === 'grading' ? 'Grading return' : 'Pokémon Store package'}</h1></div><button data-close class="text-button">Back <kbd>Esc</kbd></button></header><div class="shipping-viewport"></div><footer><span data-shipping-hint></span><div><button data-shipping-orbit="-1" aria-label="View package from left">↶</button><button data-shipping-action></button><button data-shipping-orbit="1" aria-label="View package from right">↷</button></div><small data-shipping-message role="status">Preparing exact order contents…</small></footer></section>`;
    this.model = new ShippingBox(p, store.state); this.scene.add(this.model.group);
    const settings = store.state.settings;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.graphics === 'Low' ? 1 : 1.5) * settings.renderScale);
    this.renderer.shadowMap.enabled = settings.graphics !== 'Low'; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement; canvas.className = 'shipping-canvas'; canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Physical shipping package. Drag right to remove tape; drag up to open flaps and lift contents. Right drag to rotate.');
    for (const key of Object.keys(canvas.dataset)) delete canvas.dataset[key];
    host.querySelector('.shipping-viewport')!.append(canvas);
    this.mat = new THREE.Mesh(new THREE.BoxGeometry(5, .02, 5), new THREE.MeshStandardMaterial({ color: '#726855', roughness: .99 })); this.mat.position.y = -.011; this.mat.receiveShadow = true; this.scene.add(this.mat);
    this.scene.add(new THREE.HemisphereLight('#fff4e4', '#858178', 2.1));
    this.light = new THREE.DirectionalLight('#fff1d6', 3); this.light.position.set(-2, 4, 3); this.light.castShadow = true; this.light.shadow.mapSize.set(512, 512);
    Object.assign(this.light.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: .1, far: 10 }); this.light.shadow.normalBias = .007; this.scene.add(this.light);
    const fill = new THREE.DirectionalLight('#dce9ff', .9); fill.position.set(3, 2, -3); this.scene.add(fill);
    const signal = this.abort.signal;
    canvas.addEventListener('contextmenu', e => e.preventDefault(), { signal });
    canvas.addEventListener('pointerdown', e => {
      if (this.animation || this.drag || !e.isPrimary || ![0, 2].includes(e.button) || !this.ready) return;
      const rect = canvas.getBoundingClientRect(), ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2), this.camera);
      if (e.button === 0 && !ray.intersectObject(this.model.group, true).some(hit => hit.object.visible)) return;
      e.preventDefault(); canvas.setPointerCapture(e.pointerId); this.audio.unlock(); this.audio.play('crinkle');
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: this.progress, orbit: e.button === 2 }; canvas.focus();
    }, { signal });
    canvas.addEventListener('pointermove', e => {
      const drag = this.drag; if (!drag || e.pointerId !== drag.id) return;
      if (drag.orbit) { this.yaw -= (e.clientX - drag.x) * .008; this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - drag.y) * .005, .24, 1.35); drag.x = e.clientX; drag.y = e.clientY; }
      else this.progress = THREE.MathUtils.clamp(drag.start + (this.phase === 'tape' ? e.clientX - drag.x : drag.y - e.clientY) / 210, 0, 1);
      this.apply(); this.invalidate();
    }, { signal });
    const release = (e: PointerEvent, cancelled = false) => {
      const drag = this.drag; if (!drag || e.pointerId !== drag.id) return; this.drag = undefined;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (!drag.orbit) this.animate(!cancelled && this.progress >= .72);
    };
    canvas.addEventListener('pointerup', e => release(e), { signal }); canvas.addEventListener('pointercancel', e => release(e, true), { signal });
    canvas.addEventListener('lostpointercapture', e => { if (this.drag?.id === e.pointerId) release(e as PointerEvent, true); }, { signal });
    host.querySelector<HTMLButtonElement>('[data-close]')!.onclick = close;
    host.querySelector<HTMLButtonElement>('[data-shipping-action]')!.onclick = () => { this.audio.unlock(); this.animate(true); };
    host.querySelectorAll<HTMLButtonElement>('[data-shipping-orbit]').forEach(b => b.onclick = () => { this.yaw += Number(b.dataset.shippingOrbit) * .4; this.invalidate(); });
    const viewport = host.querySelector<HTMLElement>('.shipping-viewport')!;
    this.observer = new ResizeObserver(() => { const w = viewport.clientWidth, h = viewport.clientHeight; this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); this.invalidate(); }); this.observer.observe(viewport);
    this.hint(); this.invalidate();
    void this.model.ready.then(() => { if (this.disposed) return; this.ready = true; this.host.querySelector('[data-shipping-message]')!.textContent = `${p.itemUids.length} ${p.source === 'grading' ? 'returned slab' : 'sealed item'}${p.itemUids.length === 1 ? '' : 's'} · Right-drag to rotate`; this.hint(); this.invalidate(); });
  }
  private hint() {
    const button = this.host.querySelector<HTMLButtonElement>('[data-shipping-action]')!; button.disabled = !this.ready || !!this.animation;
    button.textContent = this.phase === 'tape' ? 'Remove tape' : this.phase === 'flaps' ? 'Open flaps' : 'Take contents';
    this.host.querySelector('[data-shipping-hint]')!.textContent = this.phase === 'tape' ? 'Pull the tape to the right' : this.phase === 'flaps' ? 'Lift the top flaps' : 'Lift out your order';
  }
  private apply() { if (this.phase === 'tape') this.model.setTape(this.progress); else if (this.phase === 'flaps') this.model.setFlaps(this.progress); else this.model.liftContents(this.progress); }
  private animate(commit: boolean) { if (this.animation || !this.ready) return; this.animation = { from: this.progress, to: commit ? 1 : 0, start: performance.now(), commit }; this.hint(); this.invalidate(); }
  private invalidate() {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(now => {
      this.frame = 0; if (this.disposed) return;
      const a = this.animation;
      if (a) {
        const t = Math.min(1, (now - a.start) / (this.phase === 'flaps' ? 600 : 420)); this.progress = THREE.MathUtils.lerp(a.from, a.to, t * t * (3 - 2 * t)); this.apply();
        if (t === 1) {
          this.animation = undefined;
          if (a.commit) {
            const success = this.phase === 'contents' ? this.store.claimPackage(this.uid) : this.store.packageStage(this.uid, this.phase === 'tape' ? 'untaped' : 'open');
            if (success) {
              this.audio.play(this.phase === 'contents' ? 'swipe' : 'crinkle');
              if (this.phase === 'contents') { this.notify('Package contents collected'); this.close(); return; }
              this.phase = this.phase === 'tape' ? 'flaps' : 'contents'; this.progress = 0;
            } else { this.progress = 0; this.apply(); this.host.querySelector('[data-shipping-message]')!.textContent = 'Could not save. Contents remain safely in the package.'; }
          }
          this.hint();
        }
      }
      const d = this.model.packageData.dimensions, radius = Math.max(d.width, d.depth, .5) * Math.max(2.55, 1.5 / this.camera.aspect);
      const target = new THREE.Vector3(0, d.height * .6, 0);
      this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * radius, target.y + Math.sin(this.pitch) * radius, Math.cos(this.yaw) * Math.cos(this.pitch) * radius); this.camera.lookAt(target); this.camera.updateMatrixWorld();
      this.renderer.render(this.scene, this.camera);
      Object.assign(this.renderer.domElement.dataset, { packageUid: this.uid, phase: this.phase, progress: String(this.progress), itemUids: JSON.stringify(this.model.itemUids), drawCalls: String(this.renderer.info.render.calls), ready: String(this.ready) });
      if (this.animation) this.invalidate();
    });
  }
  dispose() { if (this.disposed) return; this.disposed = true; this.abort.abort(); this.observer.disconnect(); cancelAnimationFrame(this.frame); this.model.dispose(); this.mat.geometry.dispose(); (this.mat.material as THREE.Material).dispose(); this.light.shadow.map?.dispose(); this.light.shadow.mapPass?.dispose(); this.renderer.domElement.remove(); releaseContainerRenderer(this.renderer); }
}
