import * as THREE from 'three';

/** Small, local, tileable textures shared by all props in the active room. */
export class RoomMaterials {
  readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  readonly textures = new Set<THREE.Texture>();
  private maps = new Map<string, THREE.CanvasTexture>();

  get(color: string, surface: 'paint' | 'wood' | 'fabric' | 'plaster' | 'metal' = 'paint') {
    const key = `${color}:${surface}`;
    let material = this.materials.get(key);
    if (!material) {
      const map = surface === 'metal' || surface === 'paint' ? null : this.texture(surface);
      material = new THREE.MeshStandardMaterial({
        color, map, roughness: surface === 'metal' ? .38 : surface === 'fabric' ? 1 : surface === 'wood' ? .76 : .9,
        metalness: surface === 'metal' ? .55 : 0,
        bumpMap: map, bumpScale: surface === 'wood' ? .006 : surface === 'fabric' ? .003 : .004,
      });
      this.materials.set(key, material);
    }
    return material;
  }

  private texture(kind: 'wood' | 'fabric' | 'plaster') {
    const existing = this.maps.get(kind); if (existing) return existing;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = kind === 'wood' ? 512 : 128;
    const ctx = canvas.getContext('2d')!; const size = canvas.width;
    ctx.fillStyle = '#eeeae2'; ctx.fillRect(0, 0, size, size);
    let seed = 17;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    if (kind === 'wood') {
      for (let x = 0; x < size; x += 2) {
        ctx.beginPath(); ctx.strokeStyle = `rgba(91,68,44,${.03 + random() * .095})`; ctx.lineWidth = .5 + random() * 1.5;
        for (let y = 0; y <= size; y += 8) {
          const bend = Math.sin(y / 65 + x / 35) * 3 + Math.sin(y / 29 + x / 45);
          if (!y) ctx.moveTo(x + bend, y); else ctx.lineTo(x + bend, y);
        }
        ctx.stroke();
      }
    } else if (kind === 'fabric') {
      for (let y = 0; y < size; y += 4) for (let x = 0; x < size; x += 4) {
        ctx.fillStyle = (x + y) % 8 ? '#e8e5db' : '#f0ece4'; ctx.fillRect(x, y, 1, 3); ctx.fillRect(x + 1, y, 2, 1);
      }
    } else {
      for (let i = 0; i < 5500; i++) { ctx.fillStyle = `rgba(105,97,85,${random() * .045})`; ctx.fillRect(random() * size, random() * size, 1, 1); }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4;
    if (kind === 'fabric') texture.repeat.set(5, 5);
    this.maps.set(kind, texture); this.textures.add(texture); return texture;
  }

  dispose() { this.materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose()); }
}

export function windowArtwork() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#b8d6d6'; c.fillRect(0, 0, 512, 384);
  c.fillStyle = '#e3e8d6'; c.beginPath(); c.arc(360, 88, 40, 0, Math.PI * 2); c.fill();
  for (let layer = 0; layer < 3; layer++) {
    c.fillStyle = ['#9fb5a2', '#839c86', '#647f6a'][layer]; c.beginPath(); c.moveTo(0, 384);
    for (let x = 0; x <= 512; x += 8) c.lineTo(x, 215 + layer * 48 + Math.sin(x / 130 + layer * 2) * 28);
    c.lineTo(512, 384); c.fill();
  }
  for (const [x, y, r] of [[35, 276, 60], [445, 292, 70], [480, 250, 47]]) {
    c.fillStyle = '#55775f'; c.fillRect(x - 4, y, 8, 384 - y); c.beginPath(); c.ellipse(x, y, r * .65, r, 0, 0, Math.PI * 2); c.fill();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export function softShadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 5, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(33,30,24,.3)'); gradient.addColorStop(.5, 'rgba(33,30,24,.16)'); gradient.addColorStop(1, 'rgba(33,30,24,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
