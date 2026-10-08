import { createSlabCrack } from '../src/core/slab-cracking';
import { seeded } from '../src/core/inventory';
import type { OwnedCard } from '../src/core/types';
export function simulateSlabCracks(count = 200000) {
  const card: OwnedCard = { uid: 'simulation-only', cardId: 'me02.5-276', owner: 'local-player', condition: { centering: 91, corners: 88, edges: 94, surface: 86, print: 95 }, status: 'graded', grader: 'PSA', grade: 9, acquiredAt: 0, source: 'simulation', favorite: false, finish: 'holo', origin: 'pack' };
  const random = seeded(6062026); let safe = 0, damaged = 0, violations = 0;
  for (let i = 0; i < count; i++) {
    const event = createSlabCrack(card, Math.floor(random() * 4294967296), 0);
    if (event.outcome === 'safe') { safe++; if (!event.improvement || event.conditionAfter.corners <= event.conditionBefore.corners || event.conditionAfter.surface <= event.conditionBefore.surface || event.conditionAfter.centering !== event.conditionBefore.centering || event.conditionAfter.print !== event.conditionBefore.print || event.rawModifier !== 1 || event.damage.length) violations++; }
    else { damaged++; if (event.rawModifier !== .5 || event.damage.length !== 3 || event.conditionAfter.corners >= event.conditionBefore.corners || event.conditionAfter.surface >= event.conditionBefore.surface) violations++; }
  }
  return { count, safe, damaged, successRate: safe / count, damageRate: damaged / count, standardDeviations: (safe - count * .5) / Math.sqrt(count * .25), violations, realPlayerItemsAwarded: 0 };
}
