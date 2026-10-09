# Outdoor foundation

The bedroom door now targets `outside`. The house entrance targets `home` through
the existing interaction and faded transition, rather than opening a menu.

Change `OUTDOOR_CONFIG` in `src/game/outdoor-world.ts` to resize the 120 × 120
baseplate or move/resize the house. Ground geometry, collision and playable
bounds derive from that configuration. The surface is at Y = 0.

Add future building groups under `world-objects`. Register their solid footprints
in `World.colliders`, their camera-obstructing meshes in `World.cameraMeshes`, and
their usable entrances in `World.interactions`. Colliders use world-space,
axis-aligned X/Z bounds and a top height. Interior destinations can use the same
`WorldLocation` and lazy scene cache in `src/main.ts`.

Keep each interior in its own builder. `World` also supports spawn/entry positions,
facing angles and atmosphere. Inactive scenes are detached, so they do not render
or participate in movement or interaction checks. The current shop builder and
shop backend remain available for a future building; no shop is placed outside yet.

The outdoor scene uses solid-color materials, one sunlight/shadow source and
hemisphere fill. There are no outdoor asset downloads, physics simulations,
cloud animations or background timers. Its owned geometry/material/shadow
resources are disposed on teardown. Player speeds and camera movement are shared
with the bedroom; only world bounds and clipping distance differ.

Location remains session-local, as before. Reloading returns to the bedroom and
does not alter inventory, orders or progress.
