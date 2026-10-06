import snapshot from './verified/151.json' with { type: 'json' };
import ascended from './verified/ascended-heroes.json' with { type: 'json' };
import artwork from './verified/artwork.json' with { type: 'json' };
import type { CardDefinition } from '../core/types';
import { baseCardValue } from './balance';
export { PRODUCTS } from './products';
// Simulated coin values, deliberately separate from verified printed information.
export const CARDS: CardDefinition[] = [...snapshot.cards, ...ascended.cards].map(c => {
  const printed = c as unknown as Record<string, unknown>;
  const asset = artwork.assets.find(a => a.kind === 'card' && a.id === c.id);
  const count = c.set.id === 'sv03.5' ? 165 : c.set.id === 'me02.5' ? 217 : c.set.id === 'svp' ? null : 8;
  return { id: c.id, name: c.name, set: c.set.id === 'sv03.5' ? 'Scarlet & Violet—151' : c.set.name, setCode: c.set.id, number: c.set.id === 'sve' ? c.localId.padStart(3, '0') : `${c.localId}${count ? '/' + count : ''}`, rarity: c.rarity, year: c.set.id === 'me02.5' ? 2026 : 2023, releaseDate: c.set.id === 'sv03.5' ? snapshot.set.releaseDate : c.set.id === 'me02.5' ? ascended.set.releaseDate : undefined, type: (printed.types as string[] | undefined)?.join(' / ') || c.category, category: c.category, hp: printed.hp as number | undefined, artist: printed.illustrator as string | undefined, stage: printed.stage as string | undefined, attacks: printed.attacks as unknown[] | undefined, abilities: printed.abilities as unknown[] | undefined, weaknesses: printed.weaknesses as unknown[] | undefined, resistances: printed.resistances as unknown[] | undefined, retreat: printed.retreat as number | undefined, types: printed.types as string[] | undefined, suffix: printed.suffix as string | undefined, evolvesFrom: printed.evolveFrom as string | undefined, regulationMark: printed.regulationMark as string | undefined, description: printed.description as string | undefined, effect: printed.effect as string | undefined, variants: printed.variants as CardDefinition['variants'], value: baseCardValue(c.id, c.rarity), color: '#a3b5ab', image: asset?.path ?? c.image ?? undefined, imageSmall: asset?.path ?? (c.image ? c.imageSmall : undefined), sourceUrl: c.sourceUrl, verified: true };
});
export const CARD_BY_ID = new Map(CARDS.map(c => [c.id, c]));
export const RARITIES = [...new Set(CARDS.map(c => c.rarity))];
