import * as THREE from 'three';
import type { OwnedCard } from '../core/types';
import { CARD_BY_ID } from '../data/cards';
import { cardArtwork } from '../assets/cards';
import { conditionAppearance, slabPresentation, stableHash } from '../assets/card-presentation';
import cardBack from '../data/verified/card-back.json';
import { drawPrintedFace, printAppearance } from '../assets/misprint-presentation';

export const CARD_SIZE = { width: .34, height: .474, depth: .0015 };
export const SLAB_SIZE = { width: .412, height: .642, depth: .026 };
export const CARD_BACK = cardBack.path;
export type PhysicalCard = { group: THREE.Group; size: typeof CARD_SIZE; ready: Promise<void>; dispose: () => void };
type TextureFactory = { face: (owned: OwnedCard, side: 'front' | 'back') => THREE.Texture; label: (owned: OwnedCard, rear: boolean) => THREE.Texture };

// Only requested images are decoded. A small bounded cache shares the card back and
// recently inspected images, rather than loading the catalog or retaining every copy.
const images = new Map<string, Promise<HTMLImageElement>>();
function imageFor(url: string) {
  let pending = images.get(url);
  if (pending) { images.delete(url); images.set(url, pending); return pending; }
  pending = new Promise((resolve, reject) => {
    const image = new Image(); image.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => { image.onload = image.onerror = null; reject(new Error('Image unavailable')); }, 10000);
    image.onload = async () => { clearTimeout(timer); try { await image.decode(); resolve(image); } catch (error) { reject(error); } };
    image.onerror = () => { clearTimeout(timer); reject(new Error('Image unavailable')); };
    image.src = url;
  });
  images.set(url, pending);
  void pending.catch(() => { if (images.get(url) === pending) images.delete(url); });
  if (images.size > 20) images.delete(images.keys().next().value!);
  return pending;
}

function roundedShape(width: number, height: number, radius: number) {
  const s = new THREE.Shape(), x = -width / 2, y = -height / 2;
  s.moveTo(x + radius, y); s.lineTo(x + width - radius, y); s.quadraticCurveTo(x + width, y, x + width, y + radius);
  s.lineTo(x + width, y + height - radius); s.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  s.lineTo(x + radius, y + height); s.quadraticCurveTo(x, y + height, x, y + height - radius);
  s.lineTo(x, y + radius); s.quadraticCurveTo(x, y, x + radius, y);
  return s;
}
function faceGeometry(width: number, height: number, radius: number) {
  const geo = new THREE.ShapeGeometry(roundedShape(width, height, radius), 6);
  const pos = geo.getAttribute('position'), uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, THREE.MathUtils.clamp(pos.getX(i) / width + .5, 0, 1), THREE.MathUtils.clamp(pos.getY(i) / height + .5, 0, 1));
  return geo;
}
function bodyGeometry(width: number, height: number, depth: number, radius: number) {
  const geo = new THREE.ExtrudeGeometry(roundedShape(width, height, radius), { depth, bevelEnabled: false, curveSegments: 6 });
  geo.translate(0, 0, -depth / 2); return geo;
}

