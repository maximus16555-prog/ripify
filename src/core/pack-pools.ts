import { CARDS } from '../data/cards';
import { PACK_BALANCE } from '../data/balance';
import type { CardDefinition } from './types';

/** Shared eligibility for generation and development pullability validation. */
export function packPools(setCode: string, definitions: readonly CardDefinition[] = CARDS) {
  const set = definitions.filter(c => c.setCode === setCode);
  const rarity = (name: string) => set.filter(c => c.rarity === name);
  return {
    energy: definitions.filter(c => c.setCode === 'sve'),
    common: rarity('Common'), uncommon: rarity('Uncommon'),
    reverse: set.filter(c => ['Common', 'Uncommon', 'Rare'].includes(c.rarity)),
    illustration: rarity('Illustration rare'), specialIllustration: rarity('Special illustration rare'),
    megaAttack: rarity('Mega attack rare'),
    final: { Rare: rarity('Rare'), 'Double rare': rarity('Double rare'), 'Ultra Rare': rarity('Ultra Rare'), 'Hyper rare': rarity(setCode === 'me02.5' ? 'Mega Hyper Rare' : 'Hyper rare'), 'Mega attack rare': rarity('Mega attack rare') } as Record<string, CardDefinition[]>
  };
}

export function packPullPaths(setCode: string, definitions: readonly CardDefinition[] = CARDS) {
  const pools = packPools(setCode, definitions), rules = PACK_BALANCE[setCode];
  if (!rules) throw new Error(`Missing pack rules for ${setCode}`);
  return [
    { slot: 'energy', count: 1, chance: 1, cards: pools.energy },
    { slot: 'common', count: 4, chance: 1, cards: pools.common },
    { slot: 'uncommon', count: 3, chance: 1, cards: pools.uncommon },
    { slot: 'first-reverse', count: 1, chance: 1, cards: pools.reverse },
    { slot: 'second-reverse', count: 1, chance: 1 - rules.reverseUpgrade.illustration - rules.reverseUpgrade.specialIllustration, cards: pools.reverse },
    { slot: 'illustration', count: 1, chance: rules.reverseUpgrade.illustration, cards: pools.illustration },
    { slot: 'special-illustration', count: 1, chance: rules.reverseUpgrade.specialIllustration, cards: pools.specialIllustration },
    ...Object.entries({ Rare: rules.finalSlot.rare, 'Double rare': rules.finalSlot.double, 'Ultra Rare': rules.finalSlot.ultra, 'Hyper rare': rules.finalSlot.hyper, ...(rules.finalSlot.megaAttack ? { 'Mega attack rare': rules.finalSlot.megaAttack } : {}) }).map(([rarity, chance]) => ({ slot: `final-${rarity}`, count: 1, chance, cards: pools.final[rarity] }))
  ];
}

/** One random draw, no retries and no rarity fallback when a slot is exhausted. */
export function selectUniqueCard(candidates: readonly CardDefinition[], usedIds: Set<string>, random: () => number) {
  const eligible = candidates.filter(card => !usedIds.has(card.id));
  if (!eligible.length) throw new Error('No unique candidates remain in the selected pack slot');
  const card = eligible[Math.min(eligible.length - 1, Math.floor(random() * eligible.length))];
  usedIds.add(card.id);
  return card;
}
