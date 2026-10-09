import './local-shop.css';
import { escapeHtml as esc, installImageFallback, ownedMarkup, packMarkup } from '../assets/cards';
import { CARD_BY_ID } from '../data/cards';
import { money, ownedValue } from '../core/economy';
import { gameTime } from '../core/computer-state';
import { localProducts, localStock, nextShopRestock, purchaseLocalProduct, shopProtection, shopWarning, automaticShopSelection, shopDuplicates, quoteShopCards, sellLocalCards, type ShopQuote } from '../core/local-shop';
import type { GameStore } from '../core/store';
import type { OwnedCard } from '../core/types';

export class LocalShop {
  private route: 'buy' | 'sell' | 'confirm' = 'buy';
  private selected = new Set<string>();
  private query = ''; private sort = 'low'; private rarity = ''; private kind = ''; private set = ''; private duplicates = false;
  private page = 0; private pending?: ShopQuote; private notice = ''; private busy = false;
  private tiles = new Map<string, HTMLElement>();
  private unsubscribe: () => void; private timer: number;
  constructor(private root: HTMLElement, private store: GameStore, private feedback: (s: string) => void) {
    this.unsubscribe = store.subscribe(() => { if (!this.busy) this.render(); });
    this.root.addEventListener('click', this.click); this.root.addEventListener('change', this.change);
    this.timer = window.setInterval(() => this.updateStock(), 1000); this.render();
  }
  dispose() { this.unsubscribe(); clearInterval(this.timer); this.root.removeEventListener('click', this.click); this.root.removeEventListener('change', this.change); this.tiles.clear(); }
  private pool() {
    const s = this.store.state, counts = new Map<string, number>(); for (const c of s.cards) counts.set(c.cardId, (counts.get(c.cardId) ?? 0) + 1);
    const values = new Map(s.cards.map(c => [c.uid, ownedValue(c, s.marketSeed)]));
    return s.cards.filter(c => { const d = CARD_BY_ID.get(c.cardId)!; return (!this.query || `${d.name} ${d.number}`.toLowerCase().includes(this.query.toLowerCase())) && (!this.rarity || d.rarity === this.rarity) && (!this.set || d.setCode === this.set) && (!this.kind || (this.kind === 'misprint' ? !!c.misprint : c.status === this.kind)) && (!this.duplicates || counts.get(c.cardId)! > 1); }).sort((a, b) => {
      const ad = CARD_BY_ID.get(a.cardId)!, bd = CARD_BY_ID.get(b.cardId)!;
      return this.sort === 'high' ? values.get(b.uid)! - values.get(a.uid)! : this.sort === 'low' ? values.get(a.uid)! - values.get(b.uid)! : this.sort === 'new' ? b.acquiredAt - a.acquiredAt : this.sort === 'old' ? a.acquiredAt - b.acquiredAt : this.sort === 'rarity' ? ad.rarity.localeCompare(bd.rarity) : ad.set.localeCompare(bd.set) || ad.name.localeCompare(bd.name);
    });
  }
  private render() {
    this.selected = new Set([...this.selected].filter(id => { const c = this.store.state.cards.find(c => c.uid === id); return c && !shopProtection(this.store, c); }));
    const old = this.tiles; this.tiles = new Map();
    this.root.innerHTML = `<div class="local-shop"><nav><button data-shop-action="buy" class="${this.route === 'buy' ? 'active' : ''}">Buy products</button><button data-shop-action="sell" class="${this.route !== 'buy' ? 'active' : ''}">Sell cards</button><span>Wallet $${money(this.store.state.currency)}</span></nav><p class="local-shop-note">${this.route === 'buy' ? 'Take your purchases home immediately. Sealed packs stay unopened.' : 'Instant guaranteed payment · 70–75% of current market value · eBay may return more, with a wait.'}</p><div data-shop-body></div><p role="status" data-shop-notice>${esc(this.notice)}</p></div>`;
    const body = this.root.querySelector<HTMLElement>('[data-shop-body]')!;
    if (this.route === 'confirm') { this.confirm(body); return; }
    if (this.route === 'buy') {
      body.innerHTML = `<div class="local-shop-products">${localProducts.map(p => `<article>${packMarkup(p)}<div><h3>${esc(p.name)}</h3><p>${esc(p.subtitle)}</p><b>$${money(p.physicalStorePrice)}</b><p data-local-stock="${p.code}"></p><button class="primary-button" data-shop-action="purchase" data-id="${p.code}">Buy sealed</button></div></article>`).join('')}</div><small data-shop-restock></small>`;
      installImageFallback(body); this.updateStock(); return;
    }
    const pool = this.pool(), pages = Math.max(1, Math.ceil(pool.length / 36)); this.page = Math.max(0, Math.min(this.page, pages - 1));
    const sets = [...new Map(this.store.state.cards.map(c => { const d = CARD_BY_ID.get(c.cardId)!; return [d.setCode, d.set]; }))];
    const options = (items: string[][], current: string) => items.map(([id, name]) => `<option value="${esc(id)}" ${id === current ? 'selected' : ''}>${esc(name)}</option>`).join('');
    body.innerHTML = `<div class="local-shop-filters"><input aria-label="Search shop sale cards" data-shop-filter="query" value="${esc(this.query)}" placeholder="Find a card"/><select aria-label="Sort sale cards" data-shop-filter="sort">${options([['high','Highest Value'],['low','Lowest Value'],['new','Newest'],['old','Oldest'],['rarity','Rarity'],['set','Set']], this.sort)}</select><select aria-label="Sale rarity" data-shop-filter="rarity">${options([['','All rarities'],['Common','Commons'],['Uncommon','Uncommons'],['Rare','Rares']],this.rarity)}</select><select aria-label="Sale card type" data-shop-filter="kind">${options([['','All cards'],['raw','Ungraded'],['graded','Graded'],['misprint','Misprints']],this.kind)}</select><select aria-label="Sale set" data-shop-filter="set">${options([['','All sets'],...sets],this.set)}</select><label><input type="checkbox" data-shop-filter="duplicates" ${this.duplicates ? 'checked' : ''}/>Duplicates</label></div><div class="local-shop-selection"><button data-shop-action="visible">Select All Visible</button><button data-shop-action="all">Select All Filtered (${pool.length})</button><button data-shop-action="duplicates">Select Duplicates</button><button data-shop-action="clear">Deselect All</button><span data-shop-count></span><button class="primary-button" data-shop-action="review">Review sale</button></div><small>Bulk selection skips graded, misprinted, valuable and displayed copies. Select these individually; favorites and transaction locks cannot be sold.</small><div class="local-shop-grid"></div><footer><span>${pool.length} matching cards</span><button data-shop-action="prev" ${this.page ? '' : 'disabled'}>Previous</button><span>${this.page + 1} / ${pages}</span><button data-shop-action="next" ${this.page + 1 < pages ? '' : 'disabled'}>Next</button></footer>`;
    const grid = body.querySelector('.local-shop-grid')!;
    for (const c of pool.slice(this.page * 36, (this.page + 1) * 36)) {
      const d = CARD_BY_ID.get(c.cardId)!, protection = shopProtection(this.store, c);
      let tile = old.get(c.uid);
      if (!tile) { tile = document.createElement('label'); tile.className = 'local-shop-card'; tile.innerHTML = `<input type="checkbox" data-sale-card="${c.uid}" aria-label="Select ${esc(d.name)} ${esc(d.number)}"/>${ownedMarkup(c,true)}<b>${esc(d.name)}</b><small>${esc(d.set)} #${esc(d.number)}</small><span data-value></span><small data-protection></small>`; installImageFallback(tile); }
      const input = tile.querySelector<HTMLInputElement>('input')!; input.checked = this.selected.has(c.uid); input.disabled = !!protection;
      tile.querySelector('[data-value]')!.textContent = `$${money(ownedValue(c, this.store.state.marketSeed))}`;
      tile.querySelector('[data-protection]')!.textContent = protection || (c.misprint ? 'Misprint · confirmation required' : shopWarning(c,this.store.state) ? 'Valuable · confirmation required' : c.status === 'graded' ? `${c.grader} ${c.grade}` : 'Raw');
      this.tiles.set(c.uid,tile); grid.append(tile);
    }
    this.selectionSummary();
  }
  private selectionSummary() {
    const quote = quoteShopCards(this.store,[...this.selected]);
    this.root.querySelector('[data-shop-count]')!.textContent = `${this.selected.size} selected${quote ? ` · offer $${money(quote.offer)}` : ''}`;
    this.root.querySelector<HTMLButtonElement>('[data-shop-action="review"]')!.disabled = !quote;
  }
  private updateStock() {
    if (this.route !== 'buy') return;
    for (const p of localProducts) { const count = localStock(this.store.state,p.code);
      const label = this.root.querySelector(`[data-local-stock="${p.code}"]`); if (label) label.textContent = `${count} in stock`;
      const b = this.root.querySelector<HTMLButtonElement>(`[data-id="${p.code}"]`); if (b) b.disabled = !count || this.store.state.currency < p.physicalStorePrice;
    }
    const time = this.root.querySelector('[data-shop-restock]'); if (time) time.textContent = `Next local restock: ${gameTime(nextShopRestock(this.store.state))} · every 4 in-game hours`;
  }
  private confirm(body: HTMLElement) {
    const q = this.pending!, cards = q.cards.map(i => this.store.state.cards.find(c => c.uid === i.uid)).filter((c): c is OwnedCard => !!c), warning = cards.some(c => shopWarning(c,this.store.state));
    body.innerHTML = `<section class="local-shop-confirm" role="alertdialog" aria-label="Confirm shop sale"><h2>Local Card Shop — Sell Cards</h2><dl><dt>Cards Selected</dt><dd>${q.cards.length}</dd><dt>Total Market Value</dt><dd>$${money(q.market)}</dd><dt>Shop Offer (${q.market ? (q.offer / q.market * 100).toFixed(1) : '70–75'}%)</dt><dd>$${money(q.offer)}</dd></dl><p>These exact copies leave your collection permanently. Payment is immediate.</p>${warning ? '<p class="local-shop-warning">WARNING: This selection contains valuable cards or misprints.</p><label><input data-special-confirm type="checkbox"/>I confirm selling these valuable / misprinted copies.</label>' : ''}<div><button data-shop-action="cancel">Cancel</button><button class="primary-button" data-shop-action="commit" ${warning ? 'disabled' : ''}>Sell ${q.cards.length} cards</button></div></section>`;
  }
  private change = (e: Event) => {
    const el = e.target as HTMLInputElement;
    if (el.matches('[data-special-confirm]')) { this.root.querySelector<HTMLButtonElement>('[data-shop-action="commit"]')!.disabled = !el.checked; return; }
    if (el.dataset.saleCard) { if (el.checked) this.selected.add(el.dataset.saleCard); else this.selected.delete(el.dataset.saleCard); this.selectionSummary(); return; }
    const f = el.dataset.shopFilter; if (!f) return;
    if (f === 'duplicates') this.duplicates = el.checked;
    else if (f === 'query' || f === 'sort' || f === 'rarity' || f === 'kind' || f === 'set') this[f] = el.value;
    this.page = 0; this.render();
  };
  private click = (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-shop-action]'); if (!b || b.disabled || this.busy) return;
    const action = b.dataset.shopAction;
    if (action === 'purchase') { this.busy = true; const ok = purchaseLocalProduct(this.store,b.dataset.id!); this.busy = false; this.notice = ok ? 'Purchased — added immediately to sealed inventory.' : this.store.warning ?? 'Stock or balance changed. Nothing purchased.'; if (ok) this.feedback(this.notice); }
    else if (action === 'buy' || action === 'sell') { this.route = action; this.notice = ''; }
    else if (action === 'clear') this.selected.clear();
    else if (action === 'visible' || action === 'all') { const pool = this.pool(); (action === 'visible' ? pool.slice(this.page * 36, (this.page + 1) * 36) : pool).filter(c => automaticShopSelection(this.store,c)).forEach(c => this.selected.add(c.uid)); this.notice = 'Protected and special copies were skipped.'; }
    else if (action === 'duplicates') { const duplicates = shopDuplicates(this.store); this.selected = new Set(this.pool().filter(c => duplicates.has(c.uid)).map(c => c.uid)); this.notice = 'At least one copy of every exact printing is kept.'; }
    else if (action === 'prev') this.page--; else if (action === 'next') this.page++;
    else if (action === 'review') { this.pending = quoteShopCards(this.store,[...this.selected]) ?? undefined; if (this.pending) this.route = 'confirm'; }
    else if (action === 'cancel') this.route = 'sell';
    else if (action === 'commit') { this.busy = true; const ok = sellLocalCards(this.store,this.pending!,!!this.root.querySelector<HTMLInputElement>('[data-special-confirm]')?.checked); this.busy = false; this.route = 'sell'; this.pending = undefined; this.notice = ok ? 'Sold — payment received.' : this.store.warning ?? 'Selection or market changed. Review a fresh offer; nothing sold.'; if (ok) { this.selected.clear(); this.feedback(this.notice); } }
    if (action === 'visible' || action === 'all' || action === 'duplicates' || action === 'clear') {
      this.root.querySelectorAll<HTMLInputElement>('[data-sale-card]').forEach(i => { i.checked = this.selected.has(i.dataset.saleCard!); });
      this.selectionSummary(); this.root.querySelector('[data-shop-notice]')!.textContent = this.notice; return;
    }
    this.render();
  };
}
