# Shop packs and development shortcuts

Completed October 6, 2026. Scope: the existing physical shop, pack inventory, and development keyboard integration. The booster opening presentation, gestures, camera, audio, and image preloader were preserved.

## Root causes

- **151:** This checkout already contained the 151 catalog entry and purchase action. I could not substantiate a missing 151 definition. Its actual shelf purchase → inventory → home desk → reveal path is now explicitly covered by a browser test.
- **Ascended Heroes:** There was no product, card pool, supported generation branch, or special-pack rule in this checkout. Adding only a shop button would have led to “Unsupported booster.” The missing supporting set and generation/save support were added.
- **Shortcuts:** The single global input listener handled Ctrl+Shift+X, movement, E and Escape, but had no Digit1/Digit2 handlers. There was no hidden debug flag to enable. The callbacks originally used Vite's development-build flag, which stripped them from hosted gameplay. The follow-up fix removes that gate while preserving text-editing guards and repeat suppression. No second keyboard listener was introduced.
- The shop placed each catalog entry at `-3.8 + index × 3.6`. A fourth entry would have put a rack at x=7, outside the room. Both booster sets now share the existing left rack, each with its own pack artwork, sign, price and purchase prompt. ETB/UPC rack positions are retained. The counter also lists both products reliably; there is no rotating-stock system in this checkout.

## Playable results

| Path | Result |
| --- | --- |
| Shop: 151 | 8 coins deducted once; one `151-booster` unopened instance, set `sv03.5`; real 151 cards plus Basic Energy |
| Shop: Ascended Heroes | 9.5 coins deducted once; one `ascended-heroes-booster` unopened instance, set `me02.5`; real Ascended Heroes cards plus Basic Energy |
| Ctrl+Shift+1, development | Exactly one ordinary-looking sealed 151 pack, with persisted `english-151-demigod` decision; the last three cards are one verified starter IR/IR/SIR evolution line |
| Ctrl+Shift+2, development | Exactly one ordinary-looking sealed Ascended Heroes pack, with persisted `ascended-heroes-god` decision; three Mega Attack Rares and seven Special Illustration Rares, plus Basic Energy |
| Production shortcuts | Same hidden per-instance special pack grants as development; general development debug surface remains absent |

The per-instance override selects the special decision directly. It does not search for a lucky seed, grant cards, auto-open, or change global odds. The ordinary generator subsequently resolves the saved instance. Full-pack misprints retain their independent seed-based decision; individual misprints use the existing per-card streams. Forced development packs are excluded from natural rare-event population statistics. No special labels appear on the sealed wrapper or pack picker.

Ascended Heroes has all 295 real English definitions, stable `me02.5-NNN` IDs, printed metadata and exact numbered scans. Seven known TCGdex rarity errors (#265–271) are corrected to MAR with source metadata retained. Verification links and artwork provenance are recorded in [artwork-sources.md](artwork-sources.md). The new set uses configurable simulated ordinary slot weights and prices; existing 151 weights, values and prices are unchanged. Natural rare-event odds remain 1/1500, 1/2000 and 1/500.

## Verification

- `npm.cmd run build`: passed, including strict TypeScript. Vite's existing bundle-size advisory remains.
- `npm.cmd test`: **96 tests passed**. Includes all Ascended Heroes definition/image mappings and generation paths, 5,000 generated packs without duplicate IDs or cross-set pulls, purchases, forced outcomes, save/reload, independence, and full-misprint god-pack persistence.
- `npx.cmd playwright test tests/browser/shop-shortcuts.spec.ts --workers=1`: **4 browser tests passed**. Actual WASD travel through the shop door, both shelf prompts, buying, wallet deductions, unopened inventory, walking home, physical ripping, all eleven manual reveals, collecting, and reload. Both shortcuts are exercised with real browser keyboard events, including held repeat events, multiple intentional presses, wrong modifiers, focused menu buttons, and ignored text editing. Forced outcomes and generated cards survive reloads before opening and during an opening. Exact artwork is checked on every revealed card; runtime errors are checked.
- Existing opening-polish, rare-events, and currency-bonus browser suites using hardware WebGL: **10 tests passed**. Covers both tear directions, slow/fast/partial tearing, cancelled swipes, stable underlying cards, smaller desktop layout, active-pack-only preload, existing currency shortcut, natural combined events, condition persistence, grading/slabs/display/reload.
- `node scripts/check-production-shortcuts.mjs` against the actual production preview: passed. [Machine-readable result](../artifacts/production-shortcuts-check.json).

Visual evidence: [151 shop reveal](../artifacts/shop-151-booster-reveal.png), [Ascended Heroes shop reveal](../artifacts/shop-ascended-heroes-booster-reveal.png), [151 shortcut reveal](../artifacts/shortcut-151-reveal.png), [Ascended Heroes shortcut reveal](../artifacts/shortcut-ascended-reveal.png).

The initial route tests exposed test-path collisions with the existing crate and overly narrow door approach. The harness was corrected to walk around the furniture and approach the door directly. No room collision or player controls were altered to make tests pass. A rerun after source changes settled passed all four integration tests.

## Changed files

- Input wiring: [main.ts](../src/main.ts), [input.ts](../src/game/input.ts), [test-packs.ts](../src/dev/test-packs.ts).
- Physical shop: [world.ts](../src/game/world.ts).
- Inventory and generation: [store.ts](../src/core/store.ts), [types.ts](../src/core/types.ts), [packs.ts](../src/core/packs.ts), [pack-pools.ts](../src/core/pack-pools.ts), [rare-events.ts](../src/core/rare-events.ts).
- Persistence validation: [save.ts](../src/core/save.ts), [rare-event-validation.ts](../src/core/rare-event-validation.ts).
- Catalog: [cards.ts](../src/data/cards.ts), [products.ts](../src/data/products.ts), [balance.ts](../src/data/balance.ts), [ascended-heroes.json](../src/data/verified/ascended-heroes.json), [artwork.json](../src/data/verified/artwork.json), [booster packaging](../public/artwork/ascended-heroes-booster.jpg).
- Reproducible import/audit tools: [import-ascended.py](../scripts/import-ascended.py), [cache-artwork.py](../scripts/cache-artwork.py), [economy-simulation.ts](../scripts/economy-simulation.ts), [check-production-shortcuts.mjs](../scripts/check-production-shortcuts.mjs). The economy simulator now recognizes MAR and Mega Hyper Rare in the new set's market envelope.
- Tests: [shop-integration.test.ts](../tests/shop-integration.test.ts), [shop-shortcuts.spec.ts](../tests/browser/shop-shortcuts.spec.ts), [rare-events.test.ts](../tests/rare-events.test.ts) (type narrowing for the extended event union).
- Documentation: [artwork-sources.md](artwork-sources.md), this report.

The development game is available at http://127.0.0.1:5173 while the dev server is running. Ctrl+Shift+1/2 now also work in production preview and the public hosted game. This supersedes the original development-only requirement at the user's request.

## Hosted shortcut fix

The Vite DEV gate was the cause of both shortcuts doing nothing after publication. The existing single input listener and generator are retained; the pack factory is now included and connected in production. The production browser test presses both shortcuts, checks held repeats and subsequent intentional presses, verifies normal-looking unopened inventory, survives reload before and during opening, physically rips both packs, manually reveals all cards, verifies exact special compositions and artwork, and collects the same instances. Forced outcomes remain excluded from natural population statistics. All 109 unit tests and the production-build shortcut test pass.
