# Individual card prices

RIPIFY now resolves a base raw value by exact card-definition ID. All 513 supported definitions have explicit prices: 506 entries in `src/data/card-prices.json` and seven higher-priority manual Ascended Heroes entries in `src/data/balance.ts`. There is no runtime rarity-price fallback. Unknown IDs fail explicitly.

These are simulated game prices, not real-world market quotes. The development authoring tool uses collector preferences, printed traits, set/rarity calibration and bounded, deterministic printing demand. It writes the final cent-rounded table; the game does not generate prices on load. Common, Uncommon and Rare mean authoring targets increase 8%, 6% and 4%; most higher-tier targets increase 0-1.5%. Individual cards can increase or decrease substantially to establish meaningful collector differences while keeping the overall economy adjustment small.

Manual prices remain 4582, 4317, 1684, 768, 711, 657 and 586 for Ascended Heroes #276, #284, #290, #294, #277, #281 and #295 respectively. They also retain their exemption from simulated market fluctuations.

## Before / after examples

All examples below belong to Scarlet & Violet-151. These are base values before existing market, physical condition, damage or grading modifiers.

| Exact card | Rarity | Before | After |
|---|---|---:|---:|
| Bulbasaur #001 | Common | $0.22 | $0.33 |
| Charmander #004 | Common | $0.22 | $0.46 |
| Caterpie #010 | Common | $0.22 | $0.12 |
| Charmeleon #005 | Uncommon | $0.41 | $0.77 |
| Butterfree #012 | Uncommon | $0.41 | $0.38 |
| Raichu #026 | Rare | $1.05 | $1.58 |
| Machamp #068 | Rare | $1.05 | $0.65 |
| Charizard ex #006 | Double rare | $5.10 | $12.06 |
| Arbok ex #024 | Double rare | $5.10 | $3.07 |
| Charmander #168 | Illustration rare | $18.10 | $34.33 |
| Charizard ex #183 | Ultra Rare | $12.10 | $27.80 |
| Charizard ex #199 | Special illustration rare | $65.00 | $141.60 |

Ascended Heroes examples: Erika's Oddish #001 (Common) $0.22 -> $0.17; Erika's Gloom #002 (Uncommon) $0.41 -> $0.28; Erika's Victreebel #006 (Rare) $1.05 -> $0.93; Erika's Vileplume ex #003 (Double rare) $5.10 -> $2.55; Erika's Tangela #218 (Illustration rare) $18.10 -> $11.56. Rebalancing individual demand includes lower-valued cards as well as upward changes; it does not multiply every card uniformly.

## Shared valuation and existing saves

Catalog definitions receive their stored prices through `baseCardValue`. Binder, inspection, pack results, computer apps, sales and grading continue using the existing economy functions. Saved pull-time `baseRawValue` fields remain historical snapshots. They no longer override the current definition value for old misprints; normal and misprinted copies use the same authoritative printing price. The misprint modifier remains exactly one 30x application. Condition, crack damage, grading premiums, ownership and history are unchanged.

## Audit

The complete audit is in `artifacts/card-pricing-audit-after.json`, including 20 Commons, 20 Uncommons, 20 Rares and 20 higher-rarity definitions split across both playable sets. Every definition has an explicit individual or manual price. Natural cent-level matches are permitted.

| Rarity | Definitions | Distinct prices before | Distinct prices after |
|---|---:|---:|---:|
| Common | 158 | 1 | 31 |
| Uncommon | 131 | 1 | 47 |
| Rare | 50 | 1 | 43 |
| Double rare | 51 | 1 | 51 |
| Illustration rare | 49 | 1 | 48 |
| Ultra Rare | 30 | 1 | 30 |

The largest matching-price group within either set/rarity is below 20%, rather than a whole rarity sharing one price. The 80-card sample has 12, 18, 18 and 20 distinct prices respectively.

## Pack simulations

All simulations run in isolated development processes without awarding player items. Same seeds, generation rules, condition logic, pricing date and market seed are used before and after. Each row represents 100,000 packs per set.

Ordinary-pack simulations exclude rare events to isolate normal pricing:

| Set | Cost | Mean before / after | Median before / after | Strict losses before / after |
|---|---:|---:|---:|---:|
| 151 | $8.00 | $7.5096 / $7.7508 (+3.21%) | $4.28 / $4.69 | 78.701% / 79.247% |
| Ascended Heroes | $9.50 | $17.1046 / $17.3711 (+1.56%) | $4.23 / $4.60 | 85.737% / 82.715% |

The 151 median improves but its strict loss fraction slightly increases because individual pricing reshapes returns around the pack-cost threshold. The change does not promise fewer losses for every set. Ascended Heroes already had a mean above cost because of its intentionally expensive manual chases; those values are preserved rather than capped.

Current production generation including existing special/god and misprint events:

| Set | Mean before / after | Median before / after | Strict losses before / after |
|---|---:|---:|---:|
| 151 | $8.1397 / $8.4440 (+3.74%) | $4.30 / $4.74 | 76.940% / 77.532% |
| Ascended Heroes | $22.0741 / $22.3407 (+1.21%) | $4.26 / $4.65 | 83.954% / 81.074% |

Rare jackpots lift averages considerably; medians and loss fractions show ordinary openings remain risky. These are owned raw values before selling-channel fees, not guaranteed payouts. Reports are `artifacts/card-pricing-pack-before.json`, `artifacts/card-pricing-pack-after.json`, `artifacts/card-pricing-all-events-before.json` and `artifacts/card-pricing-all-events-after.json`.

Generation fingerprints across 10,000 packs per set match before and after, including selected card IDs, physical conditions, misprints and special-pack states. Rarity counts match in paired simulations. Artwork/identity, pull weights, rare-event odds and pack prices also match. No physical opener or card artwork changes are included.

## Development commands

`npm run prices:check` verifies the checked-in table against its authoring policy. `npm run prices:audit -- --baseline artifacts/card-pricing-audit-before.json --output artifacts/card-pricing-audit-after.json` audits identity, diversity and unchanged generation. `npm run simulate:economy -- --packs 100000 --include-rare` exercises current production generation; `--baseline-prices` permits isolated old-price counterfactuals.

149 unit tests pass. The production browser regression checks walking to the binder/computer, raw/graded/misprint values, Collectr catalog and owned copies, eBay listing values and save/reload. The existing gameplay regression checks shop purchase, pack ripping, manual card swipes and persistence.

Both browser flows also pass against https://ripify.freebuff.app/. Deployment `kn72v89f` serves `main-Dbkyqmdb.js`, SHA-256 `873ddf9ec159ddcdd4994bd9d301da7ae3a12f9590e494b2373a465983c89efb`, matching the locally tested production build. Hosted regression output is `artifacts/card-pricing-hosted-tests.json`.
