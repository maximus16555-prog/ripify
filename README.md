# RIPIFY

A browser-based, single-player 3D card collecting game built with Three.js, TypeScript and Vite. Launching the game spawns the player directly in their room.

Play the public production build at **[ripify.freebuff.app](https://ripify.freebuff.app/)**. It runs independently of local development servers. See [deployment and hosted verification](docs/deployment.md).

## Run locally

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. On Windows PowerShell, use `npm.cmd` if script execution is restricted.

## Play

- WASD: move; mouse: camera (click the room to capture the cursor, or drag).
- Shift: sprint; Space: jump; E: interact; Escape: release cursor or close a menu.
- Visit the card shop through the left door and buy verified English 151 packs, a standard ETB or a UPC with simulated coins.
- Keep boxes sealed, or select one at the opening desk. Slide the ETB sleeve right, lift the lid, then lift out the contents. The 151 UPC uses a hinged lid and pull-out contents. Right-drag or use the view buttons to rotate the 3D view. Contained packs remain unopened; fixed promos enter the binder.
- Open an unopened pack at the opening desk. Grab either top edge and drag horizontally across the seam, or hold R to rip it.
- Drag each card or press an arrow key to advance once. The next cards are already underneath; short or cancelled swipes return without advancing. Cards never cycle automatically.
- Place the completed pack in the binder, inspect cards, display them, sell them or submit them for simulated grading.
- Drag a card in inspection to rotate it, or use Flip and Reset view. Raw cards and graded slabs show their correct front, back and edges; displayed slabs retain the same owned copy, grade and condition.

## Settings and saves

Auto, Low, Medium and High graphics presets, render scale, mouse sensitivity, independent audio controls, fullscreen and optional FPS counter are available in Settings. Progress and preferences are versioned in browser storage. Export/import is available; interrupted openings resume with the same cards and reveal index. Invalid saves retain a recovery copy where storage permits.

## Development

```sh
npm run build
npm test
npm run test:e2e
```

The renderer pauses when hidden, batches static furniture and instances floorboards. The two small rooms are cached after their first visit; inactive rooms are detached, and their resources are disposed at game teardown. Frozen menu backgrounds redraw only when needed. Inspection reuses a bounded raw/slab preview cache. Exact real card images are loaded on demand from structured sources. Only the active pack's images are preloaded and decoded before its cards can be revealed; decoded elements remain in the stack through each swipe. The small verified catalog contains 207 English 151 cards, three fixed promos and eight Basic Energy definitions. The three supported product images and eight exact Energy scans are cached locally; remaining card images load on demand. Missing images are clearly marked; no fake card faces are generated. See [catalog sources and limitations](docs/catalog-sources.md).

Save schema v2 preserves old prototype data in an exportable legacy archive rather than turning invented card IDs into real printings. Currency and settings survive. Pack outcomes and interrupted box openings persist without rerolls or duplicate contents. Prices, odds and grading remain game simulations. Multiplayer is not implemented.

See [physical card rendering and validation](docs/physical-card-rendering.md) for shared display/inspection materials, simulated slab labels and persistent condition presentation.

See [performance profiling and before/after results](docs/performance.md) for measured bottlenecks, bounded resource caches and visual regression checks. Run `npm run profile:performance` with the development server running to repeat the gameplay profile in an isolated save.

RIPIFY is a fan-made simulation and is not affiliated with or endorsed by Pokémon, Nintendo, Creatures, Game Freak, PSA, Beckett, CGC, SGC, TAG, eBay, or other referenced companies.

See [economy balance results and reproducible simulations](docs/economy-balance.md) for centralized values/prices, pull-rate tuning, and before/after measurements.

See [complete English 151 pool and unique pack selection](docs/151-completeness.md) for all 207 card mappings, live artwork verification, pullability and no-duplicate validation. Run `npm run validate:151 -- 100000` for the development audit/simulation.

See [persistent misprints and special-pack validation](docs/rare-events.md) for fixed independent odds, saved physical defects, one-time raw value modifiers, grading persistence and large-sample results. Run `npm run simulate:rare-events` to repeat the simulation.

See [physical ETB/UPC unboxing and audit](docs/physical-unboxing.md) for separate 3D packaging, verified surface mapping, physical contents, interruption safety, and resource cleanup.

Graded cards can be cracked from inspection, with a confirmed 50% risk of permanent physical damage. The same owned copy, misprint and grade history survive. See [slab cracking and validation](docs/slab-cracking.md). Run `npm run simulate:slab-cracks` for the isolated 200,000-attempt simulation.
