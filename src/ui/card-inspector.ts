import * as THREE from 'three';
import type { OwnedCard } from '../core/types';
import { CARD_BY_ID } from '../data/cards';
import { createPhysicalCard } from '../game/physical-card';
import { slabPresentation } from '../assets/card-presentation';
import { physicalCardSignature } from '../game/display-cards';

// One context retains at most one raw copy and one slab to keep both shader
// variants warm. Dormant previews never render or keep interaction listeners.
type CachedCard = { item: ReturnType<typeof createPhysicalCard>; signature: string };
type Preview = { renderer: THREE.WebGLRenderer; cards: Map<string, CachedCard> };
let cachedPreview: Preview | undefined;
export function disposeCardInspectionResources() {
  if (!cachedPreview) return;
  cachedPreview.cards.forEach(card => card.item.dispose()); cachedPreview.renderer.dispose(); cachedPreview.renderer.forceContextLoss(); cachedPreview = undefined;
}

/** The inspection panel and room displays use the same physical copy renderer. */
export class CardInspector {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, .01, 10);
  private item: ReturnType<typeof createPhysicalCard>;
  private observer: ResizeObserver;
  private frame = 0;
  private disposed = false;
  private yaw = 0;
  private pitch = 0;
  private drag?: { id: number; x: number; y: number };
  private abort = new AbortController();
  private signature: string;
  private retained: Map<string, CachedCard>;
  private kind: string;
  private rendered = false;

  constructor(private root: HTMLElement, owned: OwnedCard) {
    if (cachedPreview?.renderer.getContext().isContextLost()) disposeCardInspectionResources();
    const cached = cachedPreview; cachedPreview = undefined;
    this.signature = physicalCardSignature(owned);
    this.kind = slabPresentation(owned) ? 'slab' : 'raw'; this.retained = cached?.cards ?? new Map();
    const previous = this.retained.get(this.kind);
    this.renderer = cached?.renderer ?? new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.item = previous?.signature === this.signature ? previous.item : createPhysicalCard(owned);
    this.scene.add(this.item.group);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#9eaaae', 2));
    const key = new THREE.DirectionalLight('#fff5df', 2.2); key.position.set(-2, 3, 4); this.scene.add(key);
    const rear = new THREE.DirectionalLight('#edf6ff', 1.8); rear.position.set(2, 1, -4); this.scene.add(rear);
    const slab = slabPresentation(owned), definition = CARD_BY_ID.get(owned.cardId)!;
    root.classList.add('physical-inspection');
    root.replaceChildren();
    const canvas = this.renderer.domElement;
    canvas.className = 'physical-card-canvas'; canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', `${definition.name}${slab ? `, ${slab.grader} grade ${slab.grade}` : ', raw card'}. Drag or use arrow keys to rotate.`);
    canvas.dataset.uid = owned.uid; canvas.dataset.kind = slab ? 'slab' : 'raw';
    if (slab?.cert) canvas.dataset.cert = slab.cert; else delete canvas.dataset.cert;
    delete canvas.dataset.frontImage; delete canvas.dataset.backImage;
    root.append(canvas);
    const controls = document.createElement('div'); controls.className = 'physical-card-controls';
    controls.innerHTML = '<span>Drag to rotate</span><button class="text-button" data-flip>Flip</button><button class="text-button" data-reset-view>Reset view</button>';
    root.append(controls);
    const info = document.createElement('small'); info.className = 'physical-card-caption';
    info.textContent = slab ? `${slab.grader} ${slab.grade} · ${slab.cert} · Simulated` : 'Front'; root.append(info);
    const options = { signal: this.abort.signal };
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || this.drag) return;
      e.preventDefault(); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId);
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }, options);
    canvas.addEventListener('pointermove', e => {
      if (this.drag?.id !== e.pointerId) return;
      this.yaw += (e.clientX - this.drag.x) * .012;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - this.drag.y) * .009, -1.25, 1.25);
      this.drag.x = e.clientX; this.drag.y = e.clientY; this.invalidate();
    }, options);
    const release = (e: PointerEvent) => { if (this.drag?.id === e.pointerId) { this.drag = undefined; if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); } };
    canvas.addEventListener('pointerup', release, options); canvas.addEventListener('pointercancel', release, options); canvas.addEventListener('lostpointercapture', release, options);
    canvas.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'ArrowLeft') this.yaw -= Math.PI / 12;
      if (e.key === 'ArrowRight') this.yaw += Math.PI / 12;
      if (e.key === 'ArrowUp') this.pitch = Math.max(-1.25, this.pitch - .12);
      if (e.key === 'ArrowDown') this.pitch = Math.min(1.25, this.pitch + .12);
      this.invalidate();
    }, options);
    controls.querySelector('[data-flip]')!.addEventListener('click', () => { this.yaw = Math.round(this.yaw / Math.PI) * Math.PI + Math.PI; this.pitch = 0; this.invalidate(); }, options);
    controls.querySelector('[data-reset-view]')!.addEventListener('click', () => { this.yaw = this.pitch = 0; this.invalidate(); }, options);
    document.addEventListener('visibilitychange', () => { this.drag = undefined; if (!document.hidden) this.invalidate(); }, options);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); info.textContent = 'Preview interrupted. Close and reopen the card.'; }, options);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
    void this.item.ready.then(() => {
      if (this.disposed) return;
      const front = this.item.group.getObjectByName('card-front') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const back = this.item.group.getObjectByName('card-back') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      canvas.dataset.frontImage = front.material.map!.userData.state; canvas.dataset.backImage = back.material.map!.userData.state;
      this.invalidate();
    });
  }
  private resize() {
    if (this.disposed) return;
    const canvas = this.renderer.domElement, width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height;
    const extent = Math.max(this.item.size.height, this.item.size.width / this.camera.aspect);
    this.camera.position.z = extent * .62 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.updateProjectionMatrix(); this.invalidate();
  }
  private invalidate() {
    if (this.disposed || this.frame || document.hidden) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0; if (this.disposed) return;
      this.item.group.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      const canvas = this.renderer.domElement;
      canvas.dataset.yaw = String(this.yaw); canvas.dataset.pitch = String(this.pitch);
      canvas.dataset.side = Math.cos(this.yaw) >= 0 ? 'front' : 'back';
      if (!canvas.dataset.cert) this.root.querySelector('.physical-card-caption')!.textContent = Math.abs(Math.cos(this.yaw)) < .05 ? 'Card edge' : Math.cos(this.yaw) >= 0 ? 'Front' : 'Back';
      this.renderer.render(this.scene, this.camera);
      this.rendered = true;
      // New materials have acquired their shared programs before the old copy
      // releases them, avoiding a shader-link stall on every different card.
      const previous = this.retained.get(this.kind);
      if (previous && previous.item !== this.item) previous.item.dispose();
      this.retained.set(this.kind, { item: this.item, signature: this.signature });
    });
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.abort.abort(); this.observer.disconnect(); cancelAnimationFrame(this.frame);
    this.renderer.domElement.remove(); this.scene.clear(); this.renderer.renderLists.dispose();
    disposeCardInspectionResources();
    if (!this.rendered && this.retained.get(this.kind)?.item !== this.item) this.item.dispose();
    cachedPreview = { renderer: this.renderer, cards: this.retained };
  }
}
