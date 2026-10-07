# RIPIFY production deployment

**Public game: https://ripify.freebuff.app/**

Published through Freebuff managed hosting on October 6, 2026. This production static build is public and requires no local Vite server, tunnel, or sign-in. Freebuff currently assigns `*.freebuff.app`, not `*.freebuff.dev`.

- Management: https://freebuff.com/cloud/project/beige-spoons-deny/settings?section=deploys
- Private source: https://github.com/maximus16555-prog/ripify
- Hosting deployment ID: `kn79qg8f`
- Runtime source commit: `0e1e6de`.
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

All 109 logic tests pass. Audio verification confirms playback operation, not a subjective evaluation of sound quality.

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
