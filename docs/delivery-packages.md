# Physical delivery packages

Pokémon Store orders keep their existing checkout, currency deduction and delivery time. When due, each order creates one shipping package referencing its already-created sealed products/packs. Nothing enters usable inventory until **Take contents** durably claims that package. Grading returns due together are grouped by grader, reference the original owned-card IDs and precomputed results, and remain transaction-locked until collected.

Walk to the packages by the bedroom door. Point at a particular box and press **E — Open Package**. Pull tape right, lift flaps upward, then lift the contents out. Buttons offer the same actions. Right-drag or use the orbit arrows to inspect the box. Small/cancelled gestures return smoothly. Escape leaves the package waiting; saved tape/flap progress resumes at the completed stage.

The hollow box has corrugated cardboard walls, four hinged flaps, a center tape strip and a shipping label. Exact purchased sealed products and the shared physical slab renderer appear inside. Neutral packing inserts support smaller products; viewing or lifting contents never generates cards or opens a contained booster.

Stacks sort by supporting footprint, permit four boxes and 1.8 m maximum height, and fill nine floor positions. Overflow remains in a persistent queue and automatically fills cleared positions. A contextual notice reports queued packages. Removing a bottom/middle/top box smoothly settles the remaining controlled placements; unrestricted physics is not used.

## Persistence and performance

The optional `shippingPackages` save extension stores package identity, source order references, exact item IDs, dimensions, arrival/stack order and opening/claim state. Existing saves remain valid. Previously delivered legacy orders are not delivered again. Stage transitions and final fulfillment use the existing atomic save commit; failed writes leave inventory unchanged. Claimed records prevent double collection after refresh or repeated input.

The waiting pile uses five instanced draws and two shared label textures, without loading product/card content textures in the room. Focused opening borrows the existing parked container renderer, stops rendering when idle, and disposes its geometry, materials, images, shadows, handlers and observer on exit.

## Supporting artwork repair

The external exact-card host returned duplicate CORS headers to WebGL image requests. Ordinary DOM images worked while graded 3D cards showed unavailable fronts. Exact pinned scans are now served from a checksum-verified same-origin disk cache, unchanged byte for byte. This does **not** preload the set at runtime; the existing current-pack/visible-card cache remains in control. No artwork, identity, pricing, generation or rarity changes are made.

## Verification

Unit checks cover exact fulfillment, grading locks/results/history/population, failed saves, staged reloads, duplicate claims, old saves, dimensions, supported stack placement, bottom/middle/top removal and overflow backfill. Production browser flows exercise mixed orders, partial opening/reload, exact returned slabs, physical targeting, all five computer apps, idle rendering, and the existing manual pack opener. Screenshots and browser results are saved in `artifacts/`.
