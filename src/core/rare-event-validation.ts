import { SPECIAL_LINES, specialEligible } from './rare-events';
import { CARD_BY_ID } from '../data/cards';
import type { OwnedCard, Pack, PackEvents, PrintDefect } from './types';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const range = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function validDefect(v: unknown): v is PrintDefect {
  return record(v) && ['off-center', 'miscut', 'registration', 'ink-defect'].includes(String(v.type)) && ['front', 'back', 'both'].includes(String(v.side)) && (!['off-center', 'miscut'].includes(String(v.type)) || v.side === 'both') && range(v.severity, .4, 1) && range(v.offsetX, -.2, .2) && range(v.offsetY, -.15, .15) && range(v.cutTilt, -.06, .06) && range(v.registrationX, -.02, .02) && range(v.registrationY, -.02, .02) && range(v.inkBandY, .1, .9) && range(v.inkBandWidth, .01, .07);
}
export function validPackEvents(v: unknown, pack: Pick<Pack, 'setCode' | 'productId'>): v is PackEvents {
  if (!record(v) || v.version !== 1 || typeof v.fullMisprint !== 'boolean') return false;
  if (v.fullMisprint ? !validDefect(v.production) : v.production !== undefined) return false;
  return v.special === null || (specialEligible(pack) && record(v.special) && (pack.setCode === 'me02.5' ? v.special.type === 'ascended-heroes-god' : v.special.type === 'english-151-demigod' && typeof v.special.line === 'string' && Object.hasOwn(SPECIAL_LINES, v.special.line)));
}
export function validCardMisprint(card: Record<string, unknown>) {
  if (card.baseRawValue !== undefined && !range(card.baseRawValue, .001, 1000000)) return false;
  if (card.misprint === undefined) return true;
  const m = card.misprint;
  return card.origin === 'pack' && card.finish !== 'metal' && range(card.baseRawValue, .001, 1000000) && record(m) && m.version === 1 && m.modifier === 30 && validDefect(m.defect) && typeof m.packUid === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(m.packUid) && m.packUid === card.source && ['individual', 'full-pack'].includes(String(m.origin)) && (m.origin === 'full-pack' ? m.productionId === `${m.packUid}.sheet` : m.productionId === undefined) && (m.specialType === undefined || m.specialType === 'english-151-demigod' || m.specialType === 'ascended-heroes-god');
}
export function validOpeningEvents(pack: Pack, cards: OwnedCard[]) {
  const events = pack.rareEvents;
  if (!events) return pack.generationVersion === 1 && cards.every(c => !c.misprint);
  if (events.special?.type === 'english-151-demigod' && !SPECIAL_LINES[events.special.line].every((id, i) => cards[i + 8]?.cardId === id && cards[i + 8].finish === 'holo')) return false;
  if (events.special?.type === 'ascended-heroes-god' && (pack.setCode !== 'me02.5' || cards.length !== 11 || CARD_BY_ID.get(cards[0].cardId)?.setCode !== 'sve' || !cards.slice(1).every((card, i) => CARD_BY_ID.get(card.cardId)?.rarity === (i < 3 ? 'Mega attack rare' : 'Special illustration rare') && CARD_BY_ID.get(card.cardId)?.setCode === 'me02.5' && card.finish === 'holo'))) return false;
  return cards.every(card => {
    const m = card.misprint;
    if (events.fullMisprint) {
      if (!m || m.origin !== 'full-pack' || !events.production) return false;
      const d = m.defect, p = events.production, factor = d.offsetX / p.offsetX;
      if (!Number.isFinite(factor) || factor < .96 - 1e-8 || factor > 1.04 + 1e-8 || d.type !== p.type || d.side !== p.side || d.inkBandY !== p.inkBandY || d.inkBandWidth !== p.inkBandWidth || !(['severity', 'offsetY', 'cutTilt', 'registrationX', 'registrationY'] as const).every(key => Math.abs(d[key] - p[key] * factor) < 1e-8)) return false;
    }
    if (!m) return true;
    return m.packUid === pack.uid && (m.origin === 'full-pack') === events.fullMisprint && m.specialType === events.special?.type;
  });
}
