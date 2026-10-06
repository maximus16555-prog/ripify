import { CARD_BY_ID } from '../data/cards';
import type { CardDefinition, Grader, OwnedCard } from './types';
import { MISPRINT_MODIFIER } from './rare-events';
import { FIXED_RAW_CARD_VALUES } from '../data/balance';
export const GRADERS: Record<Grader, { cost: number; seconds: number; premium: number; bias: number; half: boolean; color: string }> = {
  PSA: { cost: 12, seconds: 150, premium: 1.3, bias: .1, half: false, color: '#ab584d' },
  BGS: { cost: 16, seconds: 180, premium: 1.4, bias: -.12, half: true, color: '#9a895c' },
  CGC: { cost: 9, seconds: 120, premium: 1.1, bias: 0, half: true, color: '#497f95' },
  SGC: { cost: 8, seconds: 100, premium: 1.04, bias: -.05, half: true, color: '#546c57' },
  TAG: { cost: 11, seconds: 130, premium: 1.15, bias: 0, half: false, color: '#667789' }
};
export const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function marketFactor(card: CardDefinition, seed: number, now = Date.now()) {
  if (FIXED_RAW_CARD_VALUES[card.id] !== undefined) return 1;
  const day = Math.floor(now / 86400000);
  return 1 + Math.sin(day * .47 + seed + card.value) * .09;
}
export function rawValue(card: CardDefinition, seed: number, now?: number) {
  // Resolve by printing ID even when an older owned misprint stores a previous
  // raw base. Its saved defect/condition stays intact; pricing stays authoritative.
  return FIXED_RAW_CARD_VALUES[card.id] ?? Math.round(card.value * marketFactor(card, seed, now) * 100) / 100;
}
export function gradeMultiplier(grade: number) { return grade >= 10 ? 4.8 : grade >= 9.5 ? 3.1 : grade >= 9 ? 2 : grade >= 8 ? 1.3 : grade >= 7 ? .95 : .6; }
/** Only the raw base enters the misprint modifier; no stored graded price is used. */
export function ownedRawMarketValue(owned: OwnedCard, seed: number, now?: number) {
  const definition = CARD_BY_ID.get(owned.cardId)!;
  const card = owned.misprint ? { ...definition, value: owned.baseRawValue! } : definition;
  const base = rawValue(card, seed, now);
  return owned.misprint ? Math.round(base * MISPRINT_MODIFIER * 100) / 100 : base;
}
export function ownedValue(owned: OwnedCard, seed: number, now?: number) {
  const base = ownedRawMarketValue(owned, seed, now);
  if (owned.status === 'graded' && owned.grader && owned.grade) return Math.round(base * gradeMultiplier(owned.grade) * GRADERS[owned.grader].premium * 100) / 100;
  if (owned.misprint) return base;
  const condition = Object.values(owned.condition).reduce((a, b) => a + b, 0) / 5;
  return Math.round(base * (.6 + .4 * condition / 100) * 100) / 100;
}
export function calculateGrade(card: OwnedCard, grader: Grader, random = Math.random) {
  const c = { ...card.condition }, defect = card.misprint?.defect;
  if (defect) {
    // Manufacturing faults influence simulated grades without repairing the
    // defect or mutating the underlying saved wear/condition attributes.
    const score = 85 - defect.severity * 55;
    if (defect.type === 'off-center' || defect.type === 'miscut') c.centering = Math.min(c.centering, score);
    if (defect.type === 'miscut') c.edges = Math.min(c.edges, score + 12);
    if (defect.type === 'registration' || defect.type === 'ink-defect') c.print = Math.min(c.print, score);
  }
  const scores = [c.centering, c.corners, c.edges, c.surface];
  const mean = (scores.reduce((a, b) => a + b, 0) + c.print) / 5;
  const weakest = Math.min(...scores, c.print);
  const score = mean * .65 + weakest * .35;
  const numeric = Math.max(1, Math.min(10, 1 + score * .092 + GRADERS[grader].bias + (random() - .5) * .2));
  const step = GRADERS[grader].half ? 2 : 1;
  return { grade: Math.max(1, Math.min(10, Math.round(numeric * step) / step)), subgrades: scores.map(s => Math.max(1, Math.min(10, Math.round((1 + s * .092) * 2) / 2))) };
}
