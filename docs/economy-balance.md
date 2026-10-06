# Pack economy balance - 2026-10-05

Only economy configuration and pack weighting changed. Ripping, swiping, animations, camera, card images, printed metadata, real set pools, inventory transactions, condition generation, grading rules, and saved opening contents are preserved.

## Measured results

English Scarlet & Violet-151 is the only supported playable booster set. Each before/after run opens **100,000 virtual packs**, with the same seed (`1512026`), generator, and valuation functions. Simulation never instantiates player storage or grants items.

| Metric | Before | After |
|---|---:|---:|
| Pack price | 8.0000 | 8.0000 |
| Mean owned raw value | 7.1873 | 7.4993 |
| Median owned raw value | 4.0300 | 4.2700 |
| Mean raw recovery (%) | 89.8414 | 93.7407 |
| Strictly losing packs (%) | 83.2140 | 78.7990 |
| Loss (<90%) (%) | 74.1970 | 70.9710 |
| Approximately even (90-110%) (%) | 12.8750 | 14.7290 |
| Modest profit (>110%, <200%) (%) | 4.3870 | 5.3580 |
| Strong profit (>=200%) (%) | 8.5410 | 8.9420 |
| Any SIR/Hyper chase (%) | 1.9430 | 1.9430 |
| Individual card worth >=50 (%) | 1.5390 | 1.5390 |
| Charizard ex #199 (%) | 0.2190 | 0.2190 |

Strict loss overlaps the outcome buckets: a pack returning 95% is approximately even but still strictly loses money. Strong profit means at least twice pack cost; it does not necessarily mean a chase printing.

**151 recovery is 93.74%, above the initial 75-90% tuning range.** The baseline already recovered 89.84% on average, but its median was only 4.03 coins. Raising pack prices to offset the modest value/pull improvements removed much of the benefit for repeat opening. This pass therefore keeps boosters at 8 coins and accepts a conservative exception for the current chase-heavy pool. Expected loss falls from **0.8127 to 0.5007 coins per pack**, about 38.4% less currency drain. Losing packs still make up 78.8% of openings; there is no payout guarantee, pity counter, or jackpot guarantee.

The after mean's 95% Monte Carlo interval is 7.4425-7.5560 coins. An independent condition-sum/market-phase audit estimates mean raw value at 7.4786, with expected return 7.0642-7.8930 across 256 market phases. Even the strongest sampled market phase remains below the 8-coin purchase price. This concerns raw returns, not speculative grading profit.

## Central configuration

[Balance configuration](../src/data/balance.ts) is the single source for simulated definition values, set slot weights, and product/channel prices. These are game coins and simulated odds, not real market quotes or official factory odds.

| Rarity | Old base value | New base value |
|---|---:|---:|
| Common | 0.20 | 0.22 |
| Uncommon | 0.40 | 0.41 |
| Rare | 1.00 | 1.05 |
| Double rare | 5.00 | 5.10 |
| Ultra Rare | 12.00 | 12.10 |
| Illustration rare | 18.00 | 18.10 |
| Special illustration rare | 65.00 | 65.00 |
| Hyper rare | 30.00 | 30.00 |

Basic Energy uses the Common value. Promo fallback remains 0.15. No card IDs, names, art, or actual product contents were invented or changed. Values remain rarity-based; per-printing market prices are not introduced.

| Slot | Old configured chance | New configured chance | Observed pack frequency before -> after |
|---|---:|---:|---:|
| Final Double rare | 18.0% | 18.8% | 17.949% -> 18.740% |
| Final Ultra Rare | 4.6% | 4.8% | 4.653% -> 4.848% |
| Reverse upgrade Illustration rare | 6.5% | 6.7% | 6.454% -> 6.638% |
| Reverse upgrade Special illustration rare | 1.5% | 1.5% | 1.539% -> 1.539% |
| Final Hyper rare | 0.4% | 0.4% | 0.408% -> 0.408% |

The final normal Rare slot decreases from 77% to 76%; ordinary second reverse decreases from 92% to 91.8%. Every pack still has one Basic Energy, four Commons, three Uncommons, two reverse/upgrade slots, and one holo-or-better final card. Only that pack's verified English 151 pool is used, plus the existing Basic Energy pool.

