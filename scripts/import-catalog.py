"""Refresh the small, pinned English 151 catalog from TCGdex. No image fabrication.

Requests are cached and bounded to three concurrent downloads. Run explicitly;
the game never calls the metadata API at startup.
"""
import concurrent.futures
import hashlib
import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.freebuff/catalog-research/cards'
CACHE.mkdir(parents=True, exist_ok=True)
DEST = ROOT / 'src/data/verified'
DEST.mkdir(parents=True, exist_ok=True)
API = 'https://api.tcgdex.net/v2/en'

def fetch(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt * 2)

set_data = json.loads(fetch(API + '/sets/sv03.5'))
assert set_data['id'] == 'sv03.5' and set_data['cardCount']['official'] == 165
assert len(set_data['cards']) == 207
assert {c['id'] for c in set_data['cards']} == {f'sv03.5-{number:03d}' for number in range(1, 208)}
ids = [c['id'] for c in set_data['cards']] + ['svp-051', 'svp-052', 'svp-053']

def card(card_id):
    cached = CACHE / (card_id + '.json')
    if cached.exists():
        data = json.loads(cached.read_text(encoding='utf-8'))
    else:
        data = json.loads(fetch(API + '/cards/' + card_id))
        cached.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        time.sleep(.2)
    assert data['id'] == card_id
    assert data['id'] == data['set']['id'] + '-' + data['localId']
    assert data.get('name') and data.get('category') and data.get('rarity')
    if data['set']['id'] == 'sv03.5':
        assert data['rarity'] in ['Common', 'Uncommon', 'Rare', 'Double rare', 'Ultra Rare', 'Illustration rare', 'Special illustration rare', 'Hyper rare']
    assert data['image'].endswith('/' + data['set']['id'] + '/' + data['localId'])
    # The source itself provides the exact printing's image base. Never derive it from a name.
    image = data['image'] + '/high.webp'
    available = False
    for suffix in ['/high.webp', '/high.png', '/low.webp']:
        candidate = data['image'] + suffix
        try:
            with urllib.request.urlopen(urllib.request.Request(candidate, method='HEAD'), timeout=30) as response:
                available = response.headers.get('Content-Type', '').startswith('image/')
            if available:
                image = candidate
                break
        except Exception:
            continue
    if not available:
        print('Image unavailable: ' + card_id, flush=True)
    fields = ['id', 'name', 'localId', 'category', 'rarity', 'hp', 'types', 'stage', 'suffix', 'evolveFrom', 'illustrator', 'attacks', 'abilities', 'weaknesses', 'resistances', 'retreat', 'regulationMark', 'description', 'effect', 'variants']
    result = {k: data[k] for k in fields if k in data}
    result['set'] = data['set']
    result['image'] = image if available else None
    result['imageSmall'] = data['image'] + '/low.webp'
    result['sourceUrl'] = API + '/cards/' + card_id
    return result

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
    cards = list(executor.map(card, ids))

# Exact Basic Energy scans from the historical structured PokemonTCG dataset.
# TCGdex has metadata but no image references for these eight printings.
energy_url = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/sve.json'
energies = json.loads(fetch(energy_url))[:8]
for energy in energies:
    image = energy['images']['large']
    try:
        with urllib.request.urlopen(urllib.request.Request(image, method='HEAD'), timeout=15) as response:
            assert response.headers.get('Content-Type', '').startswith('image/')
    except Exception:
        image = None
        print('Image unavailable: ' + energy['id'], flush=True)
    cards.append({'id': energy['id'], 'name': energy['name'], 'localId': energy['number'], 'category': energy['supertype'], 'rarity': energy['rarity'], 'set': {'id': 'sve', 'name': 'Scarlet & Violet Energy', 'cardCount': {'official': 8}}, 'image': image, 'imageSmall': energy['images']['small'], 'sourceUrl': energy_url, 'variants': {'normal': True, 'holo': False, 'reverse': False}})

snapshot = {'source': 'TCGdex', 'retrievedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'set': {k: set_data[k] for k in ['id', 'name', 'releaseDate', 'cardCount']}, 'cards': cards}
raw = json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n'
(DEST / '151.json').write_text(raw, encoding='utf-8')
license_data = fetch('https://raw.githubusercontent.com/tcgdex/cards-database/master/LICENSE')
(ROOT / 'docs/TCGdex-LICENSE.txt').write_bytes(license_data)
print(json.dumps({'cards': len(cards), 'setCards': 207, 'promos': 3, 'energyCards': 8, 'sha256': hashlib.sha256(raw.encode()).hexdigest()}))
