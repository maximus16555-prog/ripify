# Artwork provenance

The supported English 151 booster, **standard** Elite Trainer Box (not the Pokemon Center variant), Ultra-Premium Collection, and SVE #001-008 Basic Energy scans are cached in [public/artwork](../public/artwork). This avoids the original Energy host's HTTP 403 errors and external hotlink dependencies for these assets. Existing owned IDs, pack outcomes, fixed contents and saves are unchanged.

The [asset manifest](../src/data/verified/artwork.json) records every exact source page, original image URL, dimensions, retrieval date and SHA-256 checksum. The original photographs/scans are unmodified. Runtime asset overrides are separate from the pinned printed-data snapshot, so refreshing card metadata cannot remove the local image fix.

| Product | Exact source record |
| --- | --- |
| English 151 booster | [TCGplayer #504467](https://www.tcgplayer.com/product/504467/pokemon-sv-scarlet-and-violet-151-151-booster-pack) |
| Standard English 151 ETB | [TCGplayer #503313](https://www.tcgplayer.com/product/503313/pokemon-sv-scarlet-and-violet-151-151-elite-trainer-box) |
| English 151 UPC | [TCGplayer #502005](https://www.tcgplayer.com/product/502005/pokemon-sv-scarlet-and-violet-151-151-ultra-premium-collection) |

| Owned definition | Exact printing and scan source |
| --- | --- |
| `sve-1` | [Grass #001](https://pkmncards.com/card/basic-g-energy-scarlet-violet-energy-sve-001/) |
| `sve-2` | [Fire #002](https://pkmncards.com/card/basic-r-energy-scarlet-violet-energy-sve-002/) |
| `sve-3` | [Water #003](https://pkmncards.com/card/basic-w-energy-scarlet-violet-energy-sve-003/) |
| `sve-4` | [Lightning #004](https://pkmncards.com/card/basic-l-energy-scarlet-violet-energy-sve-004/) |
| `sve-5` | [Psychic #005](https://pkmncards.com/card/basic-p-energy-scarlet-violet-energy-sve-005/) |
| `sve-6` | [Fighting #006](https://pkmncards.com/card/basic-f-energy-scarlet-violet-energy-sve-006/) |
| `sve-7` | [Darkness #007](https://pkmncards.com/card/basic-d-energy-scarlet-violet-energy-sve-007/) |
| `sve-8` | [Metal #008](https://pkmncards.com/card/basic-m-energy-scarlet-violet-energy-sve-008/) |

Each Energy scan is linked by its specific card entry, displays the matching SVE EN number, and corresponds to the existing structured definition. No different era/printing is substituted. The UPC's metal Mew copy still has its explicit missing-image state; a paper scan is not substituted for metal.

Images remain copyrighted by their respective owners. Source access/caching is not a claim of ownership, endorsement or a redistribution license; the existing catalog's production image-permission requirements still apply. [PkmnCards source information](https://pkmncards.com/about/).

Refresh this small cache explicitly with `python scripts/cache-artwork.py` (requires Pillow, installable with `python -m pip install Pillow`). It makes bounded sequential requests, verifies each exact Energy page links the scan, validates image content and dimensions, then records checksums. It never runs at game startup and does not download the full card database.

## Ascended Heroes integration

The complete 295-card English checklist is pinned from [TCGdex me02.5](https://api.tcgdex.net/v2/en/sets/me02.5) in [ascended-heroes.json](../src/data/verified/ascended-heroes.json). Each exact card endpoint supplies its printed metadata and matching numbered high/low scan. The explicit [import script](../scripts/import-ascended.py) checks every high-resolution scan with an image HEAD request and bounds requests to three workers. No set image preload occurs at game startup.

TCGdex currently calls #265–271 “Ultra Rare.” Those seven entries are normalized to Mega Attack Rare, retaining sourceRarity and the correction source; this is verified against the printed pink/green-star scans and [Beckett’s numbered checklist](https://www.beckett.com/news/pokemon-mega-evolution-ascended-heroes-me2-5-checklist-and-set-details/). The English god-pack composition is three MAR plus seven SIR, documented in [PokéBeach’s set guide](https://www.pokebeach.com/2026/01/ascended-heroes-set-guide-full-set-list-god-packs-reverse-holos-product-lineup-and-more). A Basic Energy accompanies those ten hits, consistent with the eleven-card [graded god-pack lot](https://comics.ha.com/itm/memorabilia/trading-cards/pokemon-ascended-heroes-god-pack-group-of-11-psa-graded-trading-card-game-the-pokemon-company-2026-special-illustration-rare-consecutive/a/7458-37051.s).

The normal booster packaging scan is cached unchanged from [TCGplayer product 672434](https://www.tcgplayer.com/product/672434/pokemon-me-ascended-heroes-ascended-heroes-booster-pack), with its checksum in the existing [artwork manifest](../src/data/verified/artwork.json). These loose packs are actual components of [official Ascended Heroes products](https://www.pokemon.com/us/pokemon-tcg/product-gallery/mega-evolution-ascended-heroes-booster-bundle), sold individually by RIPIFY’s simulated shop. Source availability is not a claim of artwork ownership or redistribution permission.

## Shared card back

Exact pinned TCGdex card scans also have an unchanged, SHA-256-verified same-origin cache in [artwork.json](../src/data/verified/artwork.json). This avoids duplicate CORS headers that prevented WebGL slab fronts from loading. Refresh explicitly with [cache-renderable-cards.py](../scripts/cache-renderable-cards.py); existing checksums require review if the upstream image changes. Runtime loading remains limited to visible cards and the generated current pack, rather than preloading all cached files.

The physical renderer uses the [official English Pokemon TCG card-back asset](https://tcg.pokemon.com/assets/img/global/tcg-card-back-2x.jpg), cached unchanged at [pokemon-card-back.jpg](../public/artwork/pokemon-card-back.jpg). Its separate [source manifest](../src/data/verified/card-back.json) records dimensions and SHA-256; refreshing the product/Energy cache does not overwrite it. Copyright remains with the respective owners; no redistribution license is claimed. Metal product cards retain an explicit unavailable image state rather than substituting a paper card back.
