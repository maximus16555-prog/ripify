# Bedroom computer

The existing bedroom computer opens a monitor-framed RIPIFY desktop. Its four shortcuts launch movable windows with close, minimize, restore, maximize, scrolling and a taskbar. Escape safely returns to exploration. The camera moves toward the existing monitor; furniture, exploration controls and pack-opening cameras remain unchanged.

## Connected applications

- **Pokémon Store:** the four existing verified products, exact artwork/manifests, centralized online prices, product pages, cart, transactional checkout and order tracking. A saved accelerated clock starts at Day 1, 9:20 AM, running at 30 game seconds per real second. Drops become available at exactly 9:30 AM; deterministic demand and recorded purchases consume stock. Orders deliver their pre-created unique instances after one game hour, unopened. Daily drops reset on the next game day. Reload does not reset stock, item IDs or outcomes. No real retailer/payment connection.
- **eBay:** owned raw cards, slabs, misprints, unopened packs and boxes can be listed with an asking price. Existing copy values drive simulated sale/offer probabilities. Listings move through LISTED, WATCHING, OFFER, SOLD or UNSOLD. Accept offers or end listings. Card ownership locks block sale, display, grading and cracking; listed packs/boxes cannot be opened. Displayed cards must be removed first. Settlement transfers the exact item out of the owned inventory and adds currency once in one durable save transaction. Historical grading population remains.
- **Grading:** all five existing graders, their centralized fees and styles, standard/express review, submission status and returns. Uses the existing `submit`, `receive`, grading calculation and physical slab renderer. Hidden condition scores are not disclosed. Existing grading turnaround uses the preserved backend's real-duration deadlines; new store/listing scheduling uses saved game time.
- **Collectr:** portfolio-first overview, observed portfolio history, exact owned instances, ALL/RAW/GRADED/SEALED/MISPRINT filters, seven sorts, paginated collection/catalog search, exact-printing card pages, authoritative base values, graded comparisons, current/all-time local population, recorded sales, physical copy inspection, real simulated market movers and a two-sided informational trade comparison. Search is indexed once. The receive side currently compares supported raw printings; it does not execute or claim multiplayer trading. Portfolio changes include acquisitions/sales/condition/grading as well as price movement, and are labeled accordingly. Catalog charts sample the existing deterministic economy model; fixed chase prices remain flat. No decorative random curves or invented sales. ALL on catalog charts covers the available one-year model window. Empty historical records stay empty.

## One source of truth

`GameStore.state` still owns every card, pack, box, grading order, display reference and price seed. `ComputerState` is an optional validated extension of save version 2 containing only computer scheduling, orders/listings, observed portfolio points and profile preferences. Views resolve item UIDs through the existing inventory. No application has an independent card database or price table. Raw, misprint, crack damage and graded values use the existing economy functions; misprint modifiers are never applied again by an app.

Commerce writes the complete projected save before exposing a purchase, delivery, sale or unlock. Failed storage leaves the prior state untouched. Generated order item IDs and listing outcomes are saved immediately; delivery and settlement are idempotent. Pack seeds/events and existing generator/reveal preloading are untouched. Export/import/reset cover the extension; browser-origin save isolation is unchanged.

The accelerated clock pauses when the browser is hidden/closed; it is not the player's local wall-clock time. It is configurable in the centralized computer state for development. Window clocks use it; the existing grading backend remains unchanged.

## Performance

Only the foreground app mounts content; minimized/background apps retain lightweight navigation/form state. Closing/exiting unsubscribes listeners, clears the one desktop timer, aborts drag handlers and releases the physical inspection preview to the existing bounded cache. Charts are static SVG with native hover/focus date/value tooltips. Collections/search paginate 36 entries with lazy image loading. No full card-image database is preloaded. The game clock performs lightweight arithmetic per frame; stock/delivery/listing checks run once per second, saving periodically rather than every frame. Sale listings waiting for a deadline do not repeatedly commit. Portfolio samples are bounded to 1,500. The surrounding 3D world keeps its existing frozen-menu rendering optimization.

## Reference and attribution

