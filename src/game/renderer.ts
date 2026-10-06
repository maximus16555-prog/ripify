import * as THREE from 'three';
import type { Settings } from '../core/types';
export const PRESETS = { Low: { ratio: .8, shadows: false, shadowSize: 512 }, Medium: { ratio: 1.2, shadows: true, shadowSize: 1024 }, High: { ratio: 2, shadows: true, shadowSize: 2048 } };
export function autoPreset() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  if ((nav.deviceMemory ?? 8) <= 4 || navigator.hardwareConcurrency <= 4) return 'Low';
  return 'Medium';
}
export class GameRenderer {
  renderer: THREE.WebGLRenderer;
  activePreset = 'Medium';
  needsRender = true;
  private applied = '';
  private measuredFrames = 0;
  private measuredTime = 0;
  private autoDowngraded = false;
  private viewport = new THREE.Vector2();
  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.06; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'game-canvas'; this.renderer.domElement.setAttribute('aria-label', 'RIPIFY 3D game world'); this.renderer.domElement.tabIndex = 0;
    container.prepend(this.renderer.domElement);
  }
  apply(settings: Settings, scene: THREE.Scene) {
    const preset = settings.graphics === 'Auto' ? this.autoDowngraded ? 'Low' : autoPreset() : settings.graphics; this.activePreset = preset;
    const key = `${preset}:${settings.renderScale}`; if (key === this.applied) return; this.applied = key;
    this.invalidate();
    const config = PRESETS[preset], ratio = Math.min(devicePixelRatio, config.ratio) * settings.renderScale;
    if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio);
    this.renderer.getSize(this.viewport);
    if (this.viewport.x !== innerWidth || this.viewport.y !== innerHeight) this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = config.shadows;
    scene.traverse(o => {
      if (!(o instanceof THREE.DirectionalLight)) return;
      const changed = o.shadow.mapSize.x !== config.shadowSize || o.shadow.mapSize.y !== config.shadowSize;
      o.shadow.mapSize.set(config.shadowSize, config.shadowSize);
      if (changed || !config.shadows) { o.shadow.map?.dispose(); o.shadow.map = null; }
    });
  }
  worldChanged() { this.applied = ''; }
  invalidate = () => { this.needsRender = true; };
  sampleFrame(milliseconds: number, settings: Settings, scene: THREE.Scene) {
    if (settings.graphics !== 'Auto' || this.activePreset === 'Low' || this.autoDowngraded) return;
    this.measuredFrames++;
    if (this.measuredFrames <= 10) return; // Skip initial shader compilation.
    this.measuredTime += Math.min(milliseconds, 100);
    if (this.measuredFrames >= 100) {
      if (this.measuredTime / 90 > 25) { this.autoDowngraded = true; this.apply(settings, scene); }
      this.measuredTime = 0; this.measuredFrames = 0;
    }
  }
  resize(camera: THREE.PerspectiveCamera) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); this.invalidate(); }
  dispose() { this.renderer.dispose(); this.renderer.domElement.remove(); }
}
