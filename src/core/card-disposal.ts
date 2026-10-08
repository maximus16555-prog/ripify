import { CARD_BY_ID } from '../data/cards';
import { ownedValue } from './economy';
import type { OwnedCard, Save } from './types';

export const VALUABLE_CARD_THRESHOLD = 100;
export function disposalProtection(card: OwnedCard, locked: boolean) {
  if (locked) return 'Transaction locked';
  if (card.status !== 'raw') return card.status === 'graded' ? 'Graded card protected' : 'Away grading';
  if (card.misprint) return 'Misprint protected';
  if (card.favorite) return 'Favorite protected';
  return '';
}
export const valuableCard = (card: OwnedCard, state: Save) => ownedValue(card, state.marketSeed) >= VALUABLE_CARD_THRESHOLD;
/** Keep one exact printing globally, preferring special/protected copies, then
 * the best physical copy. Filtered cleanup never mistakes another printing for it. */
export function excessCopies(state: Save, eligible: (card: OwnedCard) => boolean) {
  const groups = new Map<string, OwnedCard[]>();
  for (const c of state.cards) { const pool = groups.get(c.cardId) ?? []; pool.push(c); groups.set(c.cardId, pool); }
  const result = new Set<string>();
  for (const pool of groups.values()) {
    pool.sort((a, b) => Number(!eligible(b)) - Number(!eligible(a)) ||
      Object.values(b.condition).reduce((n, v) => n + v, 0) - Object.values(a.condition).reduce((n, v) => n + v, 0) ||
      a.acquiredAt - b.acquiredAt || a.uid.localeCompare(b.uid));
    for (const c of pool.slice(1)) if (eligible(c)) result.add(c.uid);
  }
  return result;
}
export interface CleanupFilter { query: string; rarities: string[]; set: string; raw: boolean; duplicates: boolean; maximum: string }
export function filterCleanupCards(state: Save, f: CleanupFilter) {
  const counts = new Map<string, number>(); for (const c of state.cards) counts.set(c.cardId, (counts.get(c.cardId) ?? 0) + 1);
  const maximum = f.maximum.trim() ? Number(f.maximum) : Infinity;
  return state.cards.filter(c => { const d = CARD_BY_ID.get(c.cardId)!; return (
    (!f.query || `${d.name} ${d.set} ${d.number}`.toLowerCase().includes(f.query.toLowerCase())) &&
    (!f.rarities.length || f.rarities.includes(d.rarity)) && (!f.set || d.setCode === f.set) &&
    (!f.raw || c.status === 'raw') && (!f.duplicates || counts.get(c.cardId)! > 1) &&
    ownedValue(c, state.marketSeed) <= maximum);
  });
}
