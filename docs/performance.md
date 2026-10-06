# Performance investigation

Measured on October 5, 2026. This pass preserves the existing visuals, graphics presets, gameplay, card models, and physical pack opener.

## Causes found by profiling

The game usually sustained 60 Hz on the test GPU, but particular interactions caused long stalls. CPU samples identified synchronous WebGL shader linking (`getProgramInfoLog`) as the largest non-idle cost during repeated inspection and room travel.

- Each card inspection created and destroyed a WebGL renderer/context. Reopening an inspection compiled its shaders again.
- Display edits recreated every displayed item, even when moving the same owned copy between stands. Six repeated slab inspection/display moves uploaded 88 textures and produced frame gaps up to 150 ms.
- Every door transition destroyed and rebuilt the destination room's procedural meshes, materials, textures, and shader resources. Repeated travel produced a worst frame gap of 733.3 ms.
- The frozen 3D background continued redrawing approximately 15 times per second behind menus. A stationary binder still submitted approximately 3,819 WebGL draws per second, including shadows.
- Static furniture batching separated otherwise identical surfaces by constant color, leaving 146 visible room draw calls at the measured spawn view.

No growing physics workload, duplicate gameplay loop, or unbounded GPU-resource leak was demonstrated in the measured session. Collision/camera updates were not the dominant bottleneck. Existing card-image caches and current-pack preloading were already bounded and were retained.

## Changes

1. Merge compatible static surfaces while baking their original linear colors into vertices. Geometry, normals, UVs, textures, shadow participation, and surface properties are preserved; collision and moving meshes are excluded.
2. Render a frozen background only after invalidation: camera movement, resize, graphics changes, UI-state changes, or completed texture loads. Exploration and the existing focused-camera transition continue normally.
3. Reuse one inspection WebGL context, retaining at most one raw copy and one slab to keep both shader variants warm. Closing an inspection cancels its animation frame, observer, and listeners. Dormant previews do not render; terminal cleanup destroys their resources.
4. Reuse unchanged displayed models by owned instance ID and physical appearance signature. Moving a copy keeps its geometry, materials, and textures. Removal or a changed condition/slab disposes the superseded model.
5. Lazily cache the two small locations. The shop is built only on its first visit; inactive rooms are detached and perform no rendering, collision, interaction, or animation work. This is a bounded memory tradeoff to eliminate recurring room construction. Both locations are disposed at game teardown/HMR.
6. Warm destination shaders asynchronously during the existing door fade. Retain correctly sized shadow maps and avoid redundant canvas-buffer resizing. Shadow resolution, lighting, anti-aliasing, render scale, and presets are unchanged.

## Measurement method

Both runs used Chromium with ANGLE Direct3D 11 on an **NVIDIA GeForce RTX 4070 SUPER**, **High** graphics, **1280 × 720**, DPR 1. The initial collection contained 110 generated cards, including a BGS slab and three occupied stands. Tests used isolated browser saves; no simulated profiling items were granted to the user's save.

Each normal phase lasted approximately eight seconds. A three-minute mixed phase repeatedly inspected/flipped a slab, traveled to the shop and home, and visited the binder. The sequence also measured walking, slow manual tearing, all eleven manual card swipes, and repeated display moves.

Measurements include main-loop CPU duration, animation-frame intervals, all WebGL draw submissions including shadows/inspection, texture uploads, post-GC heap/DOM counters, and Three.js GPU-resource counts. Card images were served from exact previously audited source bytes where cached, avoiding image-host/network variation. The opener still preloads only its generated pack.

This is an instrumented development-build comparison, not a claim about every player's FPS. CPU sampling, OS scheduling, garbage collection, first-use shader compilation, and initial asset decoding can contribute to isolated spikes. Frame interval is measured separately from CPU time; WebGL draw counts are not direct GPU execution-time measurements. An initial SwiftShader run was excluded from the hardware comparison.

## Results

Final measurements are recorded in [before](../artifacts/performance-before.json) and [after](../artifacts/performance-after.json).

