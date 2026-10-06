# English Scarlet & Violet-151: complete pool and unique pack selection

The existing pinned TCGdex snapshot already contained **all 207 numbered English 151 cards**. It was retained and verified rather than replaced with a partial pool or fictional cards. Three fixed SVP promos and eight Basic Energy definitions remain separate from the numbered 151 expansion.

## Source and artwork audit

The official [English checklist](https://assets.pokemon.com/assets/cms2/pdf/trading-card-game/checklist/mew_web_cardlist_en.pdf) runs from 001 through 207, with the printed denominator 165. The development audit freshly checked the [TCGdex set](https://api.tcgdex.net/v2/en/sets/sv03.5), all 207 individual card endpoints, and downloaded/decoded their exact high-resolution image references.

| Check | Result |
|---|---:|
| Unique 151 definitions | 207 |
| Missing definitions | 0 |
| Unexpected set definitions | 0 |
| Missing/broken 151 images | 0 |
| Missing applicable important metadata | 0 |
| Invalid set/number/metadata/image mappings | 0 |
| Unrelated definitions sharing identical image bytes | 0 |
| Intended cards without a generation path | 0 |

Each source ID is `sv03.5-NNN`; its stored number is `NNN/165`, and its high/low artwork comes from that exact TCGdex printing's image base. The audit records image dimensions, SHA-256 hashes, source-response hashes, metadata differences and source URLs. It compares printed metadata, including names, rarity, HP/types, attacks, abilities, weaknesses, resistances, retreat, illustrator and evolution information. Optional fields are not invented: Trainer/Energy cards do not need Pokemon-only stats, and the gold Basic Psychic Energy #207 has no illustrator field in the structured source.

Existing printed fields are preserved. The runtime definition now also exposes the snapshot's types, suffix, evolution source, regulation mark, description, Trainer effects and available finish variants. Physical condition, owned-copy IDs, provenance and grading remain on owned instances.

The source audit is **development-only**. Its downloaded images are cached outside game assets; the game continues loading only cards it needs. No new artwork was fabricated or substituted. Host availability can change after an audit: existing failed-load states still say `Image unavailable`. Artwork ownership/permissions and data attribution remain as documented in [catalog sources](catalog-sources.md).

## Selection without replacement

Generation retains the same eleven-card flow: one Basic Energy, four Commons, three Uncommons, first reverse, second reverse/IR/SIR upgrade, and final holo-or-better card.

For every slot, the generator determines its existing rarity pool, removes exact IDs already selected in this pack, chooses once from the remaining candidates, and records the ID. It never retries indefinitely, rerolls rarity or silently substitutes a different tier. An exhausted pool throws an explicit error before inventory is mutated.

The eligible pools are shared between generation and pullability validation. All 207 definitions have positive-probability paths, including all secret-numbered cards. The uniqueness set is local to one call: different packs can still contain the same printing, and distinct printings of the same Pokemon can coexist within one pack.

This exact-ID uniqueness is a RIPIFY selection rule, not a claim about real booster manufacturing collation.

The number and order of random draws are unchanged. The pre-balance condition regression still matches all 2,816 condition outcomes across 256 seeds; desirable cards do not receive better condition.

## 100,000-pack validation

Seed: `1512026`. The simulation uses the real generator and valuation functions, without granting items to player storage.

| Metric | Result |
|---|---:|
| Packs simulated | 100,000 |
| Duplicate exact card IDs within packs | 0 |
| Duplicate owned-copy IDs within packs | 0 |
| Unique 151 definitions observed | 207 / 207 |
| Set cards not observed | 0 |

Observed pack presence:

| Rarity | Packs containing tier |
|---|---:|
| Common | 100.000% |
| Uncommon | 100.000% |
| Rare | 83.270% |
| Double rare | 18.740% |
| Ultra Rare | 4.848% |
| Illustration rare | 6.638% |
| Special illustration rare | 1.539% |
| Hyper rare | 0.408% |

These presence percentages overlap; they are not mutually exclusive. Configured final/upgrade probabilities, chase frequencies, card values and purchase prices were not changed. A pack still costs 8 coins. Compared with the preceding balance pass, mean raw value changes from 7.4993 to 7.5096, median 4.27 to 4.28, and recovery 93.7407% to 93.8700%. The small difference comes from removing previously selected Commons/Uncommons from later reverse pools. Raw expected value remains below purchase price across the sampled market cycle (maximum expectation 7.9051 coins). Grading and condition valuation are unchanged.

## Preloading and save compatibility

The existing image cache preloads/decodes only the generated pack before reveal input becomes available. It was not changed, nor were tearing, swiping, stacking, animation, controls or camera. Hash checks confirm those source files are identical to the prior implementation.

Newly generated packs have eleven unique exact IDs. Already generated openings resume their persisted copies and index without rerolling. If an older saved opening contained duplicate printings, those owned copies are preserved rather than deleted or replaced. Duplicate printings across the binder and across future packs are permitted.

## Reproduce

```sh
npm run validate:151 -- 100000
python scripts/audit-151-source.py --refresh
npm test
npm run build
```

Use `npm.cmd` in restricted Windows PowerShell. The image audit requires Pillow. Without `--refresh`, the source audit reuses its development cache to avoid repeated downloads; image availability results then describe the cached check rather than a new network check. At most three source requests run concurrently, with bounded retries.

- [Live source/image audit](../artifacts/151-source-audit.json)
- [Full generation, pullability and economy report](../artifacts/151-validation.json)
- [Shared slot pools and unique selection](../src/core/pack-pools.ts)
- [Catalog and generation tests](../tests/catalog-151.test.ts)

Validation: production build, 62 logic tests and three targeted browser regressions pass. Browser checks cover persisted manual reveals, stable next-card promotion and active-pack-only preloading with a deliberately delayed image.
