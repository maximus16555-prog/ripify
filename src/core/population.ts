import type { GradingPopulationEntry, Save } from './types';

/** Distinct owned copies, not certification/attempt counts. Historical entries
 * survive sale; an identical regrade of that copy never inflates all-time pop. */
export function recordGradedCopy(entries: GradingPopulationEntry[], entry: GradingPopulationEntry) {
  if (!entries.some(e => e.cardUid === entry.cardUid && e.cardId === entry.cardId && e.grader === entry.grader && e.grade === entry.grade)) entries.push({ ...entry });
}
export function hydratePopulation(state: Pick<Save, 'cards' | 'gradingPopulation'>) {
  const entries = state.gradingPopulation ??= [];
  for (const card of state.cards) {
    for (const grade of [...(card.gradingHistory ?? []), ...(card.crackHistory ?? [])]) recordGradedCopy(entries, { cardUid: card.uid, cardId: card.cardId, grader: grade.grader, grade: grade.grade });
    if (card.status === 'graded' && card.grader && card.grade !== undefined) recordGradedCopy(entries, { cardUid: card.uid, cardId: card.cardId, grader: card.grader, grade: card.grade });
  }
  return entries;
}
export function gradedPopulation(state: Save, cardId: string, grader: GradingPopulationEntry['grader'], grade: number) {
  return { current: state.cards.filter(c => c.cardId === cardId && c.status === 'graded' && c.grader === grader && c.grade === grade).length,
    allTime: new Set(hydratePopulation(state).filter(e => e.cardId === cardId && e.grader === grader && e.grade === grade).map(e => e.cardUid)).size };
}