God packs and misprints are not currently implemented. No rates or new special-event systems were added. Condition outcomes match the old generator exactly across 256 seeds (2,816 physical copies). Rarity/value never biases condition, and the grading calculation, costs, and multipliers are unchanged.

## Sealed-product pricing

The audit found an existing raw-value exploit in the UPC: its 16 packs plus fixed promos averaged about 144 coins while it cost only 110. Raising ordinary card values without correcting this would make it worse. Prices now cover verified pack and promo contents; the manifests and physical box-opening flow are untouched.

| Product | Physical price before -> after | Expected raw contents before -> after | Physical recovery before -> after |
|---|---:|---:|---:|
| 151-booster | 8.00 -> 8.00 | 7.19 -> 7.50 | 89.84% -> 93.74% |
| 151-etb | 65.00 -> 78.00 | 64.83 -> 67.64 | 99.74% -> 86.71% |
| 151-upc | 110.00 -> 170.00 | 144.05 -> 149.04 | 130.95% -> 87.67% |

Box expected values use the measured pack mean x verified pack count, plus 4,096 simulated fixed-promo condition samples. They are expected contents values, not per-box guaranteed payouts. ETBs still resolve nine unopened packs plus Snorlax #051; UPCs still resolve sixteen unopened packs plus their three exact fixed promos.

Configured future online prices are 7.95 / 74 / 162 coins (previously 6 / 55 / 95). These preserve a cheaper online channel without a known positive expected raw-return loop. Online drops are not currently playable. Physical shop purchase and selling transactions use the centralized values. Starting currency is unchanged; the UPC is now a progression purchase.

## Selling and saving

Metrics use **owned raw value**: definition price x existing market fluctuation x persistent physical-condition discount, with the actual cent rounding. Reference value before the condition discount is also recorded (mean 7.5017 -> 7.8258). No grading premium or selling-channel fee enters these raw metrics.

The existing instant Sell action currently pays 100% of owned value. Separate Quick Sell, NPC dealer, eBay and player trading channels are not implemented. This pass preserves that behavior rather than inventing fees or claiming those channels exist. Their eventual payout hierarchy should be applied after valuation and balanced separately.

Existing owned cards are modestly revalued through the shared definitions. Their unique IDs, condition, grade, and history remain intact. Existing in-progress openings keep their persisted cards and index; unopened packs use the tuned weights when contents are first generated. No saves are reset or outcomes rerolled.

## Reproduce

```sh
npm run simulate:economy -- --packs 100000 --seed 1512026 --baseline artifacts/economy-before.json --output artifacts/economy-after.json
npm test
npm run build
```

On restricted Windows PowerShell use `npm.cmd`. The development CLI supports 1,000-1,000,000 packs, alternate seeds, and `--explore` for isolated candidate comparisons. It loads the actual game modules through Vite without launching a browser or constructing a GameStore. It records mean, median, percentiles, loss/profit buckets, rarity/chase frequency, confidence intervals, condition averages, and boxed-product expected value. Only current-pack generation is simulated; no card textures are loaded.

[Before results](../artifacts/economy-before.json) -> [After results and comparison](../artifacts/economy-after.json) -> [Candidate exploration](../artifacts/economy-candidates.json) -> [Preserved-system hash check](../artifacts/economy-scope-check.json)

## Validation

- Production TypeScript/Vite build passes.
- 55 logic tests pass, including normalization, protected chase rates, moderate value changes, exact baseline condition outcomes, purchase debit/persistence, and a 20,000-pack economy regression.
- Five targeted browser regressions pass: room/opening/Escape/reload, physical shop purchase/return, sealed ETB/manual contents, progressive horizontal tear, and next-card-underneath/manual swipe. The existing interaction and camera sources also match their pre-balance SHA-256 hashes.

## Later rare-event implementation

The historical figures above describe ordinary version-1 generation. The requested independent misprint/special events are now implemented separately; see [rare-event-inclusive measurements](rare-events.md) for their economic impact. The ordinary weights and prices were preserved.
