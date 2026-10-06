"""Cache the supported real products and 8 exact SVE Energy scans.

Explicit development command; never fetches metadata or the full card database
at game startup. Original images are retained without generating replacements.
"""
import hashlib
import io
import json
import time
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'public/artwork'
DEST.mkdir(parents=True, exist_ok=True)
assets = []

def cache(identity, kind, url, page):
    path = DEST / (identity + '.jpg')
    if path.exists():
        raw = path.read_bytes()
    else:
        with urllib.request.urlopen(url, timeout=30) as response:
            if not response.headers.get('Content-Type', '').startswith('image/'):
                raise ValueError('Non-image response: ' + url)
            raw = response.read()
        time.sleep(.25)
    with Image.open(io.BytesIO(raw)) as image:
        image.verify()
    with Image.open(io.BytesIO(raw)) as image:
        width, height = image.size
    if min(width, height) < 400:
        raise ValueError('Unexpected image dimensions: ' + identity)
    path.write_bytes(raw)
    assets.append({'id': identity, 'kind': kind, 'path': '/artwork/' + path.name,
                   'sourceUrl': url, 'sourcePage': page,
                   'sha256': hashlib.sha256(raw).hexdigest(), 'width': width, 'height': height})
    print(identity, width, height, len(raw), flush=True)

for identity, product_id, slug in [
    ('151-booster', 504467, '151-booster-pack'),
    ('151-etb', 503313, '151-elite-trainer-box'),
    ('151-upc', 502005, '151-ultra-premium-collection'),
]:
    cache(identity, 'product', f'https://product-images.tcgplayer.com/fit-in/1000x1000/{product_id}.jpg',
          f'https://www.tcgplayer.com/product/{product_id}/pokemon-sv-scarlet-and-violet-151-{slug}')

cache('ascended-heroes-booster', 'product',
      'https://product-images.tcgplayer.com/fit-in/1000x1000/672434.jpg',
      'https://www.tcgplayer.com/product/672434/pokemon-me-ascended-heroes-ascended-heroes-booster-pack')

for number, symbol in enumerate(['g', 'r', 'w', 'l', 'p', 'f', 'd', 'm'], 1):
    page = f'https://pkmncards.com/card/basic-{symbol}-energy-scarlet-violet-energy-sve-{number:03}/'
    url = f'https://pkmncards.com/wp-content/uploads/sve_en_{number:03}.jpg'
    # Verify the exact card page actually links this scan, rather than assuming
    # that the filename convention points to the correct printing.
    with urllib.request.urlopen(page, timeout=30) as response:
        if url not in response.read().decode('utf-8'):
            raise ValueError('Scan is not linked by its exact card page: ' + page)
    cache(f'sve-{number}', 'card', url, page)

manifest = {'retrievedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'notice': 'Original copyrighted Pokemon imagery; source access does not grant artwork ownership or a redistribution license.',
            'assets': assets}
(ROOT / 'src/data/verified/artwork.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
