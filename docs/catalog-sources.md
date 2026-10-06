# Verified playable catalog

This milestone intentionally supports one English expansion, Scarlet & Violet—151. The room, controls and settings were retained. Prices and pull probabilities are configurable **simulated coin/game values**, not market quotes or official odds.

## Card definitions

The pinned [snapshot](../src/data/verified/151.json) contains all 207 numbered English 151 cards, three exact Scarlet & Violet Black Star Promos, and eight real Basic Energy definitions. Definitions retain their source identifiers, printed metadata and exact image references. They are distinct from owned copies, condition, finish and grading.

See [complete-pool validation](151-completeness.md) for the live 207-card metadata/image audit, generation-path checks, and 100,000-pack no-duplicate simulation. New packs select exact IDs without replacement inside each existing slot pool; persisted old openings keep their original copies.

- [TCGdex English 151 set](https://api.tcgdex.net/v2/en/sets/sv03.5)
- [Official 151 checklist](https://assets.pokemon.com/assets/cms2/pdf/trading-card-game/checklist/mew_web_cardlist_en.pdf)
- [Snorlax #051](https://api.tcgdex.net/v2/en/cards/svp-051), [Mewtwo #052](https://api.tcgdex.net/v2/en/cards/svp-052), [Mew ex #053](https://api.tcgdex.net/v2/en/cards/svp-053)
- [Mew ex #205](https://api.tcgdex.net/v2/en/cards/sv03.5-205): paper printing in booster pool; UPC copy has separate **metal** finish. A paper scan is never used to represent the metal copy.
- [Structured Basic Energy definitions](https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/sve.json): exact source IDs `sve-1` through `sve-8`. Their original image host returned HTTP 403. Exact matching SVE #001-008 scans are now cached locally from their individual PkmnCards entries; see [artwork provenance](artwork-sources.md).

The [importer](../scripts/import-catalog.py) caches metadata, limits concurrency to three requests, retries transient errors and verifies exact image paths. It is an explicit development command, not a game-startup API call. Refresh with `python scripts/import-catalog.py`. The game downloads individual images on demand. Failed image loads produce a missing-image state, without a fabricated replacement.

TCGdex's database is [MIT licensed](TCGdex-LICENSE.txt); this does **not** license Pokémon card artwork. Card and product imagery remains copyrighted by its respective owners. The game makes no ownership, endorsement or distribution-license claims. A production release must secure applicable image permissions/terms.

## Products and fixed contents

| Definition | Exact variant | Packs | Fixed cards | Verification |
| --- | --- | --- | --- | --- |
| `151-booster` | English 151 booster | Single booster | None | [Official pack count](https://www.pokemoncenter.com/en-ca/product/699-85310/pokemon-tcg-scarlet-and-violet-151-mini-tin-electabuzz-and-magnemite) |
| `151-etb` | Standard English ETB, **not Pokémon Center** | 9 × 151 | Snorlax SVP #051, foil | [Manufacturer contents](https://www.pokemon.com/uk/pokemon-tcg/product-gallery/scarlet-violet-151-elite-trainer-box) |
| `151-upc` | English Ultra-Premium Collection | 16 × 151 | Mewtwo SVP #052, Mew ex SVP #053, metal Mew ex #205/165 | [Manufacturer contents](https://www.pokemon.com/uk/pokemon-tcg/product-gallery/scarlet-violet-151-ultra-premium-collection/) |

Only gameplay-relevant packs and fixed cards are resolved. Accessories are intentionally outside this module, not replaced with invented contents. Pokémon Center ETBs and additional products are excluded pending exact variant verification.

Exact English packaging images are now cached locally for the 151 booster, standard ETB and UPC. They are connected to product previews, wrapper/lid views and physical product props. The existing geometry and interactions are preserved; no artwork is fabricated. The image source IDs, exact card-page links and checksums are recorded in [artwork provenance](artwork-sources.md). A failed file still displays an explicit unavailable state.

English boosters contain 10 set cards plus one Basic Energy; online code cards are not collectible inventory here. The base slot configuration follows [PokeBeach's original configuration report](https://www.pokebeach.com/2023/03/scarlet-violet-booster-pack-configuration-finally-revealed-major-exciting-changes): four common, three uncommon, two reverse-holo slots (one may upgrade), one holo-or-better slot. IR/SIR upgrades occupy the second reverse slot. The Energy is presented first as a pack trick to keep a rare at the end. Pull probabilities are explicitly simulated; English 151 special evolution-line packs now follow the verified composition described in [rare-event validation](rare-events.md), at explicitly simulated odds. Foil Energy variants remain outside this milestone.

## Ownership and persistence

Purchases create sealed instances. Box opening requires a lid action followed by taking contents. The outer instance resolves once into individually unopened seeded packs and fixed owned-card copies; a receipt records child IDs. Packs generate and persist an outcome once; Escape and reload never reroll it. Opening boxes never opens their packs.

Save schema v2 keeps the existing browser storage key for migration. Old prototype saves are preserved whole under `legacyArchive` in exported saves; invented old IDs are not relabeled as real printings. Currency, preferences and statistics survive migration. Legacy cards, packs, displays and pending prototype openings are archived rather than admitted into the real playable catalog.
