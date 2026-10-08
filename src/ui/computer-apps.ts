import { CardCleanup } from './card-cleanup';
import { CARD_BY_ID } from '../data/cards';
import { PRODUCT_BY_ID } from '../data/products';
import { GRADERS, gradeMultiplier, money, rawValue, ownedRawMarketValue, ownedValue } from '../core/economy';
import { collectionItems, marketHistory, portfolioValue, searchCards, stock, verifiedOnlineProducts, type ComputerServices } from '../core/computer';
import { activeListing, gameDate, gameTime, type ItemKind } from '../core/computer-state';
import { gradedPopulation } from '../core/population';
import { orderStatus, type GameStore } from '../core/store';
import type { Grader } from '../core/types';
import { cardMarkup, escapeHtml as esc, installImageFallback, ownedMarkup } from '../assets/cards';
import { CardInspector } from './card-inspector';
export type AppId = 'store' | 'ebay' | 'grading' | 'collectr';
export const APPS: Record<AppId, { title: string; symbol: string; color: string }> = { store: { title: 'Pokémon Store', symbol: '◓', color: '#bc5348' }, ebay: { title: 'eBay', symbol: 'e', color: '#366ac4' }, grading: { title: 'Grading', symbol: '▥', color: '#99825c' }, collectr: { title: 'Collectr', symbol: '', color: '#58a69a' } };
const empty = (text: string) => `<p class="pc-empty">${text}</p>`;
const price = (value: number) => `$${money(value)}`;
const button = (action: string, text: string, value = '', disabled = false) => `<button type="button" data-action="${action}" data-value="${esc(value)}" ${disabled ? 'disabled' : ''}>${text}</button>`;
export class ComputerApp {
  route = 'home'; selected = ''; query = ''; filter = 'all'; sort = 'value'; page = 0; range = '1M';
  cart: Record<string, number> = {}; grader: Grader = 'PSA'; service: 'Standard' | 'Express' = 'Standard';
  give: string[] = []; receive: string[] = []; notice = '';
  private cleanup?: CardCleanup;
  private inspector?: CardInspector;
  constructor(public id: AppId, private store: GameStore, private services: ComputerServices, private refresh: () => void) {}
  suspend() { this.cleanup?.dispose(); this.cleanup = undefined; this.inspector?.dispose(); this.inspector = undefined; }
  private nav(entries: [string, string][]) { return `<nav class="pc-app-nav">${entries.map(([id, label]) => button('route', label, id)).join('')}</nav>`; }
  private tile(i: ReturnType<typeof collectionItems>[number]) {
    const c = this.store.state.cards.find(c => c.uid === i.uid);
    return `<button class="pc-item" data-action="item" data-value="${i.uid}">${c ? ownedMarkup(c, true) : `<img src="${esc(i.image ?? '')}" alt="${esc(i.name)}" loading="lazy"/>`}<b>${esc(i.name)}</b><small>${esc(i.set)} ${esc(i.number)}</small><span>${c?.grade ? `${c.grader} ${c.grade}` : i.status === 'sealed' ? 'Sealed' : 'Raw'} ${i.misprint ? '<em>MISPRINT</em>' : ''} ${activeListing(this.store.state, i.uid) ? '<em>LISTED</em>' : ''}</span><strong>${price(i.value)}</strong></button>`;
  }
  render(root: HTMLElement) {
    this.suspend();
    root.className = `pc-app-content pc-${this.id}`;
    root.innerHTML = `${this.notice ? `<p class="pc-notice" role="status">${esc(this.notice)}</p>` : ''}${this.id === 'store' ? this.storeView() : this.id === 'ebay' ? this.ebayView() : this.id === 'grading' ? this.gradingView() : this.collectrView()}`;
    installImageFallback(root);
    root.onclick = e => { const b = (e.target as Element).closest<HTMLButtonElement>('button[data-action]'); if (b && !b.disabled) this.action(b.dataset.action!, b.dataset.value ?? '', root); };
    root.onchange = e => { const el = e.target as HTMLInputElement; if (el.dataset.field === 'filter') { this.filter = el.value; this.page = 0; this.refresh(); } else if (el.dataset.field === 'sort') { this.sort = el.value; this.page = 0; this.refresh(); } else if (el.dataset.field === 'service') { this.service = el.value as 'Standard' | 'Express'; this.refresh(); } };
    const search = root.querySelector<HTMLInputElement>('[data-search]');
    if (search) search.oninput = () => { this.query = search.value; this.page = 0; this.refresh(); const next = root.querySelector<HTMLInputElement>('[data-search]'); next?.focus(); next?.setSelectionRange(this.query.length, this.query.length); };
    const physical = root.querySelector<HTMLElement>('[data-physical]'), owned = this.store.state.cards.find(c => c.uid === this.selected);
    if (physical && owned) this.inspector = new CardInspector(physical, owned);
    const cleanup = root.querySelector<HTMLElement>('[data-card-cleanup]');
    if (cleanup) this.cleanup = new CardCleanup(cleanup, this.store, () => { this.route = 'collection'; this.refresh(); }, this.route === 'deleteCard' ? this.selected : undefined);
    if (this.id === 'collectr' && physical && owned) {
      const remove = document.createElement('button'); remove.textContent = 'Delete card'; remove.dataset.action = 'deleteCard'; remove.dataset.value = owned.uid;
      const protection = this.store.deletionProtection(owned.uid); remove.disabled = !!protection; remove.title = protection; root.append(remove);
    }
  }
  private storeView() {
    const s = this.store.state, c = s.computer!, before = c.minute % 1440 < 570;
    const count = Object.values(this.cart).reduce((n, q) => n + q, 0);
    const header = `<header class="pc-site-header store-header"><b>Pokémon <span>Store</span></b><small>RIPIFY simulated storefront</small><span>Wallet ${price(s.currency)}</span></header>${this.nav([['home', 'Products'], ['cart', `Cart (${count})`], ['orders', 'Your orders']])}`;
    if (this.route === 'orders') return header + `<h2>Your orders</h2>${c.orders.length ? [...c.orders].reverse().map(o => `<article class="pc-order"><b>Order ${o.uid.slice(0, 8)}</b><span>${o.status === 'DELIVERED' ? (s.shippingPackages?.some(p => p.source === 'store' && p.orderUids.includes(o.uid) && p.stage !== 'claimed') ? 'Delivered - box by bedroom door' : 'Collected') : 'Shipping'} · ${price(o.total)}</span><small>${o.items.map(i => esc(PRODUCT_BY_ID.get(i.productId)!.name)).join(' · ')}</small>${o.status === 'SHIPPING' ? `<small data-due="${o.due}">Arrives ${gameDate(o.due)}</small>` : ''}</article>`).join('') : empty('No orders yet.')}`;
    if (this.route === 'cart') {
      const total = Object.entries(this.cart).reduce((n, [id, q]) => n + PRODUCT_BY_ID.get(id)!.onlineDropPrice * q, 0);
      return header + `<h2>Your cart</h2>${count ? Object.entries(this.cart).filter(([, q]) => q > 0).map(([id, q]) => { const p = PRODUCT_BY_ID.get(id)!; return `<article class="pc-cart-row"><img src="${p.artwork}" alt="${esc(p.name)}"/><div><b>${esc(p.name)}</b><small>${q} × ${price(p.onlineDropPrice)}</small></div>${button('minus', '−', id)}<span>${q}</span>${button('plus', '+', id, stock(s, id) <= q)}<strong>${price(q * p.onlineDropPrice)}</strong></article>`; }).join('') + `<div class="pc-checkout"><strong>Total ${price(total)}</strong><p>In-game currency only · delivery in one game hour. Products arrive sealed.</p>${button('checkout', 'Place order', '', before || total > s.currency)}</div>` : empty('Your cart is empty.')}`;
    }
    if (this.route === 'product') {
      const p = PRODUCT_BY_ID.get(this.selected)!;
      return header + `<div class="pc-product-page"><img src="${p.artwork}" alt="${esc(p.name)}"/><div><small>${esc(p.subtitle)}</small><h2>${esc(p.name)}</h2><strong class="pc-price">${price(p.onlineDropPrice)}</strong><p>${before ? 'DROP AT 9:30 AM' : stock(s, p.code) ? `${stock(s, p.code)} in stock` : 'SOLD OUT'}</p>${button('plus', 'Add to cart', p.code, !stock(s, p.code))}<h3>Verified contents</h3><ul>${p.type === 'booster' ? '<li>10 cards and 1 Basic Energy from this set’s supported pool</li>' : p.manifest.packs.map(i => `<li>${i.quantity} × ${esc(PRODUCT_BY_ID.get(i.productId)!.name)}</li>`).join('') + p.manifest.cards.map(i => `<li>${i.quantity} × ${esc(CARD_BY_ID.get(i.cardId)!.name)} #${esc(CARD_BY_ID.get(i.cardId)!.number)}${i.finish === 'metal' ? ' (metal)' : ''}</li>`).join('')}</ul></div></div>`;
    }
    return header + `<div class="pc-store-banner"><small>ONLINE RELEASES</small><h2>Something worth opening.</h2><p>${before ? 'Today’s drop opens at 9:30 AM' : 'Daily drop · limited stock'} · ${gameTime(c.minute)}</p></div><div class="pc-product-grid">${verifiedOnlineProducts.map(p => `<article>${button('product', `<img src="${p.artwork}" alt="${esc(p.name)}" loading="lazy"/><b>${esc(p.name)}</b><small>${esc(p.subtitle)}</small>`, p.code)}<strong>${price(p.onlineDropPrice)}</strong><span>${before ? 'DROP AT 9:30 AM' : stock(s, p.code) ? `${stock(s, p.code)} available` : 'SOLD OUT'}</span>${button('plus', 'Add to cart', p.code, !stock(s, p.code))}</article>`).join('')}</div>`;
  }
  private ebayView() {
    const s = this.store.state;
    const header = `<header class="pc-site-header"><b class="pc-ebay-logo"><i>e</i><i>b</i><i>a</i><i>y</i></b><span>Seller Hub</span><small>Simulated RIPIFY marketplace</small></header>${this.nav([['home', 'Sell an item'], ['listings', 'Listings & offers']])}`;
    if (this.route === 'listings') return header + `<h2>Your listings</h2>${s.computer!.listings.length ? [...s.computer!.listings].reverse().map(l => `<article class="pc-listing"><img src="${esc(l.image ?? '')}" alt="${esc(l.name)}" loading="lazy"/><div><b>${esc(l.name)}</b><span class="pc-badge">${l.status}</span><small>${l.kind === 'card' ? 'Trading card' : 'Sealed product'} · Asking ${price(l.asking)}${l.status === 'SOLD' ? ` · Sold ${price(l.paid!)}` : ''}</small>${l.status === 'OFFER' ? `<strong>Offer ${price(l.offer)}</strong>${button('accept', 'Accept offer', l.uid)}` : ''}${['LISTED', 'WATCHING', 'OFFER'].includes(l.status) ? button('cancelListing', 'End listing', l.uid) : ''}</div></article>`).join('') : empty('No listings yet.')}`;
    const item = collectionItems(s).find(i => i.uid === this.selected);
    if (this.route === 'item' && item) {
      const card = s.cards.find(c => c.uid === item.uid), locked = !!activeListing(s, item.uid) || (card && (this.store.isCardLocked(card.uid) || s.displays.includes(card.uid)));
      return header + `<h2>Create your listing</h2><div class="pc-product-page"><div>${card ? ownedMarkup(card) : `<img src="${esc(item.image ?? '')}" alt="${esc(item.name)}"/>`}</div><div><h3>${esc(item.name)}</h3><p>${esc(item.set)} · ${esc(item.number)}</p><dl><dt>Condition</dt><dd>${card ? card.status === 'graded' ? 'Graded' : card.crackHistory?.some(e => e.outcome === 'damaged') ? 'Damaged · slab removal damage' : 'Ungraded · inspect physical copy' : 'Sealed'}</dd>${card?.grader ? `<dt>Professional grader</dt><dd>${card.grader}-inspired</dd><dt>Grade</dt><dd>${card.grade}</dd>` : ''}${card?.misprint ? '<dt>Manufacturing error</dt><dd>MISPRINT · persistent physical defect</dd>' : ''}<dt>RIPIFY market value</dt><dd>${price(item.value)}</dd></dl><label>Asking price <input data-asking type="number" min="0.01" max="1000000000" step="0.01" value="${item.value}"/></label>${button('list', 'Create listing', item.uid, !!locked)}${locked ? '<p>Remove from display or resolve its existing ownership lock first.</p>' : '<p>Listed items are locked until sold or the listing ends.</p>'}</div></div>`;
    }
    return header + `<h2>What would you like to sell?</h2><p>Raw cards, slabs, misprints and sealed products from your collection.</p><div class="pc-card-grid">${collectionItems(s).slice(this.page * 36, (this.page + 1) * 36).map(i => this.tile(i)).join('') || empty('Open a pack or buy a product first.')}</div>${this.pagination(collectionItems(s).length)}`;
  }
  private gradingView() {
    const s = this.store.state, g = GRADERS[this.grader];
    const header = `<header class="pc-site-header"><b>Grading</b><span>RIPIFY simulated services</span></header>${this.nav([['home', 'Submit a card'], ['orders', 'Submissions'], ['returns', 'Returned cards']])}`;
    if (this.route === 'orders') return header + `<h2>Submissions</h2>${s.orders.map(o => `<article class="pc-order"><b>${esc(CARD_BY_ID.get(s.cards.find(c => c.uid === o.cardUid)!.cardId)!.name)}</b><span>${o.grader} · ${o.service} · ${orderStatus(o.sentAt, o.dueAt)}</span><small>${Math.max(0, Math.ceil((o.dueAt - Date.now()) / 1000))} seconds remaining</small>${o.dueAt <= Date.now() ? '<small>Shipping box waiting by the bedroom door</small>' : ''}</article>`).join('') || empty('No submissions in progress.')}`;
    if (this.route === 'returns' || this.route === 'physical') return header + (this.route === 'physical' ? `<div data-physical class="pc-physical"></div><p>${price(ownedValue(s.cards.find(c => c.uid === this.selected)!, s.marketSeed))} · same owned copy, in its physical slab</p>` : `<h2>Returned cards</h2><div class="pc-card-grid">${collectionItems(s).filter(i => i.status === 'graded').map(i => this.tile(i)).join('') || empty('Your returned slabs will appear here.')}</div>`);
    const eligible = collectionItems(s).filter(i => i.status === 'raw' && !this.store.isCardLocked(i.uid) && s.cards.find(c => c.uid === i.uid)!.finish !== 'metal');
    const card = s.cards.find(c => c.uid === this.selected && c.status === 'raw');
    return header + `<h2>Choose a grading service</h2><div class="pc-graders">${(Object.keys(GRADERS) as Grader[]).map(id => `<button type="button" data-action="grader" data-value="${id}" class="${id === this.grader ? 'selected' : ''}"><b>${id}-inspired</b><span>${price(GRADERS[id].cost)} · ~${GRADERS[id].seconds}s</span><small>${id === 'BGS' ? 'Subgrades · half-point scale' : id === 'CGC' ? 'Half-point scale' : id === 'TAG' ? 'Consistent condition analysis' : 'Whole-point scale'}</small></button>`).join('')}</div><label>Service <select data-field="service"><option ${this.service === 'Standard' ? 'selected' : ''}>Standard</option><option ${this.service === 'Express' ? 'selected' : ''}>Express</option></select></label>${card ? `<section class="pc-review"><h3>Review submission</h3><b>${esc(CARD_BY_ID.get(card.cardId)!.name)}</b><p>${this.grader}-inspired · ${this.service} · ${price(g.cost * (this.service === 'Express' ? 1.8 : 1))} · ~${Math.ceil(g.seconds * (this.service === 'Express' ? .4 : 1))}s</p><p>The same physical card is graded. Hidden condition scores are not disclosed.</p>${button('submit', 'Pay & submit', card.uid, this.store.isCardLocked(card.uid) || card.finish === 'metal' || s.currency < g.cost * (this.service === 'Express' ? 1.8 : 1))}</section>` : ''}<h3>Eligible owned cards</h3><div class="pc-card-grid">${eligible.slice(this.page * 36, (this.page + 1) * 36).map(i => this.tile(i)).join('') || empty('No eligible raw cards.')}</div>${this.pagination(eligible.length)}`;
  }
  private chart(points: { at: number; value: number }[], calendar = false) {
    if (points.length < 2) return empty('History starts with your collection. More points appear as you play.');
    const lo = Math.min(...points.map(p => p.value)), hi = Math.max(...points.map(p => p.value)), path = points.map((p, i) => `${i ? 'L' : 'M'}${20 + i * 660 / (points.length - 1)},${160 - (p.value - lo) / Math.max(1, hi - lo) * 140}`).join(' ');
    return `<svg class="pc-chart" viewBox="0 0 700 185" role="img" aria-label="RIPIFY simulated value history"><path d="${path} L680,180 L20,180 Z" fill="#70b5aa" opacity=".15"/><path d="${path}" fill="none" stroke="#4ca294" stroke-width="2.5"/>${points.map((p, i) => `<circle cx="${20 + i * 660 / (points.length - 1)}" cy="${160 - (p.value - lo) / Math.max(1, hi - lo) * 140}" r="9" fill="transparent" tabindex="0"><title>${calendar ? new Date(p.at).toLocaleDateString('en-US') : gameDate(p.at)} · ${price(p.value)}</title></circle>`).join('')}</svg>`;
  }
  private collectrView() {
    const s = this.store.state, items = collectionItems(s), total = portfolioValue(s);
    const header = `<header class="pc-site-header"><b class="pc-collectr-brand"><img src="/computer/collectr.png" alt=""/>Collectr</b><small>RIPIFY collection · simulated market</small></header>${this.nav([['home', 'Overview'], ['collection', 'Collection'], ['search', 'Search'], ['trade', 'Trade Analyzer']])}`;
    if (['cleanup', 'deleteCard'].includes(this.route)) return header + '<div data-card-cleanup></div>';
    if (this.route === 'card') {
      const d = CARD_BY_ID.get(this.selected)!;
      const days = ({ '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365, ALL: 365 } as Record<string, number>)[this.range];
      const owned = s.cards.filter(c => c.cardId === d.id), allTime = new Set((s.packReceipts ?? []).flatMap(r => r.cards.filter(c => c.cardId === d.id).map(c => c.uid)).concat(owned.map(c => c.uid), (s.cardDisposals ?? []).flatMap(r => r.cards.filter(c => c.cardId === d.id).map(c => c.uid)))).size;
      const sales = s.computer!.listings.filter(l => l.status === 'SOLD' && l.cardId === d.id);
      return header + `<div class="pc-card-page"><div>${cardMarkup(d)}</div><section><small>${esc(d.set)} · #${esc(d.number)} · ${esc(d.rarity)}</small><h2>${esc(d.name)}</h2><span>Current raw value</span><strong class="pc-price">${price(rawValue(d, s.marketSeed))}</strong><p>${owned.length} owned ${owned.some(c => c.misprint) ? '· includes MISPRINT' : ''}</p>${this.chart(marketHistory(d.id, s.marketSeed, days), true)}<nav class="pc-ranges">${['1D', '1W', '1M', '3M', '1Y', 'ALL'].map(r => button('range', r, r)).join('')}</nav><small>Historical samples of RIPIFY’s existing simulated price model. ALL = available one-year model window; not real-world sales.</small></section></div><h3>Compare grades</h3><div class="pc-grade-prices">${(Object.keys(GRADERS) as Grader[]).flatMap(g => [8, 9, 10].map(n => `<span>${g} ${n}<b>${price(rawValue(d, s.marketSeed) * gradeMultiplier(n) * GRADERS[g].premium)}</b></span>`)).join('')}</div><h3>RIPIFY population</h3><p>Local simulated population · current / all-time distinct copies</p><div class="pc-counts"><span>Raw <b>${owned.filter(c => c.status === 'raw').length}</b></span><span>Graded <b>${owned.filter(c => c.status === 'graded').length}</b></span><span>Misprints <b>${owned.filter(c => c.misprint).length}</b></span><span>Recorded copies <b>${allTime}</b></span>${(Object.keys(GRADERS) as Grader[]).map(g => { const pop = gradedPopulation(s, d.id, g, 10); return `<span>${g} 10 <b>${pop.current} / ${pop.allTime}</b></span>`; }).join('')}</div><h3>Your physical copies</h3>${owned.map(c => `<p>${c.uid.slice(0, 8)} · ${c.status}${c.grade ? ` · ${c.grader} ${c.grade}` : ''} · ${price(ownedValue(c, s.marketSeed))}${c.misprint ? ` · MISPRINT raw ${price(ownedRawMarketValue(c, s.marketSeed))}` : ''} · ${c.gradingHistory?.length ?? 0} previous grading records${button('physical', 'Inspect copy', c.uid)}</p>`).join('') || empty('You do not own this printing yet.')}<h3>Recent RIPIFY sales</h3>${sales.map(l => `<p>${gameDate(l.completed!)} · ${price(l.paid!)}</p>`).join('') || empty('No recorded sales of this printing.')}`;
    }
    if (this.route === 'ownedProduct') {
      const item = items.find(i => i.uid === this.selected);
      return header + (item ? `<div class="pc-product-page"><img src="${esc(item.image ?? '')}" alt="${esc(item.name)}"/><section><h2>${esc(item.name)}</h2><p>Sealed owned instance &middot; ${item.uid.slice(0, 8)}</p><strong class="pc-price">${price(item.value)}</strong><p>Visit the opening desk when you choose to open this product.</p></section></div>` : empty('This item is no longer owned.'));
    }
    if (this.route === 'physical') return header + (s.cards.some(c => c.uid === this.selected) ? `<div data-physical class="pc-physical"></div>${button('backCard', 'Back to card page')}` : empty('This card is no longer owned.'));
    if (this.route === 'search') {
      const results = this.query.trim() ? searchCards(this.query) : [];
      return header + `<h2>Find a collectible</h2><input data-search placeholder="Search name, set or card number" value="${esc(this.query)}"/><p>${results.length} supported real printings${this.query ? '' : ' · start typing to search'}</p><div class="pc-card-grid">${results.slice(this.page * 36, (this.page + 1) * 36).map(d => `<button class="pc-item" data-action="card" data-value="${d.id}">${cardMarkup(d, undefined, true)}<b>${esc(d.name)}</b><small>${esc(d.set)} · ${esc(d.number)}</small><span>${esc(d.rarity)}</span><strong>${price(rawValue(d, s.marketSeed))}</strong></button>`).join('')}</div>${this.pagination(results.length)}`;
    }
    if (this.route === 'trade') {
      const give = this.give.map(uid => items.find(i => i.uid === uid)).filter(i => !!i), receive = this.receive.map(id => CARD_BY_ID.get(id)!).filter(Boolean), a = give.reduce((n, i) => n + i!.value, 0), b = receive.reduce((n, d) => n + rawValue(d, s.marketSeed), 0);
      return header + `<h2>Trade Analyzer</h2><p>Value comparison only. No trade or transfer will be executed.</p><div class="pc-trade"><section><h3>You give · ${price(a)}</h3>${give.map(i => `<p>${esc(i!.name)} ${button('removeGive', 'Remove', i!.uid)}</p>`).join('')}<select data-give><option value="">Choose an owned item</option>${items.filter(i => !this.give.includes(i.uid)).map(i => `<option value="${i.uid}">${esc(i.name)} · ${price(i.value)}</option>`).join('')}</select>${button('give', 'Add owned item')}</section><section><h3>You receive · ${price(b)}</h3>${receive.map((d, i) => `<p>${esc(d.name)} #${esc(d.number)} ${button('removeReceive', 'Remove', String(i))}</p>`).join('')}<input data-trade-query placeholder="Search a real card"/><select data-receive></select>${button('receiveTrade', 'Add raw printing')}</section></div><div class="pc-review">${!a && !b ? 'Choose items on both sides.' : `${price(Math.abs(b - a))} ${b > a ? 'more value received' : b < a ? 'more value given' : 'difference · balanced'}`}</div>`;
    }
    if (this.route === 'collection') {
      const filtered = items.filter(i => this.filter === 'all' || this.filter === 'raw' && i.status === 'raw' || this.filter === 'graded' && i.status === 'graded' || this.filter === 'sealed' && i.status === 'sealed' || this.filter === 'misprints' && i.misprint);
      filtered.sort((a, b) => this.sort === 'value' ? b.value - a.value : this.sort === 'newest' ? b.at - a.at : this.sort === 'oldest' ? a.at - b.at : this.sort === 'grade' ? b.grade - a.grade : this.sort === 'set' ? a.set.localeCompare(b.set) : this.sort === 'rarity' ? a.rarity.localeCompare(b.rarity) : a.name.localeCompare(b.name));
      return header + `<h2>Your collection</h2>${button('route', 'Select / Bulk manage', 'cleanup')}<div class="pc-filters"><select data-field="filter">${['all', 'raw', 'graded', 'sealed', 'misprints'].map(f => `<option value="${f}" ${this.filter === f ? 'selected' : ''}>${f.toUpperCase()}</option>`).join('')}</select><select data-field="sort">${['value', 'newest', 'oldest', 'name', 'set', 'rarity', 'grade'].map(f => `<option value="${f}" ${this.sort === f ? 'selected' : ''}>${f}</option>`).join('')}</select><span>${filtered.length} owned instances</span></div><div class="pc-card-grid">${filtered.slice(this.page * 36, (this.page + 1) * 36).map(i => this.tile(i)).join('') || empty('No items match this filter.')}</div>${this.pagination(filtered.length)}`;
    }
    const history = s.computer!.portfolio, gain = total - (history[0]?.value ?? total), movers = items.filter(i => i.cardId).map(i => { const d = CARD_BY_ID.get(i.cardId)!; const prev = rawValue(d, s.marketSeed, Date.now() - 86400000), current = rawValue(d, s.marketSeed); return { ...i, delta: (current / Math.max(.01, prev) - 1) * 100 }; });
    const list = (rows: typeof movers) => rows.slice(0, 4).map(i => `<div class="pc-mover">${button('card', esc(i.name), i.cardId)}<span>${i.delta > 0 ? '+' : ''}${i.delta.toFixed(2)}%</span></div>`).join('') || empty('No market movers in your collection.');
    return header + `<section class="pc-portfolio"><small>Portfolio: Main</small><h2>Total portfolio value</h2><strong>${price(total)}</strong><span>${gain >= 0 ? '+' : '−'}${price(Math.abs(gain))} since tracking began · includes collection changes</span>${this.chart(history.filter(p => this.range === 'ALL' || p.at >= s.computer!.minute - ({ '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365 } as Record<string, number>)[this.range] * 1440))}<nav class="pc-ranges">${['1D', '1W', '1M', '3M', '1Y', 'ALL'].map(r => button('range', r, r)).join('')}</nav><small>Observed collection values saved during gameplay</small></section><div class="pc-counts"><span>Total items<b>${items.length}</b></span><span>Raw cards<b>${items.filter(i => i.status === 'raw').length}</b></span><span>Graded cards<b>${items.filter(i => i.status === 'graded').length}</b></span><span>Sealed products<b>${items.filter(i => i.status === 'sealed').length}</b></span></div><h3>Most valuable</h3><div class="pc-card-grid">${items.sort((a, b) => b.value - a.value).slice(0, 4).map(i => this.tile(i)).join('') || empty('Your collection starts at the opening desk.')}</div><div class="pc-trade"><section><h3>Biggest gainers</h3>${list(movers.filter(i => i.delta > 0).sort((a, b) => b.delta - a.delta))}</section><section><h3>Biggest losers</h3>${list(movers.filter(i => i.delta < 0).sort((a, b) => a.delta - b.delta))}</section></div><h3>Recent activity</h3>${s.history.slice(-5).reverse().map(h => `<p>${esc(h.label)} · ${price(h.amount)}</p>`).join('') || empty('No activity yet.')}`;
  }
  private pagination(count: number) { return count > 36 ? `<nav class="pc-pagination">${button('previous', 'Previous', '', !this.page)}<span>Page ${this.page + 1} / ${Math.ceil(count / 36)}</span>${button('next', 'Next', '', (this.page + 1) * 36 >= count)}</nav>` : ''; }
  private action(action: string, value: string, root: HTMLElement) {
    this.notice = '';
    if (action === 'route') { this.route = value; this.page = 0; }
    else if (action === 'deleteCard') { this.selected = value; this.route = 'deleteCard'; }
    else if (action === 'product') { this.selected = value; this.route = 'product'; }
    else if (action === 'plus') { if ((this.cart[value] ?? 0) < stock(this.store.state, value)) this.cart[value] = (this.cart[value] ?? 0) + 1; this.notice = 'Added to cart'; }
    else if (action === 'minus') this.cart[value] = Math.max(0, (this.cart[value] ?? 0) - 1);
    else if (action === 'checkout') { const uid = this.services.checkout(this.cart); if (uid) { this.cart = {}; this.route = 'orders'; this.notice = 'Order placed. Your products will arrive sealed.'; } else this.notice = 'Could not place order. Check stock, balance and save storage.'; }
    else if (action === 'item') { this.selected = value; this.route = this.id === 'grading' ? this.store.state.cards.find(c => c.uid === value)?.status === 'graded' ? 'physical' : 'home' : this.id === 'collectr' ? iKind(this.store, value) === 'card' ? 'physical' : 'ownedProduct' : 'item'; }
    else if (action === 'list') { const i = collectionItems(this.store.state).find(i => i.uid === value)!; if (this.services.list(i.kind, value, Number(root.querySelector<HTMLInputElement>('[data-asking]')!.value))) { this.route = 'listings'; this.notice = 'Listing created. This item is locked.'; } else this.notice = 'Could not list this item.'; }
    else if (action === 'accept' || action === 'cancelListing') { this.services.resolve(value, action === 'accept'); this.notice = action === 'accept' ? 'Offer accepted' : 'Listing ended'; }
    else if (action === 'grader') this.grader = value as Grader;
    else if (action === 'submit') { if (this.store.submit(value, this.grader, this.service)) { this.route = 'orders'; this.notice = 'Submission shipped'; } else this.notice = 'Card is not eligible or funds are insufficient.'; }
    else if (action === 'receive') { const card = this.store.receive(value); if (card) { this.selected = card.uid; this.route = 'physical'; this.notice = `${card.grader} ${card.grade} · returned`; } }
    else if (action === 'card') { this.selected = value; this.route = 'card'; }
    else if (action === 'range') this.range = value;
    else if (action === 'physical') { this.selected = value; this.route = 'physical'; }
    else if (action === 'backCard') { this.selected = this.store.state.cards.find(c => c.uid === this.selected)!.cardId; this.route = 'card'; }
    else if (action === 'next') this.page++;
    else if (action === 'previous') this.page = Math.max(0, this.page - 1);
    else if (action === 'give') { const uid = root.querySelector<HTMLSelectElement>('[data-give]')!.value; if (uid && !this.give.includes(uid)) this.give.push(uid); }
    else if (action === 'removeGive') this.give = this.give.filter(uid => uid !== value);
    else if (action === 'receiveTrade') { const id = root.querySelector<HTMLSelectElement>('[data-receive]')!.value; if (CARD_BY_ID.has(id)) this.receive.push(id); }
    else if (action === 'removeReceive') this.receive.splice(Number(value), 1);
    this.refresh();
  }
  bindTrade(root: HTMLElement) { const query = root.querySelector<HTMLInputElement>('[data-trade-query]'); if (query) query.oninput = () => { root.querySelector('[data-receive]')!.innerHTML = searchCards(query.value).slice(0, 20).map(d => `<option value="${d.id}">${esc(d.name)} #${esc(d.number)} · ${price(rawValue(d, this.store.state.marketSeed))}</option>`).join(''); }; }
}

function iKind(store: GameStore, uid: string) { return collectionItems(store.state).find(i => i.uid === uid)?.kind; }