function drawWear(ctx: CanvasRenderingContext2D, owned: OwnedCard, side: 'front' | 'back', width: number, height: number) {
  const wear = conditionAppearance(owned);
  ctx.save(); ctx.strokeStyle = '#eee8d6'; ctx.lineCap = 'round';
  for (const mark of wear[side]) {
    ctx.globalAlpha = mark.opacity; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(mark.x * width, mark.y * height);
    ctx.lineTo((mark.x + Math.cos(mark.angle) * mark.length) * width, (mark.y + Math.sin(mark.angle) * mark.length) * height); ctx.stroke();
  }
  // Matching edge/corner locations when viewed from the opposite face.
  let seed = stableHash(owned.uid + ':edges');
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.globalAlpha = .7; ctx.lineWidth = 1 + wear.edges * 3;
  for (let i = 0; i < Math.floor(wear.edges * 28); i++) {
    let x = random() * width, y = random() * height;
    if (i % 2) x = i % 4 === 1 ? 1 : width - 1; else y = i % 4 === 0 ? 1 : height - 1;
    let endX = Math.min(width - 1, x + (i % 2 ? 0 : 3 + wear.edges * 8));
    const endY = Math.min(height - 1, y + (i % 2 ? 3 + wear.edges * 8 : 0));
    if (side === 'back') { x = width - x; endX = width - endX; }
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY); ctx.stroke();
  }
  ctx.fillStyle = '#e8e2cc'; ctx.globalAlpha = Math.min(.65, wear.corners);
  for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height]]) { ctx.beginPath(); ctx.arc(x, y, wear.corners * 9, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function canvasTexture(width: number, height: number) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, ctx: canvas.getContext('2d')!, texture };
}
function makeLabel(owned: OwnedCard, rear: boolean) {
  const { ctx, texture } = canvasTexture(1065, 237);
  const d = CARD_BY_ID.get(owned.cardId)!, slab = slabPresentation(owned)!;
  ctx.fillStyle = slab.style.label; ctx.fillRect(0, 0, 1065, 237);
  ctx.fillStyle = slab.style.accent; ctx.fillRect(0, 0, 1065, 13);
  ctx.fillStyle = slab.style.ink;
  ctx.font = 'bold 30px sans-serif'; ctx.fillText(`${slab.grader} · RIPIFY SIMULATION`, 22, 51);
  ctx.font = 'bold 34px sans-serif'; ctx.fillText(rear ? 'SIMULATED CERTIFICATION' : d.name, 22, 95, 810);
  ctx.font = '26px sans-serif'; ctx.fillText(`${d.year} ${d.set} · #${d.number}`, 22, 135, 810);
  ctx.font = 'bold 27px monospace'; ctx.fillText(slab.cert ?? 'RFY', 22, 179);
  ctx.font = '24px sans-serif'; ctx.fillText(slab.subgrades ? `C ${slab.subgrades[0]}   CO ${slab.subgrades[1]}   E ${slab.subgrades[2]}   S ${slab.subgrades[3]}` : 'IN-GAME COPY', 22, 219);
  ctx.font = 'bold 94px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(String(slab.grade), 1040, 113);
  ctx.font = '23px sans-serif'; ctx.fillText('/ 10', 1030, 148);
  texture.needsUpdate = true; return texture;
}

