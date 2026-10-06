import { createPack } from '../core/inventory';
import { rollPackEvents, rareRandom, SPECIAL_LINES } from '../core/rare-events';

/** Imported only by the development entry. An override of the decision, not
 * a second generator: the ordinary sealed instance uses generatePack later. */
export function createTestPack(slot: 1 | 2) {
  const pack = createPack(slot === 1 ? '151-booster' : 'ascended-heroes-booster');
  pack.debugGenerated = true;
  pack.rareEvents = rollPackEvents(pack.seed, false, pack.setCode);
  const lines = Object.keys(SPECIAL_LINES) as (keyof typeof SPECIAL_LINES)[];
  pack.rareEvents.special = slot === 1
    ? { type: 'english-151-demigod', line: lines[Math.floor(rareRandom(pack.seed, 0x13579bdf)() * lines.length)] }
    : { type: 'ascended-heroes-god' };
  return pack;
}
