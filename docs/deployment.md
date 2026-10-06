# Production deployment check

## Status

Production build and the production gameplay smoke pass. **Not published yet.**
No public Freebuff URL has been assigned or tested. The Freebuff Cloud browser
is at its account sign-in page. This desktop tool session does not expose a
Freebuff publish operation, and this checkout has no Freebuff hosting binding
or connected source repository. The desktop `.freebuff/project-id` identifies
the local workspace; it is not a confirmed hosting project ID.

## Build and hosting input

- Install locked dependencies with `npm ci`.
- Build with `npm run build`.
- Static output directory: `dist`.
- Serve `dist/index.html` at the domain root with its `assets` and `artwork` directories.
- The ready-to-upload build archive is `artifacts/ripify-production.zip`.
- No running Vite server, localhost tunnel, database, secrets or Node runtime are needed by the built game.

No provider-specific deployment configuration has been invented. The actual
Freebuff project/domain and its supported import/publishing mechanism must be
confirmed through the authenticated hosting interface before publication.

## Checks completed on the production build

The smoke test runs against built files on port 4173, not development port 5173.
It uses a fresh isolated browser save and the regular keyboard/mouse controls:

- Direct entry into the 3D room; no landing screen.
- Walk to the shop and browse real products.
- Both supported booster products are purchasable.
- Buy a 151 pack; currency decreases and unopened inventory increases.
- Walk home and choose the purchased pack at the desk.
- Drag the wrapper seam, then manually swipe the first card.
- Underlying cards and exact artwork load before reveal.
- Web Audio context runs and sound sources play.
- Remaining cards advance only by player action and enter collection.
- Refresh preserves the generated card instances, reveal position and final inventory.
- No uncaught browser exceptions.
- Production has no development debug object.

Source/runtime audit found no localhost API or asset dependencies. Development
URLs exist only in scripts and test configuration. Vite emits hashed JS/CSS and
font assets; product/Energy/card-back artwork is included in the output.
Other exact card scans still load on demand over HTTPS from the existing source.
No graphics, gameplay, audio, generation, pricing or save logic was changed.

## Repeat against the real deployment

In PowerShell, after an actual URL is assigned:

```powershell
$env:RIPIFY_URL = 'https://THE-ASSIGNED-DOMAIN.freebuff.dev'
npm.cmd run test:production
```

For a remote URL the test does not start any local server. It additionally
checks that no request targets localhost or 127.0.0.1. The Playwright report
attaches the tested URL, requested assets, failed requests, audio status and
purchased-pack identifier.

Browser saves are scoped to their origin. Existing local progress can be moved
using the game's Settings export/import controls; hosting does not automatically
gain access to localhost storage. This preserves the existing save architecture.
