import { CARDS } from './cards';
import { packPullPaths } from '../core/pack-pools';
import type { CardDefinition } from '../core/types';

/** Development validation; metadata/image source checks are a separate live audit. */
export function validate151(definitions: readonly CardDefinition[] = CARDS) {
  const cards = definitions.filter(c => c.setCode === 'sv03.5');
  const expectedIds = Array.from({ length: 207 }, (_, i) => `sv03.5-${String(i + 1).padStart(3, '0')}`);
  const ids = new Set(cards.map(c => c.id));
  const missingDefinitions = expectedIds.filter(id => !ids.has(id));
  const unexpectedDefinitions = cards.filter(c => !expectedIds.includes(c.id)).map(c => c.id);
  const duplicateDefinitionIds = cards.filter((c, i) => cards.findIndex(other => other.id === c.id) !== i).map(c => c.id);
  const missingImages: string[] = [], missingImportantMetadata: { id: string; fields: string[] }[] = [];
  const invalidMappings = definitions.filter(c => c.id.startsWith('sv03.5-') && c.setCode !== 'sv03.5').map(c => c.id);
  const paths = packPullPaths('sv03.5', definitions);
  const obtainable = new Set(paths.filter(p => p.chance > 0).flatMap(p => p.cards.map(c => c.id)));
  const pullPaths = cards.map(c => ({ id: c.id, slots: paths.filter(p => p.chance > 0 && p.cards.some(candidate => candidate.id === c.id)).map(p => p.slot) }));
  for (const card of cards) {
    const fields = ['name', 'number', 'rarity', 'category', 'sourceUrl'].filter(key => !card[key as keyof CardDefinition]);
    if (card.category === 'Pokemon') {
      if (!card.hp) fields.push('hp');
      if (!card.types?.length) fields.push('types');
      if (!card.attacks?.length) fields.push('attacks');
      if (card.retreat === undefined) fields.push('retreat');
      if (!card.artist) fields.push('artist');
    } else if (card.category === 'Trainer' && !card.artist) fields.push('artist');
    if (fields.length) missingImportantMetadata.push({ id: card.id, fields });
    if (!card.image || !card.imageSmall) missingImages.push(card.id);
    const number = card.id.split('-').at(-1);
    const base = `https://assets.tcgdex.net/en/sv/sv03.5/${number}`;
    if (card.number !== `${number}/165` || card.set !== 'Scarlet & Violet—151' || card.sourceUrl !== `https://api.tcgdex.net/v2/en/cards/${card.id}` || ![`${base}/high.webp`, `${base}/high.png`, `${base}/low.webp`].includes(card.image ?? '') || card.imageSmall !== `${base}/low.webp`) invalidMappings.push(card.id);
  }
  const unobtainable = cards.filter(c => !obtainable.has(c.id)).map(c => c.id);
  const exhaustedPools = paths.filter(p => p.chance > 0 && p.cards.length < p.count).map(p => p.slot);
  return { setId: 'sv03.5', uniqueDefinitions: ids.size, missingDefinitions, unexpectedDefinitions, duplicateDefinitionIds, missingImages, missingImportantMetadata, invalidMappings, unobtainable, exhaustedPools, pullPaths };
}
