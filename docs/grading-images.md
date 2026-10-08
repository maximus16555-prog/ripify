# Stable Grading app previews

The desktop's one-second stock/status timer previously also refreshed Grading's Submit a card page. Every refresh called `ComputerApp.render`, replaced the complete content with `innerHTML`, recreated its image elements with `image-loading` (opacity zero), and decoded them again. Selecting a card, grader or service replaced the same grid. This is imperative DOM code, not a React-key issue. Exact image URLs and HTTP caching were already working: the reproduction recorded no additional network requests while still observing repeated image load events.

## Targeted fix

- [Desktop scheduling](../src/ui/computer-desktop.ts) polls only Store stock/order views and Grading submission countdowns. Grading browsing updates through real store changes and player actions, rather than the clock.
- [Grading rendering](../src/ui/computer-apps.ts) compares its rendered markup and ignores notifications that leave the visible content unchanged. Genuine changes build an inert template and reuse unchanged card tiles in place by the unique owned-copy UID. Decoded image elements survive selection and grader/service changes. Changed/removed owned copies still update normally.
- A weak tile-markup cache and weak initialized-image set preserve only live DOM previews. No global card-image preload, alternate artwork, cache-busting URL, or unbounded collection cache was added. Native image caching remains in use; old hidden/minimized windows still release their images and physical previews.
- Other application renderers, app styles, artwork/fallback helpers, grading calculations, fees, deadlines, inventory transactions, save data and the physical pack opener are unchanged.

## Browser reproduction and verification

[The regression](../tests/production/grading-images.spec.ts) walks to the physical computer and uses the actual Grading app with 48 different real printings from 151 and Ascended Heroes. Delayed image responses expose loading-state resets. Mutation/load observers measure a scrolled 36-card grid over 3.3 seconds, then verify selection, grader and service changes, an unrelated currency/store notification, pagination and exact owned-card persistence.

| Idle measurement (3.3 seconds) | Before | After |
| --- | ---: | ---: |
| Image elements removed | 108 | 0 |
| Image elements added | 108 | 0 |
| Image load events | 108 | 0 |
| Extra network requests | 0 | 0 |
| Original DOM nodes preserved | No | Yes |
| Scroll position | 200px | 200px |

The post-fix preview nodes also remain identical through card/service/grader selection, with no additional load events. The grid itself remains connected while controls around it change; moving cached images through a detached fragment was also found to restart load events and has been avoided. Browsing both pages requests 48 unique image URLs once each. The separate existing computer flows cover real purchases, listings/locks, grading/returns, inspection, save/reload and eight window lifecycle cycles with bounded WebGL contexts and no mounted hidden previews.

Evidence: [before](../artifacts/grading-images-before.json), [local results](../artifacts/grading-images-local.json), [stable Grading view](../artifacts/grading-stable-images.png).
