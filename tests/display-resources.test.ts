import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { DisplayCards } from '../src/game/display-cards';
import type { OwnedCard } from '../src/core/types';
const copy = (uid: string): OwnedCard => ({ uid, cardId: 'sve-1', status: 'raw', condition: { centering: 90, corners: 80, edges: 85, surface: 90, print: 90 }, favorite: false, acquiredAt: 0, source: 'test', owner: 'local-player', finish: 'normal', origin: 'pack' });
describe('display GPU resource lifetime', () => {
  it('retains unchanged and moved copies, and ignores nonvisual inventory edits', () => {
    const create = vi.fn(() => { const group = new THREE.Group(); return { group, size: { width: .34, height: .474, depth: .0015 }, ready: Promise.resolve(), dispose: vi.fn(() => group.removeFromParent()) }; });
    const displays = new DisplayCards(vi.fn(), create), slots = [new THREE.Group(), new THREE.Group(), new THREE.Group()], a = copy('a'), b = copy('b');
    displays.sync(slots, [a, b]); const item = create.mock.results[0].value;
    displays.sync(slots, [{ ...a, favorite: true }, b]); expect(create).toHaveBeenCalledTimes(2);
    displays.sync(slots, [undefined, b, a]); expect(create).toHaveBeenCalledTimes(2); expect(item.group.parent).toBe(slots[2]); expect(item.dispose).not.toHaveBeenCalled();
    displays.dispose(); expect(item.dispose).toHaveBeenCalledOnce();
  });
  it('replaces changed physical condition/slab state and disposes removed items exactly once', () => {
    const create = vi.fn(() => { const group = new THREE.Group(); return { group, size: { width: .34, height: .474, depth: .0015 }, ready: Promise.resolve(), dispose: vi.fn(() => group.removeFromParent()) }; });
    const displays = new DisplayCards(vi.fn(), create), slots = [new THREE.Group()], a = copy('a');
    displays.sync(slots, [a]); const raw = create.mock.results[0].value;
    displays.sync(slots, [{ ...a, status: 'graded', grader: 'BGS', grade: 9 }]); expect(create).toHaveBeenCalledTimes(2); expect(raw.dispose).toHaveBeenCalledOnce();
    const slab = create.mock.results[1].value; displays.sync(slots, []); expect(slab.dispose).toHaveBeenCalledOnce(); expect(slots[0].children).toHaveLength(0);
    displays.dispose(); expect(slab.dispose).toHaveBeenCalledOnce();
  });
});
