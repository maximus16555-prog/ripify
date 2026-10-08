import { CardCleanup } from './card-cleanup';
import { ShippingOpening } from './shipping-opening';
import { ComputerDesktop } from './computer-desktop';
import { ComputerServices } from '../core/computer';
import './catalog.css';
import { CardInspector, disposeCardInspectionResources } from './card-inspector';
import { ContainerOpening } from './container-opening';
import { disposeContainerResources } from './container-view';
import { escapeHtml, installImageFallback, ownedMarkup, packMarkup } from '../assets/cards';
import { CARD_BY_ID, PRODUCTS, RARITIES } from '../data/cards';
import { misprintProvenance } from '../core/rare-events';
import { money, ownedValue } from '../core/economy';
import { orderStatus, type GameStore } from '../core/store';
import type { OwnedCard, Settings } from '../core/types';
import type { GameAudio } from '../game/audio';
import type { Interactable } from '../game/world';
import { icon } from './icons';
import { PackOpening } from './pack-opening';
import { gradedPopulation } from '../core/population';
export class GameUI {
  modal: HTMLElement;
  isOpen = false;
  get openingActive() { return this.isOpen && !!(this.opener || this.containerOpener); }
  get computerActive() { return this.isOpen && !!this.desktop; }
  private cleanup?: CardCleanup;
  private desktop?: ComputerDesktop;
  private computerServices: ComputerServices;
  tickComputer(dt: number) { this.computerServices.tick(dt); }
  private opener?: PackOpening;
  private containerOpener?: ContainerOpening;
  private shippingOpener?: ShippingOpening;
  private inspector?: CardInspector;
  private crackingUid?: string;
  private hud: HTMLElement;
  private prompt: HTMLElement;
  private marker: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private orderTimer = 0;
  private focusCleanup?: () => void;
  private binderQuery = ''; private binderFilter = 'all'; private binderSort = 'newest';
  private binderPage = 0; private binderSignature = '';
  private computerTab = 'market';
  private currentPrompt = '';
  private unsubscribe: () => void;
  private movementTime = 0;

