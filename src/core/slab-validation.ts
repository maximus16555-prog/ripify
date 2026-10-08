import type { OwnedCard } from './types';
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(v);
const graders = ['PSA', 'BGS', 'CGC', 'SGC', 'TAG'];
const fields = ['centering', 'corners', 'edges', 'surface', 'print'];
const condition = (v: unknown): v is Record<string, number> => record(v) && fields.every(k => finite(v[k]) && v[k] >= 0 && v[k] <= 100);
export function validSlabHistory(card: Record<string, unknown>) {
  if (card.ownershipLock !== undefined && (!record(card.ownershipLock) || !['ebay', 'trade', 'transfer'].includes(card.ownershipLock.kind) || !id(card.ownershipLock.uid))) return false;
  const history = card.crackHistory;
  if (history === undefined) return true;
  if (!Array.isArray(history) || new Set(history.map(e => e?.uid)).size !== history.length) return false;
  return history.every((event, i) => {
    if (!record(event) || !id(event.uid) || !finite(event.at) || !Number.isInteger(event.seed) || event.seed < 0 || event.seed > 4294967295 || !graders.includes(event.grader) || !finite(event.grade) || event.grade < 1 || event.grade > 10 || typeof event.cert !== 'string' || !/^RFY-[A-F0-9]{8}-[A-F0-9]{4}$/.test(event.cert) || !condition(event.conditionBefore) || !condition(event.conditionAfter) || !Array.isArray(event.damage)) return false;
    if (!['centering', 'print'].every(k => event.conditionAfter[k] === event.conditionBefore[k])) return false;
    if (event.subgrades !== undefined && (!Array.isArray(event.subgrades) || event.subgrades.length !== 4 || !event.subgrades.every((n: unknown) => finite(n) && Number(n) >= 1 && Number(n) <= 10))) return false;
    if (i && !fields.every(k => event.conditionBefore[k] === history[i - 1].conditionAfter[k])) return false;
    if (event.outcome === 'safe') return event.rawModifier === 1 && event.damage.length === 0 && (event.improvement === undefined ? fields.every(k => event.conditionAfter[k] === event.conditionBefore[k]) : record(event.improvement) && ['corners', 'edges', 'surface'].every(k => finite(event.improvement[k]) && event.improvement[k] >= 0 && event.improvement[k] <= 4 && event.conditionAfter[k] === event.conditionBefore[k] + event.improvement[k] && (event.improvement[k] === 0 || event.conditionAfter[k] <= 98)));
    return event.outcome === 'damaged' && event.improvement === undefined && fields.every(k => event.conditionAfter[k] <= event.conditionBefore[k]) && event.rawModifier === .5 && event.damage.length > 0 && event.damage.every((d: unknown) => record(d) && ['bent-corner', 'missing-corner', 'whitening', 'edge-chip', 'scratch', 'dent', 'crease'].includes(d.type) && ['front', 'back', 'both'].includes(d.side) && finite(d.x) && d.x >= 0 && d.x <= 1 && finite(d.y) && d.y >= 0 && d.y <= 1 && finite(d.severity) && d.severity > 0 && d.severity <= 1 && finite(d.length) && d.length > 0 && d.length <= 1 && finite(d.angle) && Math.abs(d.angle) <= Math.PI * 2);
  }) && (!history.length || fields.every(k => (card.condition as OwnedCard['condition'])[k as keyof OwnedCard['condition']] === history.at(-1).conditionAfter[k]));
}