| Measurement | Before | After |
| --- | ---: | ---: |
| Spawn view: visible draw calls per render | 146 | 85 |
| Spawn view: all WebGL draw submissions/sec | 15,849 | 8,767 |
| Walking: median main-loop CPU time | 2.6 ms | 0.6 ms |
| Walking: 95th-percentile frame interval | 16.8 ms | 16.8 ms |
| Frozen binder: WebGL draw submissions/sec | 3,819 | 0 |
| Static slab inspection: WebGL draw submissions/sec | 3,857 | 0 |
| Six inspection/display moves: worst frame interval | 150.0 ms | 16.8 ms |
| Same six moves: texture uploads | 88 | 0 |
| Three-minute mixed session: worst frame interval | 733.3 ms | 66.7 ms |
| Mixed session: 99th-percentile frame interval | 33.3 ms | 16.8 ms |
| Mixed session: frames exceeding 33.5 ms | 58 | 2 |
| Mixed session: texture uploads | 811 | 98 |
| Room after mixed session: median main-loop CPU time | 2.8 ms | 0.6 ms |

The mixed phase completed 18 full travel/inspection cycles before and 20 after in approximately the same three-minute window. Steady exploration was already near 60 FPS; the improvement is reduced stalls and substantially more CPU/GPU headroom. Manual tearing and all eleven swipes retained approximately 16.7 ms median frame intervals; the final run had no frame gaps over 33.5 ms in either phase. The remaining two mixed-session gaps and a 66.7 ms binder boundary gap mean this does not promise absolutely hitch-free first-use loading.

After the mixed session, main-renderer resource counts were **117 geometries / 35 textures**, versus **140 / 18** before. The higher texture count is deliberate: both small rooms and their shadows remain cached. It is not a cache of the entire card catalog. Post-GC JS heap was approximately **12.86 MB**, versus **12.59 MB** before. A separate repeat-travel regression verifies that geometry/texture counts plateau after warming both locations; preview-context and listener tests separately verify bounded inspection resources. Three.js counters measure allocated resource counts, not total VRAM bytes.

## Validation

- Production build and 67 logic tests passed, including resource retention/disposal and preservation of batched colors, UVs, normals, transforms, and shadow flags.
- Fourteen targeted browser scenarios passed across the validation runs. They cover frozen-menu invalidation, bounded raw/slab inspection context reuse, listener cleanup, repeated room visits, shop purchases/returns, grading/settings, display replacement/removal/reload, raw/slab rotation, progressive tearing, cancelled/rapid swipes, stable underlying cards, delayed-image preloading, and the existing currency shortcut. Functional browser tests use software rendering for portability; the performance measurements above use the verified NVIDIA hardware backend.
- Before/after screenshots use the same deterministic scene, camera, player pose, materials, and High preset. The measured spawn has the same 36,598 submitted triangles. The room comparison averaged **0.00196 out of 255** per color channel; 155 of 921,600 pixels differed by more than two levels. Desk and shop averages were below 0.00004, consistent with negligible rasterization differences. See [pixel comparison](../artifacts/performance-visual-comparison.json), [original room](../artifacts/performance-before-home.png), and [optimized room](../artifacts/performance-after-home.png).
- Hash checks confirm the opener, tear geometry, opening CSS, camera, pack generation, physical-card renderer, and current-pack image cache are unchanged. See [preserved-system hashes](../artifacts/performance-preserved-systems.json).

## Reproduce

Start Vite, then run:

```sh
npm run profile:performance -- artifacts/performance-check.json
node scripts/check-performance-visuals.mjs check
npm run build
npm test
npx playwright test tests/browser/performance.spec.ts --workers=1
```

On Windows PowerShell, use `npm.cmd` and `npx.cmd`. `RIPIFY_PROFILE_BACKEND` selects ANGLE's backend; the default is Windows `d3d11`. `RIPIFY_PROFILE_SECONDS` and `RIPIFY_PROFILE_SOAK` control durations. Verify the JSON's GPU identity before interpreting FPS. The script needs the development server at port 5173 and falls back to live exact card-image URLs if the local audited bytes are unavailable.

If lag persists specifically in a regular browser, inspect that browser's active graphics backend. Host Edge process flags included a recent GPU crash and disabled GPU compositing on some renderers during this investigation. Those flags do **not** establish that the user's RIPIFY tab was using software rendering; no browser settings were changed.
