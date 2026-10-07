# RIPIFY production deployment

**Public game: https://ripify.freebuff.app/**

Published through Freebuff managed hosting on October 6, 2026. This production static build is public and requires no local Vite server, tunnel, or sign-in. Freebuff currently assigns `*.freebuff.app`, not `*.freebuff.dev`.

- Management: https://freebuff.com/cloud/project/beige-spoons-deny/settings?section=deploys
- Private source: https://github.com/maximus16555-prog/ripify
- Hosting deployment ID: `kn7ftwwe`
- Runtime source commit: `3b0d68c`.
- Install: `npm ci`; build: `npm run build`; static output: `dist` at domain root.

## Compatibility changes

Freebuff beta hosting rejected plain Vite/TypeScript because it currently recognizes React projects only. `src/hosting-entry.ts` mounts the same static game container/loading view, then imports the unchanged Three.js startup. React has no gameplay state or per-frame updates. No Strict Mode/remounting was added.

Changed: `index.html`, `package.json`, `package-lock.json`, and the new startup entry. No engine, room, pack opener, card data, audio, controls, economy, generation, grading or save implementation changed. Existing local artwork/fonts remain bundled; exact card scans still load on demand over HTTPS. Production asset hashes match the locally verified build.

The shared checkout was not a Git repository. An isolated deployment snapshot under ignored `.freebuff/deployment-source` was pushed to a private repository. Freebuff cloned it, but its sandbox could not authenticate a later Git pull. Only the four compatibility files were transferred into its clean workspace, built, and published using the hosting UI.

## Verification on the real public URL

Opened the game in an unsigned-in/incognito browser and visually checked the room. Then ran the production Chromium gameplay test against `https://ripify.freebuff.app` with ports 4173/5173 stopped:

- Enter 3D room, move, enter shop; both booster products are available.
- Buy a 151 pack; currency decreases and unopened inventory increases.
- Return home; select that same pack; manually rip its wrapper.
- Exact artwork and underlying card stack load before swiping.
- Idle without advancing; swipe once for one card.
- Web Audio context runs and playback sources start.
- Refresh preserves generated instances and reveal position.
- Manually reveal remaining cards, collect, and refresh again.
- Collection and inventory persist; development debug object is absent.
- No uncaught browser errors, failed requests, or localhost requests.

All 112 logic tests pass. Audio verification confirms playback operation, not a subjective evaluation of sound quality.

The initial hosted test sent movement too early after reload, before asynchronous game startup registered input. The test now waits for the canvas/loading view; gameplay code needed no fix.

Evidence: [gameplay report](../artifacts/hosted-gameplay.json), [Playwright report](../artifacts/hosted-playwright-report.json), [room](../artifacts/production-room.png), [pack reveal](../artifacts/hosted-pack-reveal.png).

## Repeat hosted verification

```powershell
$env:RIPIFY_URL = 'https://ripify.freebuff.app'
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = 'artifacts/hosted-playwright-report.json'
npm.cmd run test:production -- --reporter=list,json
```

A remote URL starts no local server. The default checks built files on preview port 4173, not development port 5173.

## Saves and updates

Browser saves remain origin-scoped. Export existing localhost progress in local Settings and import it in hosted Settings. Hosting cannot automatically read local-origin storage.

For future releases, sync only intended source changes into the existing private deployment repository/cloud workspace, build/test, and use Redeploy. Keep this domain so existing hosted saves remain accessible. Do not recreate the project or scaffold a replacement game.

## Ascended Heroes pricing release

The October 6 pricing update pins seven exact Ascended Heroes printings to the requested authoritative base raw values. Existing saved misprints resolve to these values with the single 30x raw modifier. Market variation is disabled only for these seven IDs. Generation, special-pack composition, all rare-event odds, grading rules, and the physical opener are unchanged. The hosted main bundle matches the verified local build by SHA256.

## Hidden shortcut release

The hosted production game now retains the user-requested Ctrl+Shift+1/2 pack callbacks. The Vite development-only gate caused both shortcuts to be absent after deployment. Only input-to-pack-factory wiring changed; the generator, per-instance forced decisions, natural odds, and opener are retained. General development debug introspection remains disabled in production. Both production browser tests pass against the public domain: ordinary shop/opening/save flow, and special shortcut inventory, held-key suppression, repeated presses, save/reload, exact compositions/artwork, physical ripping, all manual reveals, and collecting 22 cards. No uncaught browser errors were recorded. Hosted runtime SHA256 matches the local tested build.

Evidence: [hosted shortcut report](../artifacts/hosted-shortcuts.json), [shortcut smoke audit](../artifacts/production-shortcuts-check.json).

## Progress reset release

Settings > Save > Reset progress opens an explicit confirmation with Cancel focused. Confirmation replaces all progress with a fresh game (120 coins and one starter pack), preserves graphics/audio/control preferences, clears the old recovery copy, and reloads into the home room. Cards, grading orders, displays, sealed products, pending openings, receipts, statistics, and history are cleared. The new save is written before changing live state; a rejected write leaves existing progress intact and reports failure.

The public-domain browser test verifies Cancel and Escape, a simulated storage failure, successful reset, retained preferences, recovery cleanup, and persistence through refresh. Tests run in isolated browser contexts, never against the user's own save. Evidence: [reset report](../artifacts/hosted-reset.json), [confirmation screen](../artifacts/reset-progress-confirmation.png).

## Slab cracking release

Inspection now offers confirmed slab removal with an independent 50/50 outcome persisted before animation. Both outcomes keep the same owned card; failed attempts save visible corner/edge/surface damage and halve the raw value basis once per failure. Manufacturing misprints, previous grades/certificates/subgrades, regrading and distinct-copy historical population survive. Display references are removed transactionally. No pack mechanics, generation rules or rare-event odds changed.

All 129 unit tests and seven production browser tests pass. The latter ran against this public domain and covered shop/opening/manual reveals, shortcuts, reset, both crack outcomes, regrading, Escape and refresh during animation. The 200,000-attempt simulation returned 49.933% safe / 50.067% damaged with zero invariant violations. Published `main-Bmoc2Zmo.js` SHA256 `d9e7b53e821b76c43f83a5ffe486c052d475c785ab61ad68202331edd940e64f` matches the tested local build. Evidence: [slab cracking report](slab-cracking.md), [hosted cracking](../artifacts/hosted-slab-cracks.json), [release audit](../artifacts/slab-cracking-release.json).
