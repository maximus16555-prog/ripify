"""Pin the English Ascended Heroes checklist and exact TCGdex scans.

Explicit development import, cached metadata, three concurrent requests. The
game loads only images belonging to the current pack, never this whole set.
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
API = 'https://api.tcgdex.net/v2/en'

def fetch(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=25) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt * 2)

set_data = json.loads(fetch(API + '/sets/me02.5'))
assert set_data['cardCount']['official'] == 217
assert {c['id'] for c in set_data['cards']} == {f'me02.5-{n:03d}' for n in range(1, 296)}

def card(entry):
    card_id = entry['id']
    cached = CACHE / (card_id + '.json')
    if cached.exists():
        data = json.loads(cached.read_text(encoding='utf-8'))
    else:
        data = json.loads(fetch(API + '/cards/' + card_id))
        cached.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        time.sleep(.2)
    assert data['id'] == card_id == data['set']['id'] + '-' + data['localId']
    assert data['set']['id'] == 'me02.5' and data['name'] == entry['name']
    assert data.get('category') and data.get('rarity')
    assert data['image'] == entry['image']
    image = data['image'] + '/high.webp'
    with urllib.request.urlopen(urllib.request.Request(image, method='HEAD'), timeout=25) as response:
        assert response.headers.get('Content-Type', '').startswith('image/')
    fields = ['id', 'name', 'localId', 'category', 'rarity', 'hp', 'types', 'stage', 'suffix', 'evolveFrom', 'illustrator', 'attacks', 'abilities', 'weaknesses', 'resistances', 'retreat', 'regulationMark', 'description', 'effect', 'variants', 'set']
    result = {k: data[k] for k in fields if k in data}
    # TCGdex presently conflates the pink/green-star MAR with Ultra Rare.
    # Exact numbers checked against the printed scans and published checklist.
    if 265 <= int(data['localId']) <= 271:
        result['sourceRarity'] = data['rarity']
        result['rarity'] = 'Mega attack rare'
        result['rarityCorrectionSource'] = 'https://www.beckett.com/news/pokemon-mega-evolution-ascended-heroes-me2-5-checklist-and-set-details/'
    result.update(image=image, imageSmall=data['image'] + '/low.webp', sourceUrl=API + '/cards/' + card_id)
    print(card_id, flush=True)
    return result

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
    cards = list(executor.map(card, set_data['cards']))
snapshot = {'source': 'TCGdex', 'retrievedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'set': {k: set_data[k] for k in ['id', 'name', 'releaseDate', 'cardCount']}, 'cards': cards}
raw = json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n'
(ROOT / 'src/data/verified/ascended-heroes.json').write_text(raw, encoding='utf-8')
print(json.dumps({'cards': len(cards), 'sha256': hashlib.sha256(raw.encode()).hexdigest()}))
