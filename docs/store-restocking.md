# Scheduled Pokemon Store restocking

## Root causes

The daily drop already occurred, but deterministic NPC demand exhausted small batches within approximately 4–9 real minutes at the default clock speed. A complete game day lasts 48 real minutes. Stock also became unavailable at midnight, even if some remained, because both the shop-open check and purchase ledger used the calendar date instead of the latest 9:30 AM drop. The product-detail and cart screens did not poll availability. Finally, visible frames taking longer than one second lost elapsed game time, delaying the schedule.

## Targeted changes

- [Commerce configuration and schedule](../src/core/computer.ts) retains one finite drop each day at 9:30 AM. Inventory and purchases now belong to the latest drop, with unsold items remaining purchasable through midnight until the next drop replaces the batch. Existing ledger keys are compatible; no save migration or offline time advancement was added.
- Batches are 64 151 boosters, 48 Ascended Heroes boosters, 18 151 ETBs and 10 151 UPCs. NPC demand remains deterministic, product-specific and finite: demand rates are respectively 0.045, 0.04, 0.013 and 0.008 units per game minute, with the existing seeded variation. Purchases still reduce actual stock and checkout cannot oversell.
- Visible elapsed time is no longer capped at one second. Crossing a scheduled drop immediately persists the clock. Reloading preserves the current batch's purchase ledger and demand rather than replenishing it again.
- [Store views](../src/ui/computer-apps.ts) display the next drop and disable checkout when demand has exhausted a cart item. [Desktop polling](../src/ui/computer-desktop.ts) updates catalog/detail/cart availability in place, retaining product image DOM nodes and decoded artwork. Existing order/status polling remains; hidden apps do not poll their contents.
- Prices, products, contents, order/delivery timing, grading calculations, card generation, rare-event odds and the pack opener are unchanged.

## Deterministic demand comparison

[The isolated simulation](../scripts/simulate-restocks.mjs) evaluates 1,000 market seeds across each minute of a full drop cycle. It uses the actual new stock calculation and reproduces the old one for comparison. It does not access player saves or award items. These numbers exclude player purchases; buying products will shorten availability.

| Product | Batch before → after | Available portion of cycle before → after | Real minutes available before → after |
| --- | ---: | ---: | ---: |
| 151 booster | 35 → 64 | 19.01% → 95.03% | 9.12 → 45.62 |
| 151 ETB | 12 → 18 | 15.37% → 93.58% | 7.38 → 44.92 |
| 151 UPC | 6 → 10 | 12.83% → 87.30% | 6.16 → 41.91 |
| Ascended Heroes booster | 24 → 48 | 8.48% → 84.32% | 4.07 → 40.47 |

Run `node scripts/simulate-restocks.mjs`. [Full simulation data](../artifacts/store-restock-simulation.json).

## Verification

[Logic regressions](../tests/store-restock.test.ts) cover eight successive daily boundaries, midnight carryover, morning purchases charged to the prior drop, immediate boundary persistence, slow frames, reload without replenishment, finite stock, overselling prevention, deterministic demand, existing ledger compatibility and skipped cycles without stock accumulation.

[Gameplay regressions](../tests/production/store-restock.spec.ts) walk from the bedroom to the actual computer using keyboard input. They wait on an already-open sold-out product page for the next drop, verify all four products replenish, purchase via cart/checkout, and reload to confirm the same order, currency and purchase ledger. They also buy across midnight and verify a cart disables after NPC sellout and re-enables at the next drop. Product artwork must load and retain its same DOM node through the drop. Separate existing computer and Grading-image regressions guard delivery, grading, listings, locks, app lifecycle and stable card previews.
