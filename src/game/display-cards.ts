import * as THREE from 'three';
import type { OwnedCard } from '../core/types';
import { createPhysicalCard, placeOnStand, type PhysicalCard } from './physical-card';

/** Only fields that affect geometry, artwork, wear or the certification label. */
export function physicalCardSignature(c: OwnedCard) {
  return JSON.stringify([c.uid, c.cardId, c.finish, c.condition, c.misprint, c.crackHistory, c.status, c.grader, c.grade, c.subgrades, c.gradingHistory?.at(-1)?.orderUid]);
}

/** At most one rendered item per occupied stand; moves retain their GPU resources. */
export class DisplayCards {
  private items = new Map<string, { signature: string; item: PhysicalCard }>();
  constructor(private invalidate: () => void, private create = createPhysicalCard) {}
  sync(slots: THREE.Group[], owned: (OwnedCard | undefined)[]) {
    const next = new Map<string, { signature: string; item: PhysicalCard }>();
    slots.forEach((slot, i) => {
      const card = owned[i];
      if (!card || card.status === 'grading') return;
      const signature = physicalCardSignature(card);
      let record = this.items.get(card.uid);
      if (!record || record.signature !== signature) {
        record = { signature, item: this.create(card) }; placeOnStand(record.item);
        void record.item.ready.then(this.invalidate);
        this.invalidate();
      }
      if (record.item.group.parent !== slot) { slot.add(record.item.group); this.invalidate(); }
      next.set(card.uid, record);
    });
    for (const [uid, record] of this.items) if (next.get(uid) !== record) { record.item.dispose(); this.invalidate(); }
    this.items = next;
  }
  dispose() { this.items.forEach(record => record.item.dispose()); this.items.clear(); this.invalidate(); }
}
