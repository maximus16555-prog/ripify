import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import artwork from '../src/data/verified/artwork.json' with { type: 'json' };
import snapshot from '../src/data/verified/151.json' with { type: 'json' };
import ascended from '../src/data/verified/ascended-heroes.json' with { type: 'json' };
import { CARD_BY_ID } from '../src/data/cards';

describe('same-origin exact printing cache', () => {
  it('pins every cached scan to its exact source and unchanged verified file bytes', () => {
    const printed = [...snapshot.cards, ...ascended.cards];
    const assets = artwork.assets.filter(a => a.kind === 'card' && a.path.startsWith('/artwork/cards/'));
    expect(assets).toHaveLength(505);
    expect(new Set(assets.map(a => a.id)).size).toBe(505);
    for (const asset of assets) {
      const source = printed.find(c => c.id === asset.id)!;
      expect(asset.sourceUrl).toBe(source.image);
      expect(asset.sourcePage).toBe(source.sourceUrl);
      expect(CARD_BY_ID.get(asset.id)!.image).toBe(asset.path);
      expect(createHash('sha256').update(readFileSync(`public${asset.path}`)).digest('hex')).toBe(asset.sha256);
    }
  });
});
