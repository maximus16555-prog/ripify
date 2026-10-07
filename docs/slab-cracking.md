# Slab cracking

Inspect an owned graded card, choose **Crack slab**, then confirm. Cancel is focused initially. Each committed attempt has an independent 50% safe / 50% damaged outcome, regardless of printing, price, misprint, condition or grader. Displayed cards are removed from their stand in the same transaction.

## Transaction and identity

[GameStore](../src/core/store.ts) checks ownership and grading/listing/trade/transfer/animation locks, rolls once using a crypto-generated seed, creates the result, and writes the entire next save **before** mutating live state or showing animation. Failed writes preserve the original slab and inventory. Successful writes retain the owned UID and object, printing, source, acquisition history, favorite, finish and manufacturing misprint. They change current status to raw and archive the prior grader, grade, certification, result, seed and condition snapshots in `crackHistory`.

There is no pending RNG at animation completion. Close, Escape or reload can skip the visual sequence; the saved raw card and outcome already exist. A second click cannot crack a raw card. A short session lock prevents selling, grading or displaying during animation and is released on close/completion. After reload the operation is already resolved. No replacement inventory copy is generated.

## Condition, rendering and value

[Slab cracking](../src/core/slab-cracking.ts) leaves every condition attribute identical on safe attempts. Failed attempts reduce corners, edges and surface, preserving centering and print quality. Persistent front-relative damage coordinates describe a bent corner, edge chip, and side-specific scratch or crease. [Damage presentation](../src/assets/crack-damage-presentation.ts) adds these marks to the exact source artwork without replacing it. The shared [physical card renderer](../src/game/physical-card.ts) also bends the same physical corner and mirrors its location on the back. The same damage remains inside later slabs and on display stands. Binder thumbnails also retain damage overlays.

Each distinct failed event applies one 0.5 factor to the **raw basis**, never to a previous graded price. Current raw pricing resolves the existing authoritative printing value, applies the existing misprint multiplier once (if any), and applies saved crack factors. Existing condition/grade valuation follows afterward. Normal raw wear can therefore cause slightly more than a 50% final market-value loss. Saving, rotating or inspecting never applies the factor again. A separate legitimate failed attempt after regrading applies a further half-value factor. Seven fixed Ascended Heroes base values remain unchanged.

Misprints retain their original type, parameters, provenance and single 30× modifier. Crack damage is post-production damage, never a new misprint. Subsequent grading uses the actual saved condition and existing grading interpretation.

## Physical sequence

[SlabCrackPresentation](../src/game/slab-crack-presentation.ts) separates front/rear plastic shells around a controlled pry pivot, moves them aside, and draws the committed raw copy out of the shell. It uses the existing physical-card materials and focused inspection camera, a short original plastic snap, and two seconds of animation rather than fracture simulation. Raw artwork is decoded before withdrawal. Temporary geometry, textures, sources, frames and listeners are disposed; idle inspection remains on-demand rendering. Pack ripping/swiping, sounds, data and rare-event odds were not changed.

## History, population and locks

Inspection exposes prior grades/cracks and small **RIPIFY simulated** population counts. The ledger counts distinct owned UIDs per printing/grader/grade. Cracking reduces current population; all-time population survives sale and repeated same-copy/same-grade regrading without double-counting. Existing retained grading history is backfilled on save load. Grades of cards sold before this ledger existed cannot be reconstructed. Counts are local simulated copies, not global or real grading-company statistics.

This checkout has no functioning eBay/trade/transfer subsystem. The shared guard supports explicit ownership locks for those future systems; no fake marketplace interface was added. Existing grading orders and active cracking are enforced immediately.

## Validation

- 16 new unit cases cover safe/failure, identity, exact condition, value basis, fixed chase odds, misprints/regrading, population/sale persistence, lock types, write failure, duplicate commits, reload safety, corruption rejection, persistent geometry and shell separation.
- Production browser tests exercise real walking to the binder, confirmation/cancel, both physical results, front/back view, regrading, display removal, and refresh during animation using isolated saves.
- `npm run simulate:slab-cracks` performs 200,000 attempts without touching player inventory: **99,866 safe (49.933%)**, **100,134 damaged (50.067%)**, **zero invariant violations**. The result is 0.60 standard deviations from the expected 50/50 split.

See [simulation report](../artifacts/slab-crack-simulation.json) and [automated tests](../tests/slab-cracking.test.ts).
