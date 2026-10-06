# Physical card rendering

Room display stands and card inspection use [the same physical renderer](../src/game/physical-card.ts). It receives the existing owned card instance. `status === 'graded'` selects a slab; a raw card with stale grade fields still renders raw. Display slots continue storing only the owned UID, and existing inventory, grading, sale, and save transactions are unchanged.

Each physical card has independent outward-facing front and back meshes with normalized UVs, plus a rounded cardstock body with no artwork material. The front uses the exact definition's image. Paper cards use the [official English card back](artwork-sources.md#shared-card-back); unavailable images show an explicit missing-image state. The UPC metal copy retains its unavailable artwork state rather than using paper imagery.

A slab encloses that same card geometry with a separate transparent rim, front/rear covers, insert, and two label faces. [Shared presentation data](../src/assets/card-presentation.ts) supplies simulated PSA, BGS, CGC, SGC, and TAG styling to both the physical model and binder/result thumbnails. Labels show the actual grade, exact printing, a stable `RFY-…` simulated certification ID derived from the copy and grading submission, and BGS subgrades when present. These are game presentations, not authentic grading certificates or replicas of proprietary grading systems.

Existing saves store numeric condition rather than defect positions. Side-specific surface marks and corresponding edge/corner wear are deterministically derived from the UID and saved condition; neither rotation nor grading enters this seed. Rendering never mutates the owned copy or rerolls condition. The stand placement uses the raw/slab envelope to keep its lower edge above the existing base.

Inspection supports mouse dragging, arrow-key rotation, Flip, and Reset view. Its preview renders only for input, resize, or image completion. Requested images use a bounded 20-entry decoded-image cache. GPU textures, geometry, materials, preview context, and input handlers are released on removal or panel close. Late image completions do not update disposed models.

## Verification

- [Geometry and inventory tests](../tests/physical-card.test.ts): outward face visibility, UV limits, untextured edges, all grader styles, slab containment, stand clearance, deterministic wear/certification, disposal, and save-safe display references.
- [Browser tests](../tests/browser/physical-card.spec.ts): raw/slab front and back images, full 360-degree rotation, pointer rotation, replacement/removal, and a reloaded displayed graded copy with unchanged UID/condition/certification.
- Visual checks: [raw front](../artifacts/physical-raw-front.png), [raw back](../artifacts/physical-raw-back.png), [raw edge](../artifacts/physical-raw-edge.png), [slab front](../artifacts/physical-slab-front.png), [slab back](../artifacts/physical-slab-back.png), and [slab edge](../artifacts/physical-slab-edge.png).

Run `npm.cmd run build`, `npm.cmd test`, and `npm.cmd run test:e2e` on Windows PowerShell.
