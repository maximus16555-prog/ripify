import type { OwnedCard, Grader } from '../core/types';

export const SLAB_STYLES: Record<Grader, { accent: string; label: string; ink: string; insert: string }> = {
  PSA: { accent: '#a54039', label: '#faf7f0', ink: '#252927', insert: '#d4dedc' },
  BGS: { accent: '#9d854e', label: '#e1d4b5', ink: '#292a25', insert: '#c7d2cf' },
  CGC: { accent: '#31748b', label: '#eef4f5', ink: '#233640', insert: '#cfdddf' },
  SGC: { accent: '#303b36', label: '#f5f4ed', ink: '#222b27', insert: '#202722' },
  TAG: { accent: '#5b707c', label: '#e8eeef', ink: '#2b3a42', insert: '#d7e1e2' }
};

export function stableHash(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function slabPresentation(owned: Partial<OwnedCard>) {
  if (owned.status !== 'graded' || !owned.grader || owned.grade === undefined) return undefined;
  const order = owned.gradingHistory?.at(-1)?.orderUid ?? `${owned.grader}:${owned.grade}`;
  const cert = owned.uid ? `RFY-${stableHash(owned.uid).toString(16).padStart(8, '0').toUpperCase()}-${stableHash(order).toString(16).slice(-4).padStart(4, '0').toUpperCase()}` : undefined;
  return { grader: owned.grader, grade: owned.grade, cert, style: SLAB_STYLES[owned.grader], subgrades: owned.grader === 'BGS' ? owned.subgrades : undefined };
}

export type SurfaceMark = { x: number; y: number; length: number; angle: number; opacity: number };
// Existing saves store condition, not defect positions. Derive a stable, side-specific
// presentation from that same copy. Grading and rotation never enter the seed.
export function conditionAppearance(owned: Pick<OwnedCard, 'uid' | 'condition'>) {
  const marks = (side: string): SurfaceMark[] => {
    let seed = stableHash(`${owned.uid}:${side}`);
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    return Array.from({ length: Math.floor((100 - owned.condition.surface) / 6) }, () => ({ x: .08 + random() * .84, y: .08 + random() * .84, length: .01 + random() * .055, angle: random() * Math.PI, opacity: .08 + (100 - owned.condition.surface) / 500 }));
  };
  return { front: marks('front'), back: marks('back'), edges: (100 - owned.condition.edges) / 100, corners: (100 - owned.condition.corners) / 100 };
}
