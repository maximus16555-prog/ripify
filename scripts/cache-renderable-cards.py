"""Cache unchanged verified exact-printing scans for same-origin WebGL use.
Explicit maintenance command, never a runtime database/image preload.
"""
import concurrent.futures
import hashlib
import io
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
manifest_path = root / "src/data/verified/artwork.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
existing = {a["id"]: a for a in manifest["assets"] if a["kind"] == "card"}
cards = [c for file in ["151.json", "ascended-heroes.json"] for c in json.loads((root / "src/data/verified" / file).read_text(encoding="utf-8"))["cards"]]
def present(card):
    asset = existing.get(card['id'])
    if not asset: return False
    file = root / 'public' / asset['path'].lstrip('/')
    return file.exists() and hashlib.sha256(file.read_bytes()).hexdigest() == asset['sha256']
pending = [c for c in cards if c.get("image") and c["image"].startswith("https://assets.tcgdex.net/") and not present(c)]

def cache(card):
    url = card["image"]
    # Source identity is pinned in the repository; never select a scan by name.
    assert f'/{card["localId"]}/' in url and card["set"]["id"] in url
    for attempt in range(3):
        try:
            destination = root / 'public/artwork/cards' / f'{card["id"]}.webp'
            data = destination.read_bytes() if destination.exists() and card['id'] not in existing else urllib.request.urlopen(url, timeout=30).read()
            if card['id'] in existing: assert hashlib.sha256(data).hexdigest() == existing[card['id']]['sha256'], 'Upstream artwork changed; review required'
            image = Image.open(io.BytesIO(data)); image.verify()
            image = Image.open(io.BytesIO(data)); width, height = image.size
            assert width >= 400 and height > width and image.format in ('WEBP', 'PNG', 'JPEG'), (card['id'], width, height, image.format)
            path = f'/artwork/cards/{card["id"]}.webp'
            destination = root / "public" / path.lstrip("/")
            destination.parent.mkdir(parents=True, exist_ok=True); destination.write_bytes(data)
            return {"id": card["id"], "kind": "card", "path": path, "sourceUrl": url, "sourcePage": card["sourceUrl"], "sha256": hashlib.sha256(data).hexdigest(), "width": width, "height": height, "cachedAt": datetime.now(timezone.utc).isoformat()}
        except Exception:
            if attempt == 2: raise
            time.sleep(attempt + 1)

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
    results = list(executor.map(cache, pending))
updated = {a['id']: a for a in results}
manifest["assets"] = [updated.pop(a['id'], a) if a['kind'] == 'card' else a for a in manifest['assets']] + list(updated.values())
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(json.dumps({"cached": len(results), "bytes": sum((root / "public" / a["path"].lstrip("/")).stat().st_size for a in results), "artworkModified": False}))
