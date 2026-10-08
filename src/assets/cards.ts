import type { CardDefinition, OwnedCard, Product } from '../core/types';
import { slabPresentation } from './card-presentation';
import { CARD_BY_ID } from '../data/cards';
import { printImageStyle, printPaperStyle, inkDefectMarkup } from './misprint-presentation';
import { crackDamageMarkup } from './crack-damage-presentation';
import { damageClipStyle } from './card-damage-shape';
export const escapeHtml = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function cardArtwork(c: CardDefinition, owned?: OwnedCard) { return owned?.finish === 'metal' ? undefined : c.image; }
export function cardMarkup(c: CardDefinition, owned?: Pick<OwnedCard, 'finish'> & Partial<OwnedCard>, compact = false) {
  const image = owned?.finish === 'metal' ? undefined : compact ? c.imageSmall || c.image : c.image;
  const slab = owned ? slabPresentation(owned) : undefined;
  const graded = !!slab;
  return `<div class="tcg-card real-card ${compact ? 'compact' : ''} ${graded ? 'slab' : ''}" data-rarity="${escapeHtml(c.rarity)}"${slab ? ` data-grader="${slab.grader}" style="--slab-accent:${slab.style.accent};--slab-label:${slab.style.label};--slab-ink:${slab.style.ink};--slab-insert:${slab.style.insert}"` : ''}>${slab ? `<div class="slab-label"><b>${slab.grader}</b><span>${escapeHtml(c.name)} &middot; ${escapeHtml(c.number)}<small>${slab.cert ?? 'RIPIFY'} &middot; SIM</small>${slab.subgrades ? `<small>C ${slab.subgrades[0]} / CO ${slab.subgrades[1]} / E ${slab.subgrades[2]} / S ${slab.subgrades[3]}</small>` : ''}</span><strong>${slab.grade}</strong></div>` : ''}<div class="card-paper" style="${printPaperStyle(owned)}${damageClipStyle(owned)}">${image ? `<img class="exact-card-image image-loading" style="${printImageStyle(owned)}" src="${escapeHtml(image)}" alt="${escapeHtml(c.name + ' · ' + c.set + ' · ' + c.number)}" draggable="false" loading="${compact ? 'lazy' : 'eager'}" decoding="async" data-exact-image/>` : ''}${inkDefectMarkup(owned, image)}${crackDamageMarkup(owned)}<div class="missing-card-image"><b>${escapeHtml(c.name)}</b><span>${escapeHtml(c.set)} · ${escapeHtml(c.number)}</span><span>${escapeHtml(c.rarity)}</span><strong>${image ? 'Loading image…' : owned?.finish === 'metal' ? 'Metal card · image unavailable' : 'Image unavailable'}</strong></div></div>${owned ? `<span class="copy-finish">${owned.finish === 'reverse' ? 'Reverse holo' : owned.finish === 'metal' ? 'Metal' : owned.finish === 'holo' ? 'Holo' : ''}</span>` : ''}</div>`;
}
export function ownedMarkup(owned: OwnedCard, compact = false) { return cardMarkup(CARD_BY_ID.get(owned.cardId)!, owned, compact); }
export function packMarkup(p: Product, large = false) {
  return `<div class="foil-pack real-product ${large ? 'large' : ''} ${p.type !== 'booster' ? 'boxed-product' : ''} ${p.artwork ? 'has-artwork' : ''}" data-product="${p.code}" style="--pack-color:#a3aaa4;--pack-accent:#dce0d8"><div class="pack-crimp top"></div>${p.artwork ? `<img class="product-art-image image-loading" src="${escapeHtml(p.artwork)}" alt="${escapeHtml(p.name)}" draggable="false" decoding="async" data-exact-image/>` : ''}<div class="product-artwork-fallback"><div class="pack-set">${escapeHtml(p.name)}</div><span class="product-asset-unavailable">${p.artwork ? 'Loading artwork...' : 'Artwork unavailable'}</span><div class="pack-count">${escapeHtml(p.subtitle)}</div></div><div class="pack-crimp bottom"></div></div>`;
}
export function installImageFallback(root: HTMLElement) {
  root.querySelectorAll<HTMLImageElement>('img[data-exact-image]').forEach(img => {
    const missing = img.parentElement?.querySelector<HTMLElement>('.missing-card-image, .product-artwork-fallback');
    const fail = () => { img.hidden = true; if (missing) { missing.hidden = false; const status = missing.querySelector('strong, .product-asset-unavailable'); if (status) status.textContent = missing.classList.contains('product-artwork-fallback') ? 'Artwork unavailable' : 'Image unavailable'; } };
    const ready = async () => { try { await img.decode(); img.classList.remove('image-loading'); if (missing) missing.hidden = true; } catch { fail(); } };
    img.onerror = fail; img.onload = ready;
    if (img.complete) { if (img.naturalWidth === 0) fail(); else void ready(); }

  });
}