/** One representation of the existing UID; never creates inventory or alters condition. */
export function createPhysicalCard(owned: OwnedCard, factories?: TextureFactory): PhysicalCard {
  const group = new THREE.Group(), slab = slabPresentation(owned), size = slab ? SLAB_SIZE : CARD_SIZE;
  group.name = slab ? 'graded-card' : 'raw-card'; group.userData = { uid: owned.uid, cardId: owned.cardId, graded: !!slab, cert: slab?.cert, grader: slab?.grader, grade: slab?.grade, misprint: owned.misprint };
  let disposed = false;
  const tasks: Promise<unknown>[] = [], textures = new Set<THREE.Texture>();
  const face = (side: 'front' | 'back') => {
    if (factories) { const t = factories.face(owned, side); textures.add(t); return t; }
    const { canvas, ctx, texture } = canvasTexture(660, 921); textures.add(texture);
    const d = CARD_BY_ID.get(owned.cardId)!, url = side === 'back' ? owned.finish === 'metal' ? undefined : CARD_BACK : cardArtwork(d, owned);
    texture.userData = { side, source: url, uid: owned.uid, state: url ? 'loading' : 'unavailable' };
    const missing = (loading: boolean) => { ctx.fillStyle = '#e8e5d9'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#3b483d'; ctx.font = 'bold 34px sans-serif'; ctx.fillText(side === 'front' ? d.name : 'Card back', 35, 370, 590); ctx.font = '25px sans-serif'; ctx.fillText(side === 'front' ? `${d.set} · #${d.number}` : 'Pokémon TCG', 35, 413, 590); ctx.fillText(loading ? 'Loading image…' : 'Image unavailable', 35, 475); drawWear(ctx, owned, side, canvas.width, canvas.height); texture.needsUpdate = true; };
    missing(!!url);
    if (url) tasks.push(imageFor(url).then(image => { if (disposed) return; ctx.clearRect(0, 0, canvas.width, canvas.height); drawPrintedFace(ctx, image, owned, side === 'back', canvas.width, canvas.height); drawWear(ctx, owned, side, canvas.width, canvas.height); texture.userData.state = 'ready'; texture.needsUpdate = true; }).catch(() => { if (!disposed) { texture.userData.state = 'unavailable'; missing(false); } }));
    return texture;
  };
  const add = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, y = 0, z = 0, rear = false) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.name = name; mesh.position.set(0, y, z); if (rear) mesh.rotation.y = Math.PI;
    mesh.castShadow = name === 'cardstock' || name === 'slab-rim'; mesh.userData.uid = owned.uid; group.add(mesh); return mesh;
  };
  const cardY = slab ? -.05 : 0;
  const cutGeometry = (geo: THREE.BufferGeometry, rear = false) => {
    const a = printAppearance(owned, rear);
    if (a.type !== 'miscut') return geo;
    const pos = geo.getAttribute('position');
    // A slanted cut on the same physical edge, mirrored in the rear face's space.
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), frontX = rear ? -x : x;
      const inward = Math.abs(a.tilt) * CARD_SIZE.width * (a.tilt * (rear ? -1 : 1) > 0 ? y / CARD_SIZE.height + .5 : .5 - y / CARD_SIZE.height);
      const factor = .5 - frontX / CARD_SIZE.width;
      pos.setX(i, x + (rear ? -1 : 1) * inward * factor);
    }
    geo.computeVertexNormals(); return geo;
  };
  const cardstock = new THREE.MeshStandardMaterial({ color: owned.finish === 'metal' ? '#aab0ab' : '#d8d0b6', roughness: .9, metalness: owned.finish === 'metal' ? .65 : 0 });
  add('cardstock', cutGeometry(bodyGeometry(CARD_SIZE.width, CARD_SIZE.height, CARD_SIZE.depth, .012)), cardstock, cardY);
  for (const side of ['front', 'back'] as const) {
    add(`card-${side}`, cutGeometry(faceGeometry(CARD_SIZE.width, CARD_SIZE.height, .012), side === 'back'), new THREE.MeshStandardMaterial({ map: face(side), roughness: side === 'front' && owned.finish !== 'normal' ? .4 : .68, metalness: side === 'front' && owned.finish !== 'normal' ? .1 : 0 }), cardY, (side === 'front' ? 1 : -1) * (CARD_SIZE.depth / 2 + .0001), side === 'back');
  }
  if (slab) {
    const rim = roundedShape(size.width, size.height, .015);
    rim.holes.push(new THREE.Path(roundedShape(size.width - .027, size.height - .027, .01).getPoints()));
    const rimGeo = new THREE.ExtrudeGeometry(rim, { depth: size.depth, bevelEnabled: true, bevelSize: .001, bevelThickness: .001, bevelSegments: 2, curveSegments: 6 }); rimGeo.translate(0, 0, -size.depth / 2);
    add('slab-rim', rimGeo, new THREE.MeshPhysicalMaterial({ color: '#c8d9da', roughness: .23, metalness: 0, transparent: true, opacity: .67, depthWrite: false }));
    // Insert surrounds the card without covering its artwork or card back.
    const insert = roundedShape(.364, .504, .011); insert.holes.push(new THREE.Path(roundedShape(.344, .478, .012).getPoints()));
    const insertGeo = new THREE.ExtrudeGeometry(insert, { depth: .008, bevelEnabled: false, curveSegments: 6 }); insertGeo.translate(0, 0, -.004);
    add('slab-insert', insertGeo, new THREE.MeshStandardMaterial({ color: slab.style.insert, roughness: .58 }), cardY);
    for (const rear of [false, true]) {
      const label = factories ? factories.label(owned, rear) : makeLabel(owned, rear); textures.add(label);
      add(rear ? 'slab-label-back' : 'slab-label-front', new THREE.PlaneGeometry(.355, .079), new THREE.MeshBasicMaterial({ map: label }), .263, rear ? -.007 : .007, rear);
      const cover = add(rear ? 'slab-cover-back' : 'slab-cover-front', faceGeometry(size.width - .01, size.height - .01, .013), new THREE.MeshPhysicalMaterial({ color: '#f2f9fa', roughness: .16, metalness: 0, transparent: true, opacity: .075, depthWrite: false }), 0, (rear ? -1 : 1) * size.depth / 2, rear);
      cover.renderOrder = 3;
    }
  }
  return { group, size, ready: Promise.all(tasks).then(() => {}), dispose: () => {
    if (disposed) return; disposed = true;
    const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
    group.traverse(o => { if (o instanceof THREE.Mesh) { geos.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m)); } });
    geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); group.removeFromParent(); group.clear();
  } };
}

export function placeOnStand(item: PhysicalCard) {
  item.group.rotation.x = -.16;
  // Keep the entire tilted envelope above the existing stand's top surface.
  item.group.position.y = item.size.height / 2 * Math.cos(.16) + item.size.depth / 2 * Math.sin(.16) + .012;
}
