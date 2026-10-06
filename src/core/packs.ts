import { packPools, selectUniqueCard } from './pack-pools';
import { PRODUCT_BY_ID } from '../data/products';
import { PACK_BALANCE } from '../data/balance';
import { createCard, seeded } from './inventory';
import { applyPackMisprints, rollPackEvents, specialEligible, SPECIAL_LINES } from './rare-events';
import { CARD_BY_ID } from '../data/cards';
import type { OwnedCard, Pack, Rarity } from './types';
export { uuid } from './inventory';
// Tunable SIMULATED pull rates. These are not official manufacturing odds.
export function pickRarity(random = Math.random, setCode = 'sv03.5'): Rarity {
  const { rare, double, ultra, hyper } = PACK_BALANCE[setCode].finalSlot;
  const n = random();
  return n < rare ? 'Rare' : n < rare + double ? 'Double rare' : n < rare + double + ultra ? 'Ultra Rare' : n < rare + double + ultra + hyper ? 'Hyper rare' : setCode === 'me02.5' ? 'Mega attack rare' : 'Hyper rare';
}
export function generatePack(pack: Pack, random = seeded(pack.seed), now = Date.now()): OwnedCard[] {
  const p = PRODUCT_BY_ID.get(pack.productId);
  if (!p || p.type !== 'booster' || !p.manifest.verified || p.setCode !== pack.setCode || !PACK_BALANCE[pack.setCode] || ![1, 2].includes(pack.generationVersion)) throw new Error('Unsupported booster');
  // Version 1 is retained for already-generated legacy outcomes/audit fixtures.
  // Live unopened legacy inventory upgrades before its first generation.
  if (pack.generationVersion === 2) pack.rareEvents ??= rollPackEvents(pack.seed, specialEligible(pack), pack.setCode);
  const pools = packPools(pack.setCode), usedIds = new Set<string>();
  const choose = (cards: ReturnType<typeof packPools>['common'], finish: OwnedCard['finish']) => {
    const d = selectUniqueCard(cards, usedIds, random);
    return createCard(d.id, pack.uid, random, finish, 'pack', now);
  };
  const result: OwnedCard[] = [choose(pools.energy, 'normal')];
  if (pack.rareEvents?.special?.type === 'ascended-heroes-god') {
    if (pack.setCode !== 'me02.5') throw new Error('Special event does not match set');
    for (let i = 0; i < 3; i++) result.push(choose(pools.megaAttack, 'holo'));
    for (let i = 0; i < 7; i++) result.push(choose(pools.specialIllustration, 'holo'));
    return applyPackMisprints(pack, result);
  }
  for (let i = 0; i < 7; i++) result.push(choose(i < 4 ? pools.common : pools.uncommon, 'normal'));
  if (pack.rareEvents?.special?.type === 'english-151-demigod') {
    for (const id of SPECIAL_LINES[pack.rareEvents.special.line]) {
      const card = CARD_BY_ID.get(id);
      if (!card || card.setCode !== pack.setCode) throw new Error('Unverified special-pack printing');
      result.push(choose([card], 'holo'));
    }
    return applyPackMisprints(pack, result);
  }
  result.push(choose(pools.reverse, 'reverse'));
  const upgrade = random();
  const { illustration, specialIllustration } = PACK_BALANCE[pack.setCode].reverseUpgrade;
  result.push(upgrade < 1 - illustration - specialIllustration ? choose(pools.reverse, 'reverse') : choose(upgrade < 1 - specialIllustration ? pools.illustration : pools.specialIllustration, 'holo'));
  const pickFinal = pickRarity(random, pack.setCode);
  result.push(choose(pools.final[pickFinal], 'holo'));
  return pack.generationVersion === 2 ? applyPackMisprints(pack, result) : result;
}
