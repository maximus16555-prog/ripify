import type { OwnedCard, SlabCrackEvent } from './types';
import { seeded, newSeed, uuid } from './inventory';
import { slabPresentation } from '../assets/card-presentation';

export const SLAB_CRACK_SUCCESS = .5;
export const FAILED_CRACK_RAW_MODIFIER = .5;
/** Independent of printing, price, grader, condition and rare-pack events. */
export function createSlabCrack(card: OwnedCard, seed = newSeed(), now = Date.now()): SlabCrackEvent {
  const slab = slabPresentation(card); if (!slab?.cert) throw new Error('Card is not slabbed');
  const random = seeded(seed), safe = random() < SLAB_CRACK_SUCCESS;
  const before = { ...card.condition }, after = { ...before };
  const damage: SlabCrackEvent['damage'] = [];
  if (!safe) {
    const corner = Math.floor(random() * 4), severity = .55 + random() * .35;
    damage.push({ type: 'bent-corner', side: 'both', x: corner % 2, y: Math.floor(corner / 2), severity, length: .09, angle: 0 });
    damage.push({ type: random() < .5 ? 'scratch' : 'crease', side: random() < .5 ? 'front' : 'back', x: .2 + random() * .5, y: .25 + random() * .5, severity, length: .18 + random() * .15, angle: random() * Math.PI });
    damage.push({ type: 'edge-chip', side: 'both', x: corner % 2, y: .2 + random() * .6, severity: severity * .8, length: .08, angle: 0 });
    after.corners = Math.max(0, before.corners - Math.round(22 + severity * 18));
    after.edges = Math.max(0, before.edges - Math.round(14 + severity * 13));
    after.surface = Math.max(0, before.surface - Math.round(17 + severity * 15));
  }
  return { uid: uuid(), at: now, seed, grader: slab.grader, grade: slab.grade, cert: slab.cert, outcome: safe ? 'safe' : 'damaged', rawModifier: safe ? 1 : FAILED_CRACK_RAW_MODIFIER, conditionBefore: before, conditionAfter: after, damage };
}
export function crackDamageFactor(card: Pick<OwnedCard, 'crackHistory'>) {
  return (card.crackHistory ?? []).reduce((factor, event) => factor * (event.outcome === 'damaged' ? FAILED_CRACK_RAW_MODIFIER : 1), 1);
}
export function crackDamage(card: Pick<OwnedCard, 'crackHistory'>) { return (card.crackHistory ?? []).flatMap(event => event.damage); }
