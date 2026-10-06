import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { OwnedCard, Grader } from '../src/core/types';
import { createPhysicalCard, placeOnStand, CARD_SIZE, SLAB_SIZE } from '../src/game/physical-card';
import { conditionAppearance, slabPresentation, SLAB_STYLES } from '../src/assets/card-presentation';
import { GameStore } from '../src/core/store';

const copy = (): OwnedCard => ({ uid: 'physical-copy-1', cardId: 'sve-1', condition: { centering: 92, corners: 76, edges: 71, surface: 62, print: 94 }, acquiredAt: 100, source: '151', favorite: false, status: 'raw', owner: 'local-player', finish: 'normal', origin: 'pack' });
const textures = { face: (_: OwnedCard, side: string) => { const t = new THREE.Texture(); t.userData.side = side; return t; }, label: (_: OwnedCard, rear: boolean) => { const t = new THREE.Texture(); t.userData.side = rear ? 'rear label' : 'front label'; return t; } };
const mesh = (group: THREE.Group, name: string) => group.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

describe('physical card faces and slabs', () => {
  it('renders outward front/back faces and untextured cardstock from an edge', () => {
    const owned = copy(), before = JSON.stringify(owned), item = createPhysicalCard(owned, textures);
    item.group.updateMatrixWorld(true);
    const ray = (from: number[], direction: number[]) => new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(...direction)).intersectObject(item.group).map(hit => hit.object.name);
    expect(ray([0, 0, 1], [0, 0, -1])[0]).toBe('card-front');
    expect(ray([0, 0, -1], [0, 0, 1])[0]).toBe('card-back');
    expect(ray([1, 0, 0], [-1, 0, 0])[0]).toBe('cardstock');
    expect(mesh(item.group, 'card-front').material.map!.userData.side).toBe('front');
    expect(mesh(item.group, 'card-back').material.map!.userData.side).toBe('back');
    expect(mesh(item.group, 'cardstock').material.map).toBeNull();
    expect(new THREE.Box3().setFromObject(item.group).getSize(new THREE.Vector3()).z).toBeGreaterThan(0);
    for (const name of ['card-front', 'card-back']) {
      const uv = mesh(item.group, name).geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) { expect(uv.getX(i)).toBeGreaterThanOrEqual(0); expect(uv.getX(i)).toBeLessThanOrEqual(1); expect(uv.getY(i)).toBeGreaterThanOrEqual(0); expect(uv.getY(i)).toBeLessThanOrEqual(1); }
    }
    expect(JSON.stringify(owned)).toBe(before); item.dispose();
  });
  it.each(Object.keys(SLAB_STYLES) as Grader[])('encloses the same two-sided copy in a %s slab', grader => {
    const owned: OwnedCard = { ...copy(), status: 'graded', grader, grade: 9, subgrades: [9, 8.5, 9.5, 9] };
    const item = createPhysicalCard(owned, textures); item.group.updateMatrixWorld(true);
    expect(item.group.userData).toMatchObject({ uid: owned.uid, graded: true, grader, grade: 9 });
    expect(item.size).toEqual(SLAB_SIZE); expect(item.size.width).toBeGreaterThan(CARD_SIZE.width);
    expect(mesh(item.group, 'slab-cover-front').material.transparent).toBe(true);
    expect(mesh(item.group, 'slab-cover-front').material.map).toBeNull();
    expect(mesh(item.group, 'slab-label-back').material.map!.userData.side).toBe('rear label');
    expect(mesh(item.group, 'card-back').material.map!.userData.side).toBe('back');
    const cardBounds = new THREE.Box3().setFromObject(mesh(item.group, 'cardstock'));
    expect(cardBounds.getSize(new THREE.Vector3()).y).toBeCloseTo(CARD_SIZE.height);
    expect(new THREE.Box3().setFromObject(mesh(item.group, 'slab-rim')).containsBox(cardBounds)).toBe(true);
    expect(slabPresentation(owned)!.subgrades).toEqual(grader === 'BGS' ? owned.subgrades : undefined);
    item.dispose();
  });
  it('uses status, keeps both sizes above the stand, and disposes each resource once', () => {
    for (const status of ['raw', 'graded'] as const) {
      const item = createPhysicalCard({ ...copy(), status, grader: 'PSA', grade: 9 }, textures);
      expect(item.group.name).toBe(status === 'graded' ? 'graded-card' : 'raw-card');
      placeOnStand(item); expect(new THREE.Box3().setFromObject(item.group).min.y).toBeGreaterThan(0);
      let geometryDisposals = 0, textureDisposals = 0;
      item.group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.addEventListener('dispose', () => geometryDisposals++); o.material.map?.addEventListener('dispose', () => textureDisposals++); } });
      const meshes = item.group.children.length; item.dispose(); item.dispose();
      expect(geometryDisposals).toBe(meshes); expect(textureDisposals).toBe(status === 'graded' ? 4 : 2);
    }
  });
  it('keeps side-specific wear and certification stable across rotation, grading and reload', () => {
    const raw = copy(), graded: OwnedCard = { ...raw, status: 'graded', grader: 'BGS', grade: 8.5 };
    expect(conditionAppearance(raw).front).not.toEqual(conditionAppearance(raw).back);
    expect(conditionAppearance(raw)).toEqual(conditionAppearance(graded));
    expect(conditionAppearance(raw)).toEqual(conditionAppearance(JSON.parse(JSON.stringify(graded))));
    expect(slabPresentation(graded)!.cert).toMatch(/^RFY-[A-F0-9]{8}-[A-F0-9]{4}$/);
    expect(slabPresentation(graded)).toEqual(slabPresentation(JSON.parse(JSON.stringify(graded))));
    expect(slabPresentation({ ...graded, uid: 'another-copy' })!.cert).not.toBe(slabPresentation(graded)!.cert);
  });
  it('displays, replaces and removes references without duplicating or cleaning the owned item', () => {
    let saved = ''; const storage = { read: () => saved || null, write: (data: string) => { saved = data; }, backup: () => {} };
    const store = new GameStore(storage), raw = copy(), graded: OwnedCard = { ...copy(), uid: 'graded-copy', status: 'graded', grader: 'BGS', grade: 8.5, subgrades: [9, 8, 8.5, 9] };
    store.state.cards = [raw, graded]; const originals = JSON.stringify(store.state.cards);
    store.display(raw.uid, 0); store.display(graded.uid, 0); store.display(graded.uid, 1);
    expect(store.state.displays).toEqual([null, graded.uid, null]);
    expect(JSON.stringify(store.state.cards)).toBe(originals);
    const reloaded = new GameStore(storage); expect(reloaded.state.cards).toEqual(store.state.cards); expect(reloaded.state.displays).toEqual(store.state.displays);
    reloaded.clearDisplay(1); expect(JSON.stringify(reloaded.state.cards)).toBe(originals);
  });
});
