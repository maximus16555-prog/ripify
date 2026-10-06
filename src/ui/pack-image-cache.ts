import { cardArtwork } from '../assets/cards';
import { CARD_BY_ID } from '../data/cards';
import type { Opening } from '../core/types';

/** Decoded image elements are retained only for copies in the active pack. */
export class PackImageCache {
  readonly images = new Map<string, { image: HTMLImageElement; status: 'pending' | 'ready' | 'failed' }>();
  private copies = new Map<number, { image: HTMLImageElement; status: 'pending' | 'ready' | 'failed' }>();
  ready = false;
  readonly settled: Promise<void>;
  private cancel = new Set<() => void>();
  constructor(opening: Opening) {
    // Keep the decoded image ELEMENT for every copy, so revealing it never needs
    // a second download or decode—even if the HTTP cache is disabled/evicted.
    const pending = opening.cards.map((c, index) => {
      const url = cardArtwork(CARD_BY_ID.get(c.cardId)!, c);
      return url ? this.load(url, index) : Promise.resolve();
    });
    this.settled = Promise.all(pending).then(() => { this.ready = true; });
  }
  private load(url: string, index: number): Promise<void> {
    return new Promise(resolve => {
      const image = new Image(); image.decoding = 'async';
      const entry = { image, status: 'pending' as 'pending' | 'ready' | 'failed' }; this.copies.set(index, entry); if (!this.images.has(url)) this.images.set(url, entry);
      let done = false;
      const finish = (ok: boolean) => { if (done) return; done = true; clearTimeout(timeout); this.cancel.delete(abort); image.onload = image.onerror = null; entry.status = ok ? 'ready' : 'failed'; resolve(); };
      const abort = () => { finish(false); image.removeAttribute('src'); };
      const timeout = window.setTimeout(abort, 10000); this.cancel.add(abort);
      image.onerror = () => finish(false);
      image.onload = () => { void image.decode().then(() => finish(true), () => finish(false)); };
      image.src = url;
    });
  }
  apply(root: HTMLElement) {
    root.querySelectorAll<HTMLImageElement>('img[data-exact-image]').forEach(img => {
      const owner = img.closest<HTMLElement>('[data-index]');
      const entry = owner ? this.copies.get(Number(owner.dataset.index)) : undefined; if (!entry || entry.status === 'pending') return;
      const missing = img.parentElement?.querySelector<HTMLElement>('.missing-card-image');
      if (entry.status === 'ready') {
        const decoded = entry.image; decoded.alt = img.alt; decoded.className = img.className.replace('image-loading', ''); decoded.style.cssText = img.style.cssText; decoded.draggable = false; decoded.loading = 'eager'; decoded.setAttribute('data-exact-image','');
        img.replaceWith(decoded); if (missing) missing.hidden = true;
      }
      else { img.onload = img.onerror = null; img.removeAttribute('src'); img.hidden = true; if (missing) { missing.hidden = false; missing.querySelector('strong')!.textContent = 'Image unavailable'; } }
    });
  }
  dispose() { this.cancel.forEach(fn => fn()); this.cancel.clear(); this.copies.forEach(entry => { entry.image.onload = entry.image.onerror = null; entry.image.removeAttribute('src'); }); this.copies.clear(); this.images.clear(); }
}
