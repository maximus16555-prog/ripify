# Slab cracking and physical damage polish

This update retains the existing confirmed 50/50 operation, owned instances, grading engine, valuation, provenance and population. Safe cracking now improves repairable condition as requested, superseding the earlier unchanged-condition rule.

## 1. Successful condition improvement

[Crack rules](../src/core/slab-cracking.ts) start from current saved condition and add 2–4 points to corners, edges and surface on success, bounded at 98. Existing permanent defects impose lower attribute ceilings. Scores already at their ceiling stay unchanged and are never lowered by success. Centering, print quality and manufacturing misprints remain unchanged. This is an intentional RIPIFY rule, not a claim that real slab removal repairs cards.

Each event stores before/after condition and exact improvement. The existing grader uses this current condition on resubmission. Identity, artwork, source and history remain intact.

## 2. Persistence and repeat protection

The existing [store transaction](../src/core/store.ts) writes the complete resulting raw-card state before live mutation, notification or animation. Failed writes preserve the original slab. Duplicate clicks cannot crack the resulting raw card, and an animation lock prevents sale/grading/display during removal. Reload and Escape retain the committed result.

[Validation](../src/core/slab-validation.ts) checks improvement deltas, snapshots, unchanged manufacturing attributes, unique events and the chain across attempts. Loading runs no repair or RNG. Legitimate repeat attempts after regrading start from current condition, stop at bounded ceilings and cannot regrow missing stock. Legacy safe events retain their historical unchanged condition.

## 3. Slab fracture

[SlabCrackPresentation](../src/game/slab-crack-presentation.ts) reuses holder materials and the focused camera. Tool pressure creates slight flex, branching cracks, a jagged detached corner, then broken-shell separation and withdrawal of the same raw card. The shell and label are physically split into irregular fragments. Failed removal shows a small plastic splinter contacting the saved damaged corner.

The 2.6-second sequence uses intact, stressed, initial-fracture, major-fracture and broken phases. Three cached original short plastic impulses trigger once at fracture thresholds, with quieter secondary snaps. Sources disconnect afterward. Controlled geometry avoids runtime destruction physics; temporary resources are disposed, and idle inspection remains on-demand. Pack sounds and interactions are unchanged.

Reference: [Poke Master Center's collector guide](https://www.pokemastercenter.com/crack/) informed the corner stress point and splinter contact. This is a reusable visual approximation rather than an exact simulation of every grader's holder.

## 4. Shared damage rendering

The [physical renderer](../src/game/physical-card.ts) uses one [saved outline](../src/assets/card-damage-shape.ts) for both faces and cardstock perimeter. [Damage geometry](../src/game/card-damage-geometry.ts) locally curls corners, raises crease ridges and indents pressure marks. Only damaged copies receive modest one-time triangle refinement. Front-relative coordinates mirror onto the back and remain the same inside later slabs and on stands.

Exact real front/back textures and UVs remain intact. Independently triangulated stock caps were removed because they exposed beige triangles through bent artwork. The actual front/back close the card and cast its shadow; stock exists along its thin perimeter.

## 5. Missing material

Missing corners clip the entire silhouette; chips notch the edge. These areas contain no front, back or cardstock geometry: the background is visible from either side. Matching thumbnails use the same polygon cutout. No white replacement artwork is generated. Position, size and severity come from persistent event parameters.

## 6. Different defects

- Missing corner: silhouette removed through both faces and thickness.
- Edge chip: small irregular notch and exposed stock boundary.
- Whitening: restrained stock-colored wear on outer edges, without a hole.
- Bent corner: localized geometry curl and faint fold line.
- Crease: raised fold geometry and restrained shading.
- Dent/pressure mark: shallow indentation with lighting response.
- Scratch: thin side-specific finish mark and local roughness change.

Failed attempts retain lower physical scores and the existing single 0.5 raw-basis factor per distinct failure, never based on the previous graded price. Misprints retain their exact defect and single 30× modifier. Prior grades, certification, subgrades and all-time population remain historical; current slab population decreases. Crack damage is separate from manufacturing defects.

## 7. Gameplay and validation

[Production scenarios](../tests/production/slab-cracking.spec.ts) walk to the binder, inspect a real card, cancel/confirm, observe stress/fracture, view raw front/back/angle, reload, and regrade. Both outcomes check real before/after scores. Refresh and Escape during failure cannot undo the result. Additional fixtures inspect naturally generated missing corners, creases, dents and scratches with exact reload persistence. Browser saves are isolated from the player.

[Geometry tests](../tests/physical-card.test.ts) raycast through cutouts from both directions and verify bent artwork never exposes an untextured stock cap. [Logic tests](../tests/slab-cracking.test.ts) cover identity, bounded repeated repair, legacy saves, misprints, pricing, population/history, locks, duplicate commits and storage failure.

The 200,000-attempt [simulation](../artifacts/slab-crack-simulation.json) returned 99,866 safe (49.933%), 100,134 damaged (50.067%), zero invariant violations and no real inventory awards.

Production build and **145 unit tests** pass. All **10 local gameplay scenarios** passed. The **five slab-specific scenarios also passed on the public domain**, including both outcomes, interrupted animations, regrading, exact save persistence, and front/back/angled inspection of generated defects. The safe fixture changed corners/edges/surface from 91/87/93 to 93/91/97; centering 90 and print 92 were unchanged. Failure reduced those repairable attributes to 56/63/65. Both sequences played exactly three fracture sounds at separate phase thresholds. See [local evidence](../artifacts/slab-polish-local.json) and [hosted slab evidence](../artifacts/slab-polish-hosted.json).

The hosted full-suite run found a pre-existing test race in the computer scenario: the test filled Trade Analyzer search before an earlier add-item action completed its requested animation-frame refresh. The test now waits for the added item to be visible before editing the new input. Computer application runtime code was not changed by this polish.

The corrected computer scenario passed its hosted recheck. Together with the nine other successful hosted scenarios, all ten have now passed on the public build. The original failure is retained in the [first-run report](../artifacts/slab-polish-hosted-playwright.json); the [recheck report](../artifacts/slab-polish-hosted-computer-recheck.json) and [combined evidence](../artifacts/slab-polish-hosted.json) document resolution rather than hiding it.

The update is served at [ripify.freebuff.app](https://ripify.freebuff.app/) by deployment `kn778rs8`. Hosted `main-DI2MYzVZ.js` has SHA256 `1c6b0e6546aef9b0e9086da8a04880489613e2e77e44608cab9f6f7de75e8da3`, identical to the tested local and cloud builds. Existing domain and save origin were retained. [Release audit](../artifacts/slab-polish-release.json) records unchanged protected systems.

## Changed files

- Core: [types](../src/core/types.ts), [rules](../src/core/slab-cracking.ts), [validation](../src/core/slab-validation.ts).
- Rendering: [outline](../src/assets/card-damage-shape.ts), [geometry](../src/game/card-damage-geometry.ts), [finish marks](../src/assets/crack-damage-presentation.ts), [thumbnails](../src/assets/cards.ts), [physical cards](../src/game/physical-card.ts).
- Presentation: [fracture](../src/game/slab-crack-presentation.ts), [inspector](../src/ui/card-inspector.ts), [UI callback](../src/ui/game-ui.ts), [audio](../src/game/audio.ts).
- Validation: the linked test files, [simulation source](../scripts/slab-crack-simulation.ts), reports and screenshots.

Store, economy calculations, population, card data, room, movement, pack ripping/swiping and rare-event odds were reused without modification.