Visually studied the current official [Collectr App Store screenshots](https://apps.apple.com/us/app/collectr-tcg-collector-app/id1603892248): white card-focused grids, prominent portfolio total, mint chart, concise navigation. The shortcut uses the icon published with that listing, stored at `public/computer/collectr.png`; screenshot research copies are under `docs/references/collectr-*.webp`. This is a RIPIFY simulated interface, with no account connection or proprietary source code. Also consulted [Collectr's official tracking presentation](https://www.getcollectr.com/track) and [eBay's trading-card listing guidance](https://www.ebay.com/sellercenter/selling/what-to-sell/selling-trading-cards) for graded/ungraded fields. Product/card artwork remains under the existing verified source records.

## Validation

`tests/computer.test.ts` covers exact drop timing, persistent stock/demand, sealed delivery, idempotence, rejected storage, card/pack/box locks, sale settlement, historical population, offers, exact authoritative prices, immutable copies and invalid save extensions. `tests/production/computer.spec.ts` walks to the physical computer with keyboard input, exercises all four applications through real browser controls, completes delivery/sale/grading return on real timers, checks exact artwork, inspects the returned slab and verifies UID/order/listing/profile persistence after Escape/reload. Browser contexts are isolated from the player's save. Existing shop, opener, shortcuts, reset and slab-crack browser regressions also run.

Screenshots: `artifacts/computer-desktop.png`, `computer-store.png`, `computer-ebay.png`, `computer-grading.png`, `computer-collectr.png`, `computer-card-page.png`, `computer-returned-slab.png`. Preservation hashes are recorded in `artifacts/computer-preserved-systems.json`.


## Files changed

Runtime/UI: [computer services](../src/core/computer.ts), [computer state](../src/core/computer-state.ts), [save validation](../src/core/save.ts), [store transactions and locks](../src/core/store.ts), [types](../src/core/types.ts), [desktop windows](../src/ui/computer-desktop.ts), [application views](../src/ui/computer-apps.ts), [desktop styles](../src/ui/computer.css), [game UI integration](../src/ui/game-ui.ts), [computer camera anchor](../src/game/camera.ts), [main loop integration](../src/main.ts), [Collectr shortcut icon](../public/computer/collectr.png).

Verification: [service tests](../tests/computer.test.ts), [hosted browser flows](../tests/production/computer.spec.ts), [reset clock-aware assertion](../tests/production/reset-progress.spec.ts). The complete changed-file manifest is [here](../artifacts/computer-owned-files.json). The reset regression permits the game clock to advance after refresh while preserving exact assertions for inventory, preferences and all progress.

Grading candidates are paginated rather than hiding copies after the first 60. The browser regression selects the 61st eligible owned card and verifies the shared physical inspection renderer.

## Public release

Published to [RIPIFY on Freebuff](https://ripify.freebuff.app/) on October 7, 2026, deployment `kn7cb5mc`. Runtime source commit: `b630cb7` (following desktop implementation `060a554`). Hosted `main-CotqgbvQ.js` SHA256 `f50df690eb0febf656f9bf1b82bd00bbd6853830c656fe7785a4ca57b18a80ca` matches the tested local production build exactly. No localhost server was listening on 4173/5173 during hosted verification.

Production build, all 139 logic tests and all nine final hosted browser tests pass (zero failed/skipped/flaky tests, about 2.7 minutes). No uncaught browser errors occurred in the five-app flow. Full hosted verification results are recorded in [the browser report](../artifacts/computer-hosted-playwright.json) and [the release audit](../artifacts/computer-release.json).

Visual review inspected actual hosted screenshots of the desktop, order confirmation, eBay listing, grading submission, Collectr overview/card page, profile and returned slab. These are running game views with real owned-instance references, not mockups. All browser fixtures use isolated storage and do not modify the player's save.

The window-lifecycle regression repeatedly opens/minimizes grading and Collectr eight times. It measures two WebGL contexts reused by the world and physical preview, zero hidden card images/previews, and zero world draw calls during the measured idle second after camera transition. This measures idle/cleanup behavior, not a claim about peak game FPS.

## Profile app removal

The RIPIFY Profile shortcut, window, editing form, highlights and exclusive styles have been removed. Store, eBay, Grading and Collectr retain their existing appearance and behavior. Saved name/avatar fields, statistics, receipts, population history and the shared profile setter remain compatible with existing saves. The computer browser regression verifies all four applications and retained profile/statistics after reload.

Published to the existing public domain as deployment `kn7dyrc2`. The production build, 167 logic tests, two local browser flows and both hosted browser flows pass. The hosted runtime matches the tested local bundle exactly. [Release audit](../artifacts/profile-removal-release.json) ? [Hosted browser results](../artifacts/profile-removal-hosted.json).
