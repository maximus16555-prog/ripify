# Price-sensitive simulated eBay buyers

Previously, asking price affected the buyer's outcome, but all listings waited 96–144 in-game minutes regardless of discount or demand.

[Buyer tuning](../src/core/ebay-buyers.ts) now uses the rounded asking price divided by the authoritative owned-item market value at listing creation. Sale probability decreases with that ratio; waiting time increases with it. Exact-card collector demand is derived from existing authored per-printing prices relative to their rarity tier and bounded to 0.7–1.3. These prices already encode collector preferences and printing demand. Misprint and grading multipliers do not create a separate demand boost or price table.

Random variation remains, sale probability is capped at 96%, and buyer resolution takes at least 24 in-game minutes (up to 480). Offers remain optional decisions, not automatic sales. Watcher and offer milestones scale with the listing's waiting period, so discounted listings can attract attention sooner and offers arrive before expiration.

[Listing creation and advancement](../src/core/computer.ts) roll once and persist outcome, market snapshot, due time, watcher time and offer time before exposing a listing. No buyer rolls run per frame or on reload. Existing listings without the new optional milestones retain their original saved outcome/due time and legacy 15/60-minute attention milestones. [Save validation](../src/core/computer-state.ts) checks new milestone ordering without requiring old saves to contain them. Existing settlement, ownership locks, payments, prices, card condition, inventory and sale history remain unchanged.

## Simulation

[Development simulation](../scripts/simulate-ebay-buyers.mjs): 100,000 isolated buyers at each of six asking prices; 600,000 total; no player inventory or save access. [Full results](../artifacts/ebay-buyer-simulation.json). Neutral demand, $22 market value:

| Asking price | Sale | Offer | Unsold | Average resolution, in-game minutes |
| --- | ---: | ---: | ---: | ---: |
| $19.50 | 93.43% | 5.27% | 1.30% | 87.75 |
| $22.00 | 78.08% | 15.91% | 6.01% | 120.08 |
| $25.00 | 64.28% | 16.16% | 19.56% | 167.42 |
| $44.00 | 27.51% | 0% | 72.49% | 480.00 |

The old mean wait was 120 minutes at every price. Waiting figures include all buyer outcomes; these are simulated game statistics, not real eBay demand or market claims.

## Verification

- Build/type check and 178 unit tests pass, including monotonic discount behavior, bounded demand, 400,000 statistical draws, no guaranteed sale, minimum wait, legacy save compatibility, offer timing and exactly-once settlement.
- [Playable regression](../tests/production/ebay-discounts.spec.ts) creates three listings through the in-game computer with identical seeded buyers and different asking prices. It confirms shorter discounted schedules, earlier attention, discounted sale first, exact ownership transfer/payout, and persisted decisions through reload.
- [Existing selling/deletion regression](../tests/production/ebay-only-selling.spec.ts) preserves old sale history and locked listings, creates a new listing, accepts an offer, deletes one card and 55 bulk cards with no payout, and checks reload.
