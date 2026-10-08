# Card disposal

Binder inspection and Collectr physical-copy inspection have a **Delete card** action. A confirmation explains that deletion is permanent and awards no money. Graded cards, misprints, favorites and transaction-locked copies cannot be deleted. Favorites can be explicitly unfavorited first; cards must return from grading or be removed from a slab before they become eligible raw copies.

Both the binder and Collectr Collection expose **Select / Bulk manage**, using the same paginated tool and owned-instance store. Filters combine Common, Uncommon and Rare; exact set; raw state; maximum authoritative market value; name/number search; and duplicate printings. Changing a filter does not delete anything and clears the selection. Select visible, Select all filtered, individual toggles, Deselect all and a selected count are available.

Automatic selection also skips displayed cards, fixed promos/metal cards and cards worth at least **$100**. Eligible valuable raw cards can be selected manually, but their confirmation explicitly warns about valuable cards and shows the selected market value. The store independently requires that warning's confirmation for valuable selections.

**Select duplicates** groups by stable definition ID, not Pokemon name. It keeps a protected/special copy when present, otherwise the highest-condition copy, with deterministic tie-breaking. It selects only eligible excess copies in the current filter. At least one physical copy of every exact printing remains unselected by default. The player can deselect any proposed disposal.

## Persistence and shared systems

`GameStore.deleteCards` validates the entire requested set again at commit time. A missing, newly protected or transaction-locked copy aborts the entire operation. Duplicate input IDs are deduplicated. The transaction constructs a new active inventory, removes display references, preserves historical grading population, records a compact disposal receipt with exact identity/condition/provenance/grading/crack history, and samples the resulting portfolio before a single durable save write.

Only after that write succeeds does the live store change and notify existing consumers. Storage failure changes neither inventory nor portfolio/history. There is no payout and no sale-stat increment. Receipts are historical disposal records, never active owned inventory or rehydration sources. Save parsing rejects duplicate disposal records and disposed IDs reappearing in active inventory/opening cards. Existing saves without receipts continue to load normally.

Binder, Collectr, profile, inventory counters and collection values derive from the same active cards. Current population falls when cards leave ownership; all-time pack receipts, rarity statistics, grading population and disposal provenance remain. Collectr's historical copy count includes disposal receipts for previously owned copies without a pack receipt.

## Performance and scope

The cleanup grid mounts at most 24 images per page and uses existing image caching/presentation. Selection and filters are local UI state. Store listeners are removed on exit, closed/minimized apps unmount the tool, and confirmation does not create a background timer. No pack generation, odds, pricing, grading calculation, artwork or pack-opening code is changed.

Unit tests cover atomic single/batch disposal, protected and stale selections, eBay/trade/transfer locks, write failure, exact-printing duplicate retention, combined filters, valuable confirmation, historical grade population, no payout, reload and resurrection rejection. The production browser flow exercises single disposal/cancellation, protected inspection buttons, 61-card duplicate cleanup, manual deselection, valuable warning, Collectr filtered selection/deletion, live portfolio/profile updates and save/reload in an isolated player save.

All 154 unit tests and the local browser regressions pass. Local gameplay disposed 63 copies total (one Common, 61 excess copies and one remaining eligible copy through Collectr), retained the six protected/valuable copies, awarded no money and preserved the result after reload. The expanded flow also checks visible-page selection, combined Common/Uncommon filtering, and manually selecting/cancelling a valuable bulk selection.

The expanded disposal flow, shared-pricing flow and existing shop/rip/swipe flow also pass against https://ripify.freebuff.app/ (three hosted tests, zero game page errors). Deployment `kn7b0ztw` serves `main-Co7NPrhx.js`, SHA-256 `d8fcaba2e554e7c20704581af382788794347fda45d9e43fc24f7e6ec20b6a9a`, matching the local production build. Results: `artifacts/card-disposal-hosted-tests.json`; release summary: `artifacts/card-disposal-release.json`.
