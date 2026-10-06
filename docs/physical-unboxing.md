# Physical container unboxing and rare-event audit

The ETB/UPC presentation now uses real Three.js geometry. The old CSS lid, side, photo tray, and icon-count content presentation were removed. The booster-pack opener is unchanged.

## Construction and interaction

- The standard English 151 ETB has an open-ended printed sleeve, an independent lift-off lid with walls, an open tray, nine individually modeled sealed packs, and the exact Snorlax SVP #051 promo preview.
- The English 151 UPC has a fixed rear hinge, a separate cover, a lined three-section tray, two banks of eight individually modeled sealed packs, and the exact three promo definitions retained inside the lid. It does not use an ETB lift-off lid or a drawer animation.
- Primary drag raycasts the actual active packaging. Movement controls progress; short/cancelled drags settle back. Right-drag, arrow keys, and view buttons rotate the camera. Accessible action buttons animate the same physical components.
- Removed pieces remain on the desk. The lid first clears the ETB rim before moving aside. Contents lift over the front wall before coming forward. Pack artwork retains its exact source aspect ratio: ETB packs stand upright, while the UPC has enough depth for two flat banks.
- Cardboard has thickness, restrained bevels, separate inner liners, rim seams, rough material, and scalable contact shadows. Pack crimps are instanced.
- Only successful completed lid/removal gestures call the existing store operations. The whole verified manifest is fulfilled atomically once, with contained booster packs remaining unopened. Escape and reload retain the existing saved sealed/contents state. Presentation-only promo previews are never added to inventory.

## Assets and honest limitations

Existing verified local retail photos are reused. Projective UV coordinates rectify the specific photographed face onto one physical surface, rather than putting the entire oblique photo on every face. On the UPC, a second UV region selects the visible narrow side. The ETB inner-box surfaces remain neutral because the retail sleeve photograph does not verify their artwork. Unknown faces and inner packaging use neutral cardboard; no Pokémon packaging art was generated. The UPC broad printed face is on its exterior lid, not stretched around thin box sides.

The paper Snorlax, Mewtwo and Mew promos use the existing two-sided card renderer. The exact metal Mew scan remains unavailable: its existing physical missing-image state and a concise notice are retained, rather than substituting the paper printing. No shrink-wrap simulation or deep accessory gameplay was added.

Construction references: the existing verified product sources in the product catalog and the inspected open-UPC reference photograph. The new model profiles affect presentation only, not product identity or contents. Model dimensions are coherent visual proportions rather than claims of measured manufacturing dimensions.

## Audit findings

Generation uses independent fixed streams for the 1/500 individual, 1/2,000 full-pack, and 1/1,500 eligible special events. Individual rolls remain available inside special packs, and full-pack events apply one shared production incident. Promos are outside these pack rolls.

Valuation applies exactly one 30× modifier to the saved raw base adjusted by the existing simulated market, then normal grade/grader factors. It does not multiply an already graded price or mutate the saved condition. The same stored manufacturing defect is used by raw cards and slabs, with separate fronts, backs, edges and labels.

Pack events, generated copies, receipts, defects, source IDs and grading history survive validation/save reload. The physical unboxing changes do not alter any of those systems. SHA-256 preservation results are in [unboxing-preservation-check.json](../artifacts/unboxing-preservation-check.json).

## Simulation

The existing actual-code simulation was rerun: 100,000 complete packs (1.1 million generated copies), plus 10 million event-stage pack rolls (109,945,143 eligible individual-card trials). No player inventory receives simulation items.

| Event | Observed | Configured |
| --- | --- | --- |
| Individual misprint | 1/500.89 | 1/500 |
| Full misprint pack | 1/2,005.21 | 1/2,000 |
| Eligible special pack | 1/1,517.45 | 1/1,500 |
| Combined special + full | 5 in 10 million | 1/3 million |

The combined sample has only 3.33 expected hits; five is within one standard deviation. Each combined witness was passed through real generation and save validation. Duplicate IDs, instance duplication, invalid set mappings/composition, compounded modifiers and persistence failures: all zero. Full results: [rare-events-simulation.json](../artifacts/rare-events-simulation.json).

At market seed/time zero, mean raw value is 7.85 coins without rare events and 8.48 including them, against an 8-coin pack; median 4.84. Current rare-event-inclusive mean recovery is 106.05%, while 79.72% of individual packs still lose raw value. This is an existing balance consequence of the requested rare bonuses, not a new adjustment in this presentation task. Selling-channel differences are not implemented in this checkout; no unsupported payout claims are made.

## Resource usage

The local preview renders on input, asset readiness, resize, and finite settling animations. There is no idle preview render loop. One reusable WebGL context is retained, with no product model/texture retained after close. Listeners, ResizeObserver, RAF, shadow targets, instanced attributes, geometries, materials, local textures, and pending packaging-image handlers/timers are cleaned up. Only this product's packaging and promo artwork are requested.


## Completed validation

- Production build/type-check passed. Vite retains the existing large-bundle size warning.
- 101 unit tests passed, including projective surface coordinates, exact pack-art aspect ratios, manifest preview counts/IDs, UPC hinge/8+8 banks, and ETB rim/removal clearance.
- 26 distinct browser checks passed across targeted runs: local artwork, gameplay/shop purchases, real product fulfillment, manual progressive ripping, one-action card-stack swipes/preloading, raw/slab rotations, display replacement/removal/reload, rare-event discovery/grading, and the new physical unboxing scenarios.
- The display browser route was corrected to approach through open floor and stop before the desk furniture; a reload readiness race in the gameplay test was also fixed. Neither change alters game controls/collision.
- New unboxing checks cover drag cancellation, saved contents-stage recovery, atomic fulfillment with no automatically opened packs, repeated action input, honest missing-art fallback, keeping products sealed, idle render stability, and bounded draw calls.
- Visually reviewed sealed/open products, removed pieces, side/rear views, and both desktop sizes. Screenshots: [ETB](../artifacts/3d-etb-open.png), [UPC](../artifacts/3d-upc-open.png), [small ETB](../artifacts/3d-etb-small.png), [small UPC](../artifacts/3d-upc-small.png).
- All twelve protected gameplay/data/renderer files match their pre-task SHA-256 hashes. Inventory, values, rare generation, save validation, product manifests, physical card renderer, and booster opening logic/CSS were not modified.

Changed implementation: [construction profiles](../src/data/container-models.ts), [physical models](../src/game/physical-container.ts), [preview/input lifecycle](../src/ui/container-view.ts), [unboxing UI](../src/ui/container-opening.ts), [unboxing CSS](../src/ui/container-opening.css), [obsolete CSS cleanup](../src/ui/catalog.css), and [shared UI cleanup](../src/ui/game-ui.ts). Tests and README were updated to describe/validate the actual 3D flow.
