"""Development-only 151 identity/metadata/image audit against TCGdex.

At most three requests run concurrently. Successful source responses and images
are cached outside the game. --refresh rechecks all sources; no game assets or
player saves are modified. Requires Pillow to decode image responses.
"""
import argparse
import concurrent.futures
import hashlib
import io
import json
import time
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
API = 'https://api.tcgdex.net/v2/en'
CACHE = ROOT / '.freebuff/151-source-audit'
FIELDS = ['name', 'localId', 'category', 'rarity', 'hp', 'types', 'stage', 'suffix', 'evolveFrom', 'illustrator', 'attacks', 'abilities', 'weaknesses', 'resistances', 'retreat', 'regulationMark', 'description', 'effect', 'variants']

def fetch(url, path, refresh):
    if not refresh and path.exists():
        return path.read_bytes()
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'RIPIFY-development-catalog-audit/1.0'})
            with urllib.request.urlopen(request, timeout=25) as response:
                data = response.read()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            time.sleep(.15)
            return data
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt * 2)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--output', default='artifacts/151-source-audit.json')
    args = parser.parse_args()
    snapshot = json.loads((ROOT / 'src/data/verified/151.json').read_text(encoding='utf-8'))
    stored = {c['id']: c for c in snapshot['cards'] if c['set']['id'] == 'sv03.5'}
    source_set = json.loads(fetch(API + '/sets/sv03.5', CACHE / 'set.json', args.refresh))
    assert source_set['id'] == 'sv03.5' and source_set['cardCount']['official'] == 165
    expected = {f'sv03.5-{number:03d}' for number in range(1, 208)}
    source_ids = {c['id'] for c in source_set['cards']}
    set_errors = []
    if source_ids != expected or set(stored) != expected or len(source_set['cards']) != 207:
        set_errors.append('Set checklist does not contain exactly 001-207')

    def audit(brief):
        card_id = brief['id']
        result = {'id': card_id, 'sourceUrl': API + '/cards/' + card_id, 'errors': [], 'missingMetadata': []}
        try:
            raw = fetch(result['sourceUrl'], CACHE / 'cards' / (card_id + '.json'), args.refresh)
            source = json.loads(raw)
            saved = stored.get(card_id, {})
            if source['id'] != card_id or source['set']['id'] != 'sv03.5' or source['localId'] != card_id.split('-')[-1]:
                result['errors'].append('Invalid source set/card identity')
            for field in FIELDS:
                if saved.get(field) != source.get(field):
                    result['errors'].append('Metadata mismatch: ' + field)
            for field in ['name', 'localId', 'category', 'rarity']:
                if not saved.get(field):
                    result['missingMetadata'].append(field)
            if saved.get('category') == 'Pokemon':
                for field in ['hp', 'types', 'attacks', 'retreat', 'illustrator']:
                    if field not in saved:
                        result['missingMetadata'].append(field)
            elif saved.get('category') == 'Trainer' and not saved.get('illustrator'):
                result['missingMetadata'].append('illustrator')
            base = source.get('image')
            exact_base = f'https://assets.tcgdex.net/en/sv/sv03.5/{source["localId"]}'
            if base != exact_base or brief.get('image') != base:
                result['errors'].append('Set/card image identity mismatch')
            if saved.get('image') not in [base + '/high.webp', base + '/high.png', base + '/low.webp'] or saved.get('imageSmall') != base + '/low.webp':
                result['errors'].append('Stored image does not match exact source printing')
            if saved.get('sourceUrl') != result['sourceUrl']:
                result['errors'].append('Stored source URL mismatch')
            result.update(number=source['localId'], name=source['name'], rarity=source['rarity'], image=saved.get('image'), imageSmall=saved.get('imageSmall'), sourceSha256=hashlib.sha256(raw).hexdigest())
            image_raw = fetch(saved['image'], CACHE / 'images' / (card_id + '.webp'), args.refresh)
            with Image.open(io.BytesIO(image_raw)) as image:
                image.load()
                result.update(imageStatus='decoded', imageDimensions=list(image.size), imageSha256=hashlib.sha256(image_raw).hexdigest())
                if min(image.size) < 200:
                    result['errors'].append('Unexpectedly small card image')
        except Exception as error:
            result['errors'].append(str(error))
            result.setdefault('imageStatus', 'unverified')
        return result

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        cards = list(executor.map(audit, source_set['cards']))
    hashes = {}
    for card in cards:
        if 'imageSha256' in card:
            hashes.setdefault(card['imageSha256'], []).append(card['id'])
    duplicated_images = [ids for ids in hashes.values() if len(ids) > 1]
    report = {'checkedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'setId': 'sv03.5', 'source': API + '/sets/sv03.5', 'officialChecklist': 'https://assets.pokemon.com/assets/cms2/pdf/trading-card-game/checklist/mew_web_cardlist_en.pdf', 'sourceSetCount': len(source_ids), 'storedSetCount': len(stored), 'missingDefinitions': sorted(source_ids - set(stored)), 'unexpectedDefinitions': sorted(set(stored) - source_ids), 'setErrors': set_errors, 'brokenImages': [c['id'] for c in cards if c['imageStatus'] != 'decoded'], 'missingImportantMetadata': [c['id'] for c in cards if c['missingMetadata']], 'invalidMappings': [{'id': c['id'], 'errors': c['errors']} for c in cards if c['errors']], 'duplicateImageBytes': duplicated_images, 'cards': cards}
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in report.items() if key != 'cards'}, indent=2), flush=True)
    if set_errors or report['brokenImages'] or report['invalidMappings'] or report['missingImportantMetadata'] or duplicated_images:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
