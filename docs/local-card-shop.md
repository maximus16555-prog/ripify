# Local card shop

Corner Cards is the storefront to the right of the house. Walk around to its
front entrance, press E to enter, then approach the counter and use Talk / Shop.
The existing shop interior, controller, scene transition and pack opener are reused.

## Catalog and stock

Only the four currently supported verified products are sold: English 151 and
Ascended Heroes boosters, the standard 151 ETB, and the 151 UPC. No booster box,
tin or bundle has been invented to decorate or fill this catalog. New verified
products join through the existing product definitions and a stock configuration.

Local stock is separate from online daily drops. It restocks every 240 in-game
minutes, with seeded capacity variation and modest simulated demand. Purchases
are recorded against that restock cycle in the optional versioned localShop save
extension. Reloading retains the clock and purchase ledger rather than replenishing
stock. The visible stock counts update once per second without reloading artwork.
Local purchases atomically debit physicalStorePrice and transfer normal sealed
instances directly into inventory. No online order or shipping package is created.

## Offers and selling

The existing ownedValue function supplies the current condition-adjusted, graded
or misprint market value. The existing card desirability model plus small daily
demand variation selects a rate clamped to 70?75%. Prices and rare-event odds are
unchanged. Individual offers are summed before rounding the transaction to cents;
very cheap individual cards are subject to normal one-cent currency rounding.

Selection uses owned instance IDs. Favorites, grading orders, active eBay listings,
trade/transfer locks and in-progress slab operations cannot be sold. Automatic
selection additionally skips graded, misprinted, valuable ($100+), and displayed
cards. These special cards can be selected manually, with an extra acknowledgment
for valuable cards and misprints. Select All Visible selects the current page;
Select All Filtered spans every matching page. Duplicate cleanup preserves at least
one exact printing and prefers protected/special copies and better condition.

The confirmation is revalidated at commit: changed values, stale IDs or new locks
cancel the whole sale. One durable save removes the exact copies, clears their
display slots, credits currency, records transaction/ownership snapshots, and
samples the shared portfolio. Full per-copy condition, provenance, misprint and
grading history remain in the sale receipt. Historical grading population survives;
current population follows the owned collection. A replay cannot pay twice, and
save validation rejects sold IDs restored to the collection. Storage failure
leaves inventory, money and stock untouched.

## Resources

The interior uses static material batching, pooled product textures, a small set
of exact-card display textures and a stationary employee. Inactive scenes remain
detached. The shop UI paginates 36 cards and does not mount every card in a large
collection. Selection changes preserve connected card previews. Its subscription
and stock timer are removed on exit; no shop polling continues while closed.

## Validation

Unit tests exercise immediate purchases, distinct persistent stock/restocks,
150-card atomic sales, condition/graded/misprint valuation, warnings, all lock
classes, duplicates, historical population, stale quotes, replay protection,
storage failure and corrupted-save rejection. Browser tests use actual movement
through the storefront and counter, buy and open a real pack, sell one card and
100+ bulk copies, cross a scheduled restock while browsing, sell confirmed graded
and misprinted copies, and reload without lost or duplicated progress.
