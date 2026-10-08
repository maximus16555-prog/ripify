# Card-edge artifact fix

The shared rendering added pale areas independently of the source artwork:

- `drawPrintedFace` filled every canvas with pale cardstock before drawing the source image. Real TCGdex images have transparent rounded corners; this filled those corners, including on condition-100 copies.
- The physical renderer generated pale edge/corner wear and scratches from numerical condition scores without any saved defect. Ordinary pack-fresh copies therefore acquired invented marks.
- HTML card containers used pale backgrounds behind transparent image corners and contain-fit gaps; old rarity styles could also leak into real-card backgrounds.

Only displaced, saved misprints now receive exposed-stock fill. Card faces retain the original image alpha and use transparent materials with a small alpha test. Automatic procedural wear was removed from the physical renderer. Real HTML artwork containers are transparent, with enough selector specificity to override obsolete rarity backgrounds. Missing-image notices and slab bodies retain their own materials/backgrounds. Existing saved crack damage, cut geometry, manufacturing defects, front/back mappings, cardstock edges, slabs, and holo materials remain in place. No source images, UV mapping, image sizing, card values, condition data, or gameplay rules changed.

## Verification

- Production build passed; all 145 logic tests passed.
- Four real printings (Grass Energy, Bulbasaur, Charizard ex, Charizard ex SIR), three condition scores (100/87/63), front and back: **24 pixel comparisons** against the original image at the existing texture resolution.
- Before: **36,845 changed pixels**, including **9,439 top/bottom edge pixels** across those comparisons.
- After: **zero changed pixels**, zero altered original white pixels, and zero altered alpha pixels. The audit includes 141,174 legitimate white-pixel observations and 11,088 transparent-pixel observations.
- Saved back-only whitening still affects the saved edge region, leaves the front untouched, and renders identically after serialization/reload. Holo finish remains enabled. GPU canvas stroke compositing may round unrelated channels by one byte; the damaged-copy test permits that quantization, while undamaged copies require exact equality.
- Actual production gameplay: walked to binder, inspected energy/common/ex/SIR/raw/slab fronts, backs and angles, then reloaded. Same cards and display references persisted; no page errors.
- Existing gameplay regressions passed for purchasing, ripping, manual swiping, collection and refresh, plus saved missing-corner/crease/dent/scratch rendering from both sides and angles.

Pixel evidence is in `artifacts/card-artifact-before.json` and `artifacts/card-artifact-after.json`; clean physical previews are `artifacts/clean-edge-audit-*-*.png`.