  constructor(private root: HTMLElement, private store: GameStore, private audio: GameAudio, private pause: () => void, private resume: () => void, private getPreset: () => string) {
    this.computerServices = new ComputerServices(store);
    root.innerHTML = `<div class="hud">
      <header class="hud-top"><div class="game-identity"><div class="brand-symbol">✳</div><div><b class="wordmark">RIPIFY</b><div class="location-label"><i></i><span data-location>Your room</span></div></div></div>
      <div class="hud-resources"><div class="resource coins" title="In-game coins">${icon('coin')}<b data-currency></b></div><div class="resource" title="Unopened packs and sealed products">${icon('pack')}<b data-packs></b></div><div class="resource" title="Collected cards">${icon('binder')}<b data-cards></b></div><span class="hud-divider"></span><button class="icon-button" data-help aria-label="Controls">${icon('help')}</button><button class="icon-button" data-settings aria-label="Settings">${icon('settings')}</button></div></header>
      <div class="object-marker" hidden aria-hidden="true"></div>
      <div class="interaction-prompt" hidden aria-live="polite"></div>
      <footer class="hud-bottom"><div class="controls-strip"><span><kbd>WASD</kbd> Move</span><i></i><span>Click room · Mouse look</span><i></i><span><kbd>E</kbd> Interact</span></div></footer>
      <div class="fps-counter" hidden></div></div><div class="modal-root" hidden></div><div class="toast" role="status" hidden></div><input type="file" id="import-save" accept="application/json,.json" hidden/>`;
    this.hud = root.querySelector('.hud')!; this.modal = root.querySelector('.modal-root')!; this.prompt = root.querySelector('.interaction-prompt')!; this.marker = root.querySelector('.object-marker')!; this.toastEl = root.querySelector('.toast')!;
    root.querySelector<HTMLButtonElement>('[data-settings]')!.onclick = () => this.settings(); root.querySelector<HTMLButtonElement>('[data-help]')!.onclick = () => this.help();
    root.querySelector<HTMLInputElement>('#import-save')!.onchange = async e => { const input = e.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return; try { if (file.size > 8_000_000) throw new Error('Too large'); this.store.import(await file.text()); this.toast('Save imported'); this.settings(); } catch { this.toast('Invalid save. Your current progress is safe.'); } input.value = ''; };
    this.updateHUD(); this.unsubscribe = this.store.subscribe(() => this.updateHUD());
  }
  updateHUD() {
    const s = this.store.state;
    this.hud.querySelector('[data-currency]')!.textContent = money(s.currency);
    this.hud.querySelector('[data-packs]')!.textContent = String(s.packs.length + s.sealedProducts.length);
    this.hud.querySelector('[data-cards]')!.textContent = String(s.cards.length);
    this.hud.querySelector<HTMLElement>('.hud-bottom')!.hidden = s.settings.controlsLearned || s.stats.opened > 0;
    this.hud.querySelector<HTMLElement>('.fps-counter')!.hidden = !s.settings.fps;
  }
  setLocation(name: string) { this.hud.querySelector('[data-location]')!.textContent = name; }
  learnControls() { if (!this.store.state.settings.controlsLearned) this.store.settings({ controlsLearned: true }); }
  noteMovement(dt: number, speed: number) { if (this.store.state.settings.controlsLearned) return; if (speed > .2) this.movementTime += dt; if (this.movementTime > 5) this.learnControls(); }
  pointAt(x?: number, y?: number, z?: number) {
    const visible = x !== undefined && y !== undefined && z !== undefined && z <= 1 && z >= -1 && Math.abs(x) < 1 && Math.abs(y) < 1;
    this.marker.hidden = !visible;
    if (visible) { this.marker.style.left = `${(x! + 1) * 50}%`; this.marker.style.top = `${(1 - y!) * 50}%`; }
  }
  setPrompt(i?: Interactable) {
    const id = i?.id ?? ''; if (id === this.currentPrompt) return; this.currentPrompt = id;
    this.prompt.hidden = !i;
    this.prompt.dataset.packageUid = i?.action === 'package' ? i.id : '';
    if (i) this.prompt.innerHTML = `<kbd>E</kbd><span>${i.label}</span>${i.product ? `<small>${money(i.product.price)} coins</small>` : ''}`;
  }
  fps(value: number) { this.hud.querySelector('.fps-counter')!.textContent = `${value} FPS · ${this.getPreset()}`; }
  toast(text: string) { clearTimeout(this.toastTimer); this.toastEl.innerHTML = `<span>✓</span>${escapeHtml(text)}`; this.toastEl.hidden = false; this.toastTimer = window.setTimeout(() => { this.toastEl.hidden = true; }, 3800); }
  private open(html: string, wide = false, title = 'Game menu') {
    this.finishCrack(); this.desktop?.dispose(); this.desktop = undefined;
    this.cleanup?.dispose(); this.cleanup = undefined; this.inspector?.dispose(); this.inspector = undefined; this.opener?.dispose(); this.opener = undefined; this.containerOpener?.dispose(); this.containerOpener = undefined; this.shippingOpener?.dispose(); this.shippingOpener = undefined; clearInterval(this.orderTimer); this.focusCleanup?.(); this.isOpen = true; this.pause(); this.hud.classList.add('menu-open');
    this.modal.hidden = false; this.modal.className = `modal-root ${wide ? 'wide' : ''}`;
    this.modal.innerHTML = `<section class="game-panel" role="dialog" aria-modal="true" aria-label="${title}">${html}</section>`;
    this.modal.querySelector<HTMLButtonElement>('[data-close]')?.addEventListener('click', () => this.close());
    installImageFallback(this.modal); this.trapFocus();
  }
  private trapFocus() {
    const first = this.modal.querySelector<HTMLElement>('button, input, select, [tabindex="0"]'); first?.focus({ preventScroll: true });
    const trap = (e: KeyboardEvent) => { if (e.key !== 'Tab' || !this.isOpen) return; const focusable = Array.from(this.modal.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([hidden]), select, [tabindex="0"]')); if (!focusable.length) return; const a = focusable[0]; const b = focusable[focusable.length - 1]; if (e.shiftKey && (document.activeElement === a || !this.modal.contains(document.activeElement))) { e.preventDefault(); b.focus(); } else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); } };
    document.addEventListener('keydown', trap); this.focusCleanup = () => document.removeEventListener('keydown', trap);
  }
  close() { if (!this.isOpen) return; this.desktop?.dispose(); this.desktop = undefined; this.finishCrack(); this.cleanup?.dispose(); this.cleanup = undefined; this.inspector?.dispose(); this.inspector = undefined; this.opener?.dispose(); this.opener = undefined; this.containerOpener?.dispose(); this.containerOpener = undefined; this.shippingOpener?.dispose(); this.shippingOpener = undefined; clearInterval(this.orderTimer); this.focusCleanup?.(); this.isOpen = false; this.modal.hidden = true; this.modal.replaceChildren(); this.hud.classList.remove('menu-open'); this.resume(); }
  private header(eyebrow: string, title: string, suffix = '') { return `<header class="panel-header"><div><span class="eyebrow">${eyebrow}</span><h1>${title}${suffix}</h1></div><button class="close-button" data-close aria-label="Close">✕</button></header>`; }
  packs() {
    const s = this.store.state;
    if (s.containerOpening) { this.openContainer(); return; }
    if (!s.opening && s.sealedProducts.length) {
      this.open(`${this.header('OPENING DESK', 'Sealed inventory')}<div class="pack-choices">${s.packs.map(pack => { const p = PRODUCTS.find(p => p.code === pack.productId)!; return `<button class="pack-choice" data-pack="${pack.uid}">${packMarkup(p)}<b>${p.name}</b><span>Unopened</span></button>`; }).join('')}${s.sealedProducts.map(owned => { const p = PRODUCTS.find(p => p.code === owned.productId)!; return `<button class="pack-choice sealed-choice" data-container="${owned.uid}">${packMarkup(p)}<b>${p.name}</b><span>Sealed</span></button>`; }).join('')}</div><footer class="panel-footer"><span>${s.sealedProducts.length} sealed products</span><button class="secondary-button" data-keep-sealed>Keep sealed</button></footer>`, true, 'Sealed inventory');
      this.modal.querySelector<HTMLButtonElement>('[data-keep-sealed]')!.onclick = () => this.close();
      this.modal.querySelectorAll<HTMLButtonElement>('[data-pack]').forEach(b => { b.onclick = () => { if (this.store.startOpening(b.dataset.pack!)) this.packs(); }; });
      this.modal.querySelectorAll<HTMLButtonElement>('[data-container]').forEach(b => { b.onclick = () => { if (this.store.startContainer(b.dataset.container!)) this.openContainer(); }; });
      return;
    }
    this.close(); this.isOpen = true; this.pause(); this.hud.classList.add('menu-open'); this.modal.hidden = false;
    this.opener = new PackOpening(this.modal, this.store, this.audio, () => this.close(), text => this.toast(text)); this.trapFocus();
  }
  private openContainer() {
    this.close(); this.isOpen = true; this.pause(); this.hud.classList.add('menu-open'); this.modal.hidden = false;
    this.containerOpener = new ContainerOpening(this.modal, this.store, this.audio, () => this.close(), text => this.toast(text)); this.trapFocus();
  }
  shippingPackage(uid: string) {
    if (!this.store.state.shippingPackages?.some(p => p.uid === uid && p.stage !== 'claimed')) return;
    this.close(); this.isOpen = true; this.pause(); this.hud.classList.add('menu-open'); this.modal.hidden = false;
    this.shippingOpener = new ShippingOpening(this.modal, this.store, this.audio, uid, () => this.close(), text => this.toast(text)); this.trapFocus();
  }
  buy(productCode?: string) {
    const products = productCode ? PRODUCTS.filter(p => p.code === productCode) : PRODUCTS;
    this.open(`${this.header('CORNER CARD SHOP', 'Products')}<div class="shop-products">${products.map(p => `<article class="shop-product">${packMarkup(p)}<div><span class="eyebrow">${p.year} EDITION</span><h2>${p.name}</h2><span class="muted">${p.subtitle}</span><div class="product-price">${money(p.price)}<small> coins</small></div><button class="primary-button" data-buy="${p.code}" ${this.store.state.currency < p.price ? 'disabled' : ''}>Buy sealed ${icon('arrow')}</button></div></article>`).join('')}</div><footer class="panel-footer"><span>Wallet <b>${money(this.store.state.currency)}</b></span><span>Keep sealed or open at your desk.</span></footer>`, products.length > 1, 'Buy packs');
    this.modal.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(b => { b.onclick = () => { const p = PRODUCTS.find(p => p.code === b.dataset.buy)!; if (this.store.buy(p.code)) { this.audio.unlock(); this.audio.play('buy'); this.toast(`${p.name} added to sealed inventory`); this.buy(productCode); } }; });
  }
  binder() {
    this.open(`${this.header('YOUR COLLECTION', 'The binder', `<span class="small-count">${this.store.state.cards.length} cards</span>`)}<div class="binder-toolbar"><button class="secondary-button" data-bulk-manage>Select / Bulk manage</button><input type="search" placeholder="Find a card…" aria-label="Search cards" data-search value="${escapeHtml(this.binderQuery)}"/><select aria-label="Filter collection" data-filter>${[['all', 'All cards'], ['raw', 'Raw'], ['graded', 'Graded'], ['grading', 'Away grading'], ['favorite', 'Favorites'], ...RARITIES.map(r => [r, r])].map(([v, t]) => `<option value="${v}" ${v === this.binderFilter ? 'selected' : ''}>${t}</option>`).join('')}</select><select aria-label="Sort collection" data-sort>${[['newest', 'Newest first'], ['value', 'Highest value'], ['name', 'Name A–Z'], ['set', 'Set']].map(([v, t]) => `<option value="${v}" ${v === this.binderSort ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div class="binder-pages" data-grid></div><footer class="panel-footer"><span>Raw & graded cards</span><span data-binder-count></span></footer>`, true, 'Binder');
    this.modal.querySelector<HTMLInputElement>('[data-search]')!.oninput = e => { this.binderQuery = (e.target as HTMLInputElement).value; this.renderBinderGrid(); };
    this.modal.querySelector<HTMLSelectElement>('[data-filter]')!.onchange = e => { this.binderFilter = (e.target as HTMLSelectElement).value; this.renderBinderGrid(); };
    this.modal.querySelector<HTMLSelectElement>('[data-sort]')!.onchange = e => { this.binderSort = (e.target as HTMLSelectElement).value; this.renderBinderGrid(); };
    this.modal.querySelector<HTMLButtonElement>('[data-bulk-manage]')!.onclick = () => this.manageCards();
    this.renderBinderGrid();
  }
  private manageCards(single?: string, back: 'binder' | 'market' | 'display' = 'binder') {
    this.open(`${this.header('YOUR COLLECTION', single ? 'Delete card' : 'Bulk manage')}<div data-card-cleanup></div>`, true, 'Manage cards');
    this.cleanup = new CardCleanup(this.modal.querySelector('[data-card-cleanup]')!, this.store, () => {
      if (single && this.store.state.cards.some(c => c.uid === single)) this.inspect(single, back);
      else if (back === 'market') this.computer('market'); else if (back === 'display') this.displays(); else this.binder();
    }, single);
  }
  private renderBinderGrid() {
    const s = this.store.state;
    const cards = s.cards.filter(c => { const d = CARD_BY_ID.get(c.cardId)!; return (!this.binderQuery || `${d.name} ${d.set} ${d.number}`.toLowerCase().includes(this.binderQuery.toLowerCase())) && (this.binderFilter === 'all' || this.binderFilter === 'favorite' && c.favorite || c.status === this.binderFilter || d.rarity === this.binderFilter); });
    cards.sort((a, b) => this.binderSort === 'value' ? ownedValue(b, s.marketSeed) - ownedValue(a, s.marketSeed) : this.binderSort === 'name' ? CARD_BY_ID.get(a.cardId)!.name.localeCompare(CARD_BY_ID.get(b.cardId)!.name) : this.binderSort === 'set' ? CARD_BY_ID.get(a.cardId)!.set.localeCompare(CARD_BY_ID.get(b.cardId)!.set) : b.acquiredAt - a.acquiredAt);
    const signature = `${this.binderQuery}|${this.binderFilter}|${this.binderSort}`;
    if (signature !== this.binderSignature) { this.binderPage = 0; this.binderSignature = signature; }
    const pages = Math.max(1, Math.ceil(cards.length / 20)); this.binderPage = Math.min(this.binderPage, pages - 1);
    const grid = this.modal.querySelector<HTMLElement>('[data-grid]')!;
    grid.innerHTML = cards.length ? `<div class="binder-grid">${cards.slice(this.binderPage * 20, (this.binderPage + 1) * 20).map(c => `<button class="binder-slot ${c.status === 'grading' ? 'away' : ''}" data-inspect="${c.uid}">${ownedMarkup(c, true)}<div class="binder-card-label"><b>${CARD_BY_ID.get(c.cardId)!.name}</b>${c.favorite ? '<span class="favorite-dot">★</span>' : ''}<span>${c.status === 'grading' ? 'Grading' : `${money(ownedValue(c, s.marketSeed))} coins`}</span></div></button>`).join('')}</div>` : `<div class="empty-state"><span>▤</span><h2>${s.cards.length ? 'No matching cards' : 'No cards yet'}</h2><p>${s.cards.length ? 'Try another filter.' : 'Open your starter pack at the desk.'}</p></div>`;
    this.modal.querySelector('[data-binder-count]')!.innerHTML = `<span class="binder-pagination">${cards.length} of ${s.cards.length}<button data-page="-1" aria-label="Previous binder page" ${this.binderPage === 0 ? 'disabled' : ''}>←</button>${this.binderPage + 1} / ${pages}<button data-page="1" aria-label="Next binder page" ${this.binderPage >= pages - 1 ? 'disabled' : ''}>→</button></span>`;
    this.modal.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(b => { b.onclick = () => { this.binderPage += Number(b.dataset.page); this.renderBinderGrid(); grid.scrollTop = 0; }; });
    grid.querySelectorAll<HTMLButtonElement>('[data-inspect]').forEach(b => { b.onclick = () => this.inspect(b.dataset.inspect!, 'binder'); }); installImageFallback(grid);
  }
  inspect(uid: string, back: 'binder' | 'market' | 'display' = 'binder') {
    const c = this.store.state.cards.find(c => c.uid === uid); if (!c) return; const d = CARD_BY_ID.get(c.cardId)!; const value = ownedValue(c, this.store.state.marketSeed);
    this.open(`${this.header(`${d.set.toUpperCase()} / ${d.number}`, d.name)}<div class="inspect-layout"><div class="inspection-card">${ownedMarkup(c)}</div><div class="inspection-info"><div class="inspection-top"><span class="rarity-label">${d.rarity}</span><button class="text-button favorite-button" data-favorite>${c.favorite ? '★ Favorite' : '☆ Favorite'}</button></div><div class="inspection-value"><span class="eyebrow">${c.status === 'graded' ? 'GRADED VALUE' : 'RAW VALUE'}</span><b>${money(value)}<small> coins</small></b></div>${c.status === 'graded' ? `<div class="grade-summary"><span>${c.grader}</span><b>${c.grade}</b><span>${c.subgrades ? 'Subgrades ' + c.subgrades.join(' / ') : 'Graded'}</span></div>` : `<div class="condition-report"><span class="eyebrow">CONDITION · VISUAL ESTIMATE</span>${Object.entries(c.condition).map(([k, v]) => `<div><span>${k === 'print' ? 'Print quality' : k[0].toUpperCase() + k.slice(1)}</span><b>${v >= 94 ? 'Excellent' : v >= 83 ? 'Good' : v >= 70 ? 'Fair' : 'Worn'}</b><i style="--condition:${v >= 94 ? 95 : v >= 83 ? 80 : v >= 70 ? 60 : 40}%"></i></div>`).join('')}</div>`}<details class="printed-data"><summary>Printed card data</summary><dl><dt>ID</dt><dd>${escapeHtml(d.id)}</dd><dt>Category</dt><dd>${escapeHtml(d.category)}</dd>${d.hp ? `<dt>HP</dt><dd>${d.hp}</dd>` : ''}${d.artist ? `<dt>Artist</dt><dd>${escapeHtml(d.artist)}</dd>` : ''}${d.retreat !== undefined ? `<dt>Retreat</dt><dd>${d.retreat}</dd>` : ''}</dl>${[d.attacks, d.abilities, d.weaknesses, d.resistances].filter(Boolean).map(data => `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`).join('')}<a href="${escapeHtml(d.sourceUrl)}" target="_blank" rel="noopener">Data source</a></details><div class="card-provenance">${c.misprint ? `<span>Misprint &middot; ${escapeHtml(c.misprint.defect.type)} &middot; ${misprintProvenance(c)}</span>` : ''}<span>${d.year} · ${d.type}</span><span>${new Date(c.acquiredAt).toLocaleDateString()} · ${c.origin === 'promo' ? 'Fixed product card' : 'Pulled from a pack'} · ${c.finish}</span><span>${this.store.state.cards.filter(o => o.cardId === c.cardId).length} ${this.store.state.cards.filter(o => o.cardId === c.cardId).length === 1 ? 'copy' : 'copies'} owned</span></div>${c.status === 'grading' ? '<div class="short-status">In Progress</div>' : `<div class="card-actions"><button class="secondary-button" data-display>Put on display</button><button class="secondary-button" data-sell>Sell for ${money(value)} coins</button></div><div class="display-slot-picker" hidden></div>`}</div></div><footer class="panel-footer"><button class="text-button" data-back>← ${back === 'market' ? 'Market' : back === 'display' ? 'Display' : 'Binder'}</button><span>${c.status === 'graded' ? 'Graded' : c.status === 'grading' ? 'Grading' : 'Raw'} / ${d.setCode.toUpperCase()}</span></footer>`, false, 'Inspect card');
    try { this.inspector = new CardInspector(this.modal.querySelector<HTMLElement>('.inspection-card')!, c); }
    catch { this.modal.querySelector<HTMLElement>('.inspection-card')!.innerHTML = `${ownedMarkup(c)}<small>3D preview unavailable</small>`; installImageFallback(this.modal); }
    const actions = this.modal.querySelector<HTMLElement>('.card-actions');
    if (this.store.isCardLocked(uid)) actions?.remove();
    else if (this.store.canCrack(uid)) {
      const crack = document.createElement('button'); crack.className = 'secondary-button'; crack.dataset.crackSlab = ''; crack.textContent = 'Crack slab';
      crack.onclick = () => this.confirmSlabCrack(uid, back); actions?.append(crack);
    }
    const remove = document.createElement('button'); remove.className = 'secondary-button danger-button'; remove.dataset.deleteCard = ''; remove.textContent = 'Delete card';
    const protection = this.store.deletionProtection(uid); remove.disabled = !!protection; remove.title = protection || 'Permanently dispose of this owned copy; no payout';
    remove.onclick = () => this.manageCards(uid, back); this.modal.querySelector('.inspection-info')!.append(remove);
    const events = [...(c.gradingHistory ?? []).map(g => ({ at: g.at, text: `${g.grader} grade ${g.grade}` })), ...(c.crackHistory ?? []).map(e => ({ at: e.at, text: `${e.grader} ${e.grade} slab ${e.outcome === 'safe' ? 'removed safely' : 'cracked · card permanently damaged'}${e.damage.length ? ' · ' + e.damage.map(d => d.type).join(', ') : ''}` }))].sort((a, b) => a.at - b.at);
    if (events.length) {
      const history = document.createElement('details'); history.className = 'printed-data card-history';
      history.innerHTML = `<summary>Grading & card history</summary><ol>${events.map(e => `<li>${escapeHtml(e.text)}</li>`).join('')}</ol>`;
      this.modal.querySelector('.inspection-info')!.append(history);
    }
    const grade = c.status === 'graded' ? { grader: c.grader!, grade: c.grade! } : c.gradingHistory?.at(-1);
    if (grade) { const pop = gradedPopulation(this.store.state, c.cardId, grade.grader, grade.grade); const note = document.createElement('small'); note.className = 'simulation-note population-note'; note.textContent = `RIPIFY ${grade.grader} ${grade.grade} population · ${pop.current} current / ${pop.allTime} all-time copies`; this.modal.querySelector('.inspection-info')!.append(note); }
    this.modal.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => back === 'market' ? this.computer('market') : back === 'display' ? this.displays() : this.binder();
    this.modal.querySelector<HTMLButtonElement>('[data-favorite]')!.onclick = () => { this.store.favorite(uid); this.inspect(uid, back); };
    this.modal.querySelector<HTMLButtonElement>('[data-display]')?.addEventListener('click', () => {
      const slots = this.modal.querySelector<HTMLElement>('.display-slot-picker')!; slots.hidden = false; slots.innerHTML = `<span>Choose a stand</span>${[0, 1, 2].map(i => `<button class="secondary-button" data-slot="${i}">${i + 1}</button>`).join('')}`;
      slots.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(b => { b.onclick = () => { if (this.store.display(uid, Number(b.dataset.slot))) { this.audio.play('click'); this.toast(`${d.name} is on display`); this.close(); } }; });
    });
    const sell = this.modal.querySelector<HTMLButtonElement>('[data-sell]');
    if (sell) sell.onclick = () => { sell.textContent = `Confirm sale · ${money(value)} coins`; sell.classList.add('confirm-sale'); sell.onclick = () => { if (this.store.sell(uid)) { this.audio.play('buy'); this.toast(`${d.name} sold for ${money(value)} coins`); if (back === 'market') this.computer('market'); else if (back === 'display') this.displays(); else this.binder(); } }; };
  }
  computer(tab = 'desktop') {
    this.close(); this.isOpen = true; this.pause(); this.hud.classList.add('menu-open'); this.modal.hidden = false;
    this.desktop = new ComputerDesktop(this.modal, this.store, this.computerServices, () => this.close(), tab === 'grading' ? 'grading' : tab === 'market' ? 'ebay' : undefined);
    this.trapFocus();
  }
  private renderOrders() {
    const target = this.modal.querySelector<HTMLElement>('[data-orders]'); if (!target) return;
    const orders = this.store.state.orders;
    target.innerHTML = orders.length ? `<div class="orders-list">${orders.map(o => { const c = this.store.state.cards.find(c => c.uid === o.cardUid)!; const d = CARD_BY_ID.get(c.cardId)!; const status = orderStatus(o.sentAt, o.dueAt); return `<article class="order-row"><span class="shipping-icon">▣</span><div><b>${d.name}</b><small>${o.grader} · ${o.service}</small><div class="shipping-progress"><i style="width:${Math.min(100, (Date.now() - o.sentAt) / (o.dueAt - o.sentAt) * 100)}%"></i></div></div><span class="order-status">${status}<small>${status === 'Delivered' ? 'Ready to open' : `${Math.max(0, Math.ceil((o.dueAt - Date.now()) / 1000))}s`}</small></span>${status === 'Delivered' ? '<small>Shipping box waiting by the bedroom door</small>' : ''}</article>`; }).join('')}</div>` : '<div class="empty-state"><span>▣</span><h2>No orders in progress</h2><p>Submit raw cards through the Grading app on your bedroom computer.</p></div>';
    target.querySelectorAll<HTMLButtonElement>('[data-receive]').forEach(b => { b.onclick = () => { const c = this.store.receive(b.dataset.receive!); if (c) this.gradeReveal(c); }; });
  }
  private gradeReveal(c: OwnedCard) {
    const d = CARD_BY_ID.get(c.cardId)!; this.audio.unlock(); this.audio.play('return');
    this.open(`${this.header('BACK FROM GRADING', 'Special delivery')}<div class="grade-return"><div class="returned-slab">${ownedMarkup(c)}</div><div><span class="eyebrow">${c.grader} / RESULT</span><h2>${c.grade}<span>/ 10</span></h2><b>${d.name}</b>${c.subgrades ? `<p class="subgrade-line">C ${c.subgrades[0]} · CO ${c.subgrades[1]} · E ${c.subgrades[2]} · S ${c.subgrades[3]}</p>` : ''}<div class="pull-value"><small>GRADED VALUE</small><b>${money(ownedValue(c, this.store.state.marketSeed))}<span> coins</span></b></div><button class="primary-button" data-keep>Back to collection →</button></div></div>`, false, 'Grade result');
    this.modal.querySelector<HTMLButtonElement>('[data-keep]')!.onclick = () => this.inspect(c.uid);
  }
  displays() {
    const s = this.store.state;
    this.open(`${this.header('YOUR ROOM', 'The display shelf')}<div class="display-preview">${s.displays.map((uid, i) => { const c = s.cards.find(c => c.uid === uid); return `<div class="display-stand">${c ? ownedMarkup(c, true) : '<div class="empty-display">✦</div>'}<b>Stand ${i + 1}</b>${c ? `<button class="text-button" data-clear="${i}">Remove</button>` : '<span class="muted">Empty</span>'}</div>`; }).join('')}</div><div class="display-selection"><span class="eyebrow">CHOOSE A CARD</span>${s.cards.some(c => c.status !== 'grading') ? `<div class="mini-card-list">${s.cards.filter(c => c.status !== 'grading').map(c => `<button class="secondary-button" data-inspect="${c.uid}">${CARD_BY_ID.get(c.cardId)!.name}${c.grade ? ` · ${c.grader} ${c.grade}` : ''} ↗</button>`).join('')}</div>` : '<p class="muted">Open a pack to start your display.</p>'}</div>`, false, 'Card display');
    this.modal.querySelectorAll<HTMLButtonElement>('[data-clear]').forEach(b => { b.onclick = () => { this.store.clearDisplay(Number(b.dataset.clear)); this.displays(); }; });
    this.modal.querySelectorAll<HTMLButtonElement>('[data-inspect]').forEach(b => { b.onclick = () => this.inspect(b.dataset.inspect!, 'display'); });
  }
  settings() {
    const s = this.store.state.settings;
    this.open(`${this.header('PAUSE / RIPIFY', 'Settings')}<div class="settings-body"><div class="setting-section"><span class="eyebrow">GRAPHICS</span><div class="graphics-choices">${['Auto', 'Low', 'Medium', 'High'].map(v => `<button class="${s.graphics === v ? 'selected' : ''}" data-graphics="${v}">${v}</button>`).join('')}</div><span class="auto-label">${s.graphics === 'Auto' ? `Auto selects ${this.getPreset()}` : `${s.graphics} quality`}</span>${this.slider('renderScale', 'Render scale', .5, 1.5, .1, s.renderScale)}<div class="setting-row"><span>FPS counter</span><input type="checkbox" aria-label="FPS counter" data-fps ${s.fps ? 'checked' : ''}/></div><button class="secondary-button" data-fullscreen ${!document.fullscreenEnabled ? 'disabled' : ''}>${document.fullscreenElement ? 'Leave fullscreen' : 'Fullscreen'} ↗</button></div><div class="setting-section"><span class="eyebrow">CONTROLS</span>${this.slider('sensitivity', 'Mouse sensitivity', .3, 2, .1, s.sensitivity)}</div><div class="setting-section"><span class="eyebrow">AUDIO</span>${this.slider('master', 'Master', 0, 1, .05, s.master)}${this.slider('music', 'Music / ambience', 0, 1, .05, s.music)}${this.slider('sfx', 'Sound effects', 0, 1, .05, s.sfx)}</div><div class="setting-section save-controls"><span class="eyebrow">SAVE</span><span class="save-status">${this.store.state.legacyArchive ? 'Legacy prototype inventory archived in exported save' : this.store.warning ? escapeHtml(this.store.warning) : 'Saved on this browser'}</span><div><button class="secondary-button" data-export>Export save ↓</button><button class="secondary-button" data-import>Import save ↑</button><button class="secondary-button danger-button" data-reset-progress>Reset progress</button></div></div><details class="about"><summary>About & credits</summary><p>RIPIFY is a fan-made simulation and is not affiliated with or endorsed by Pokémon, Nintendo, Creatures, Game Freak, PSA, Beckett, CGC, SGC, TAG, eBay, or other referenced companies.</p><p>Card metadata: TCGdex (MIT database). Card images remain the property of their respective owners. Missing assets are explicitly marked. Prices, pull rates, economy and grading are simulated.</p><p>Built with Three.js. Single-player build · v0.1. Multiplayer Card Show is not included.</p></details></div><footer class="panel-footer"><span>RIPIFY / v0.1</span><button class="primary-button" data-resume>Back to room →</button></footer>`, false, 'Settings');
    this.modal.querySelectorAll<HTMLButtonElement>('[data-graphics]').forEach(b => { b.onclick = () => { this.store.settings({ graphics: b.dataset.graphics as Settings['graphics'] }); this.settings(); }; });
    this.modal.querySelectorAll<HTMLInputElement>('[data-slider]').forEach(input => { input.oninput = () => { const key = input.dataset.slider as keyof Settings; this.store.settings({ [key]: Number(input.value) }); input.parentElement!.querySelector('output')!.textContent = key === 'sensitivity' ? `${Number(input.value).toFixed(1)}×` : `${Math.round(Number(input.value) * 100)}%`; this.audio.update(); }; });
    this.modal.querySelector<HTMLInputElement>('[data-fps]')!.onchange = e => this.store.settings({ fps: (e.target as HTMLInputElement).checked });
    this.modal.querySelector<HTMLButtonElement>('[data-fullscreen]')!.onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); this.settings(); } catch { this.toast('Fullscreen is unavailable in this browser.'); } };
    this.modal.querySelector<HTMLButtonElement>('[data-resume]')!.onclick = () => this.close();
    this.modal.querySelector<HTMLButtonElement>('[data-export]')!.onclick = () => { const blob = new Blob([JSON.stringify(this.store.state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'ripify-save.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); this.toast('Save exported'); };
    this.modal.querySelector<HTMLButtonElement>('[data-import]')!.onclick = () => this.root.querySelector<HTMLInputElement>('#import-save')!.click();
    this.modal.querySelector<HTMLButtonElement>('[data-reset-progress]')!.onclick = () => this.confirmResetProgress();
  }
  private finishCrack() { if (this.crackingUid) this.store.finishCrack(this.crackingUid); this.crackingUid = undefined; }
  private confirmSlabCrack(uid: string, back: 'binder' | 'market' | 'display') {
    const card = this.store.state.cards.find(c => c.uid === uid); if (!card || !this.store.canCrack(uid)) return;
    this.open(`${this.header('SLAB REMOVAL', 'Crack this slab?')}<div class="crack-confirmation"><p>50% chance of permanently damaging the card and halving its base raw value.</p><p>You keep the same card. Its previous grade remains in history.${this.store.state.displays.includes(uid) ? ' It will be removed from its display stand.' : ''}</p><div class="card-actions"><button class="secondary-button" data-cancel-crack>Cancel</button><button class="primary-button" data-confirm-crack>Crack slab</button></div></div>`, false, 'Confirm slab crack');
    this.modal.querySelector<HTMLButtonElement>('[data-cancel-crack]')!.onclick = () => this.inspect(uid, back);
    this.modal.querySelector<HTMLElement>('[data-cancel-crack]')!.focus();
    this.modal.querySelector<HTMLButtonElement>('[data-confirm-crack]')!.onclick = () => {
      if (!this.store.canCrack(uid)) return;
      const slab = structuredClone(card), event = this.store.crackSlab(uid);
      if (!event) { this.toast(this.store.warning ?? 'This card is locked.'); return; }
      this.open(`${this.header('SLAB REMOVAL', CARD_BY_ID.get(card.cardId)!.name)}<div class="crack-stage"><div class="inspection-card"></div></div>`, false, 'Opening slab');
      this.crackingUid = uid;
      const finish = () => { this.inspect(uid, back); this.toast(event.outcome === 'safe' ? 'Slab removed safely' : 'Card damaged'); };
      try { this.inspector = new CardInspector(this.modal.querySelector<HTMLElement>('.inspection-card')!, slab); this.inspector.animateCrack(card, finish, phase => this.audio.plasticFracture(phase)); }
      catch { finish(); }
    };
  }
  private confirmResetProgress() {
    this.open(`${this.header('NEW GAME', 'Reset all progress?')}<div class="reset-progress-body"><p>This deletes your cards, sealed products, currency, grading orders, displays, and history. This cannot be undone.</p><p>Start again with 120 coins and one starter pack. Graphics, audio, and control preferences are kept.</p></div><footer class="panel-footer"><button class="secondary-button" data-cancel-reset>Cancel</button><button class="primary-button danger-button" data-confirm-reset>Reset all progress</button></footer>`, false, 'Reset progress');
    const cancel = this.modal.querySelector<HTMLButtonElement>('[data-cancel-reset]')!;
    cancel.onclick = () => this.settings(); cancel.focus();
    this.modal.querySelector<HTMLButtonElement>('[data-confirm-reset]')!.onclick = () => {
      if (!this.store.resetProgress()) { this.toast(this.store.warning!); return; }
      // Reload releases every active interaction/world resource and respawns at
      // home. pagehide persists the replacement, never the pre-reset inventory.
      window.location.reload();
    };
  }
  private slider(key: string, label: string, min: number, max: number, step: number, value: number) { return `<label class="setting-slider"><span>${label}<output>${key === 'sensitivity' ? value.toFixed(1) + '×' : Math.round(value * 100) + '%'}</output></span><input type="range" data-slider="${key}" min="${min}" max="${max}" step="${step}" value="${value}"/></label>`; }
  help() {
    this.open(`${this.header('KEYBOARD & MOUSE', 'Controls')}<div class="help-controls">${[['W A S D', 'Move'], ['Mouse', 'Look around · click room to capture cursor'], ['Shift', 'Sprint'], ['Space', 'Jump'], ['E', 'Use the nearest object'], ['Esc', 'Release cursor · close menus'], ['Drag', 'Rip the seam · swipe each card'], ['Hold R', 'Rip with keyboard'], ['← / →', 'Reveal one card']].map(([key, label]) => `<div><kbd>${key}</kbd><span>${label}</span></div>`).join('')}</div><footer class="panel-footer"><span>A starter pack is waiting at your desk.</span><button class="primary-button" data-play>Let’s play →</button></footer>`, false, 'Controls');
    this.modal.querySelector<HTMLButtonElement>('[data-play]')!.onclick = () => this.close();
  }
  dispose() { this.close(); this.computerServices.dispose(); disposeCardInspectionResources(); disposeContainerResources(); this.unsubscribe(); clearTimeout(this.toastTimer); }
}
