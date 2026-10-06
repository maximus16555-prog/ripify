# Persistent rare pack events

All odds and prices here are **RIPIFY simulation rules**, not official manufacturing rates or real market quotes. Ordinary pack weighting, card prices, condition generation, verified card definitions and product manifests remain unchanged. Ripping, camera, card-stack movement and manual reveal controls remain unchanged; their displayed raw estimates now include the owned copy's misprint modifier.

## Independent events

| Event | Configured odds | Scope |
| --- | --- | --- |
| Individual misprint | 1/500 | Each eligible paper card in a generated pack, including Basic Energy and Trainers |
| Full misprint pack | 1/2,000 | Each generated pack; one shared production incident |
| English 151 special pack | 1/1,500 | Eligible English 151 boosters only |
| Special + full misprint | 1/3,000,000 | Product of the two independent pack rolls |

Fixed promos and the UPC metal card are outside pack-generation misprint rolls. A full misprint pack bypasses the individual rolls, so its cards never receive two modifiers. Without a full-pack event, every eligible card in a special pack still gets its normal 1/500 roll.

The supported English 151 special composition is one complete starter evolution line in the final three slots, replacing both reverse slots and the final rare. This follows the [contemporaneous PokeBeach set report](https://www.pokebeach.com/2023/09/scarlet-violet-151-complete-set-guide-card-images-products-demigod-packs-store-giveaways-and-more), with exact printings verified against the existing structured dataset and [official checklist](https://assets.pokemon.com/assets/cms2-en-uk/pdf/trading-card-game/checklist/mew_web_cardlist_en.pdf). It is not the six-hit Japanese composition. The first eight slots retain one Energy, four commons and three uncommons.

- Bulbasaur #166 → Ivysaur #167 → Venusaur ex #198.
- Charmander #168 → Charmeleon #169 → Charizard ex #199.
- Squirtle #170 → Wartortle #171 → Blastoise ex #200.

Every generated pack still has 11 unique exact card IDs and 11 unique owned copies. Different packs may contain further copies of those printings.

## Persistence, provenance and grading

The saved pack seed feeds separate avalanche-mixed random streams for special events, full-pack events, individual misprints and defect parameters. These do not consume ordinary card-selection or condition draws. The outcome is generated once, persisted before reveal, and resumed from the saved cards; UI reopening and browser reload do not regenerate it.

Owned instances store their unmodified base raw value and, if misprinted, one 30× modifier plus defect type, side, severity, alignment, cutting, registration and ink parameters. Full packs share a production ID and defect type/side, with 4% per-card sheet-position variation. Stored provenance distinguishes individual/full-pack and special-pack combinations. Generation receipts retain seed, event state, exact IDs, finish, raw base and defects after collection or sale; population totals count each generation once.

Misprint raw market value is **the copy's saved raw base, adjusted by the existing market function, ×30**. Grading applies its ordinary grade multiplier and grader premium to that raw value once. It never takes an existing graded valuation as input. No 900× state is accepted by save validation.

Manufacturing faults affect simulated grading tendencies without mutating saved wear/condition. Every paper misprint can be submitted through the normal grading flow. The same UID, underlying exact artwork, factory defect and condition remain inside the returned slab.

Off-center copies shift the exact printing against the cardstock. Miscuts also deform the shared two-sided card outline; rear offsets mirror the same physical edge. Registration defects use a faint displaced impression of that same printing, and ink defects use a persistent missing-ink band. Printing faults retain their saved front/back side. Existing scratches/edge wear remain separate. Raw and slab inspection and display share the same renderer; no render-time randomness or replacement art is used.

Previously generated version-1 openings resume unchanged, including legacy duplicate printings. Old unopened packs adopt generation version 2 only when first generated. The schema remains version 2 with validated additive optional fields; existing saves do not require resetting.

## Simulation results

Run `npm run simulate:rare-events` (`npm.cmd` on restricted Windows PowerShell). The script uses the actual generation, valuation and event-roll modules, without a GameStore, image loading or awarding items. Results are recorded in [rare-events-simulation.json](../artifacts/rare-events-simulation.json).

100,000 complete packs / 1,100,000 owned-card constructions:

- 68 special packs, split 23 Venusaur / 23 Charizard / 22 Blastoise.
- 50 full misprint packs; 550 shared-production misprints.
- 2,148 independent misprints, including three inside special packs.
- Zero duplicate definitions/instances, invalid set mappings, invalid special compositions, multiplier errors or persistence failures.

10,000,000 event-stage pack rolls / 109,945,143 eligible individual-card trials:

| Event | Hits | Observed rate | Expected |
| --- | --- | --- | --- |
| Individual | 219,501 | 1/500.89 | 1/500 |
| Full pack | 4,987 | 1/2,005.21 | 1/2,000 |
| Special | 6,590 | 1/1,517.45 | 1/1,500 |
| Combined | 5 | 1/2,000,000 | 1/3,000,000 |

The combined event has only 3.33 expected observations in this sample; five is normal stochastic variation, not a changed configured rate. All four counts are within one standard deviation of their expected counts. All five natural combination seeds were then passed through complete generation and save/reload validation. Each produced one pack, 11 distinct cards, one production type and one 30× modifier per card. The event-stage sample also contained 147 individual misprints in special packs.

### Economy effect

Using identical pack seeds, an 8-coin physical pack, market seed 0 and time 0:

| Metric | Ordinary outcomes | Including requested rare events |
| --- | --- | --- |
| Mean raw value | 7.85 | 8.48 |
| Median raw value | 4.84 | 4.84 |
| Mean raw recovery | 98.11% | 106.05% |
| Packs below purchase cost | 81.54% | 79.72% |

The fixed 30× bonus and special composition raise expected value above pack cost at this market state. The existing instant Sell action pays owned value; separate Quick Sell/NPC/eBay channels are not implemented. Accordingly, this rare-event pass does not claim to preserve a negative long-run buy/sell expectation. No prices, ordinary weights, bonus rates or condition probabilities were silently retuned to conceal the effect. The earlier [economy balance simulation](economy-balance.md) describes ordinary version-1 outcomes; use this report for current rare-event-inclusive measurements.

## Validation

Tests cover all three special lines, natural combined witnesses, individually misprinted special packs, multiple individual hits in an ordinary pack, shared production variation, single raw modifiers across every grader and grade tier, corrupt-save rejection, interrupted legacy/new openings, persistent receipts/population, actual grading and display transactions, two-sided defects and identical raw/slab geometry. Browser regressions exercise the existing progressive tear, manual stack swipes, image preloading, physical rotation and stand replacement/removal/reload alongside rare-event discovery and misprint grading.

Production build and all 89 logic tests pass. All 11 targeted browser scenarios pass, including the short keyboard-to-mouse rip after replacing its fixed 180ms test delay with an observed-progress wait (software rendering can miss that short window). Gameplay timing/controls were not changed.

The [scope check](../artifacts/rare-events-scope-check.json) confirms the verified card dataset, product definitions, tear seam and opening CSS retain their prior hashes. The pack opener also matches its prior hash after reversing only its four valuation substitutions. The pack image cache has one supporting change to carry the saved print offset onto the same retained decoded image element.

Visual checks: [all four raw/slab defects, front](../artifacts/misprint-gallery-front.png), [back](../artifacts/misprint-gallery-back.png), [angled](../artifacts/misprint-gallery-angled.png), [actual raw miscut](../artifacts/misprint-raw-front.png), [same copy graded](../artifacts/misprint-slab-front.png). Repeat the visual harness with `node scripts/check-misprint-visuals.mjs` while the dev server runs. It uses an isolated browser context and never writes the player's save.
