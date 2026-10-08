import './card-cleanup.css';
import { escapeHtml as esc, installImageFallback, ownedMarkup } from '../assets/cards';
import { CARD_BY_ID } from '../data/cards';
import { money, ownedValue } from '../core/economy';
import { excessCopies, filterCleanupCards, valuableCard, VALUABLE_CARD_THRESHOLD, type CleanupFilter } from '../core/card-disposal';
import type { GameStore } from '../core/store';
import type { OwnedCard } from '../core/types';

/** Shared, paginated collection tool. Only owned-instance IDs are selected. */
export class CardCleanup {
  private selected = new Set<string>();
  private filter: CleanupFilter = { query: '', rarities: [], set: '', raw: false, duplicates: false, maximum: '' };
  private page = 0;
  private pending?: string[];
  private notice = '';
  private unsubscribe: () => void;
  private deleting = false;
  constructor(private root: HTMLElement, private store: GameStore, private done: () => void, single?: string) {
    this.pending = single ? [single] : undefined;
    this.unsubscribe = store.subscribe(() => { if (!this.deleting) this.render(); });
    this.render();
  }
  dispose() { this.unsubscribe(); }
  private automatic(c: OwnedCard) { return !this.store.deletionProtection(c.uid) && !valuableCard(c, this.store.state) && !this.store.state.displays.includes(c.uid) && c.origin !== 'promo' && c.finish !== 'metal'; }
  private render() {
    if (this.pending) { this.confirm(); return; }
    const s = this.store.state;
    this.selected = new Set([...this.selected].filter(uid => !this.store.deletionProtection(uid)));
    const cards = filterCleanupCards(s, this.filter), pages = Math.max(1, Math.ceil(cards.length / 24));
    this.page = Math.max(0, Math.min(this.page, pages - 1));
    const visible = cards.slice(this.page * 24, (this.page + 1) * 24);
    const sets = [...new Map(s.cards.map(c => { const d = CARD_BY_ID.get(c.cardId)!; return [d.setCode, d.set] as const; }))];
    this.root.innerHTML = `<section class="card-cleanup"><header><h2>Bulk manage cards</h2><button data-cleanup-done>Back to collection</button></header><p>Graded cards, misprints, favorites and transaction-locked cards are protected. Select All also skips displays, promos, metal cards and cards worth $${VALUABLE_CARD_THRESHOLD}+; valuable raw cards can be selected individually.</p><div class="cleanup-filters"><input data-cleanup-query aria-label="Search cleanup cards" placeholder="Name or card number" value="${esc(this.filter.query)}"/><select data-cleanup-set aria-label="Cleanup set"><option value="">All sets</option>${sets.map(([id, name]) => `<option value="${id}" ${this.filter.set === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select><label>Maximum value <input data-cleanup-maximum type="number" min="0" step=".01" value="${esc(this.filter.maximum)}"/></label>${['Common', 'Uncommon', 'Rare'].map(r => `<label><input type="checkbox" data-cleanup-rarity="${r}" ${this.filter.rarities.includes(r) ? 'checked' : ''}/>${r}</label>`).join('')}<label><input type="checkbox" data-cleanup-raw ${this.filter.raw ? 'checked' : ''}/>Raw only</label><label><input type="checkbox" data-cleanup-duplicates ${this.filter.duplicates ? 'checked' : ''}/>Duplicates only</label></div><div class="cleanup-actions"><button data-cleanup-visible>Select visible</button><button data-cleanup-all>Select all filtered</button><button data-cleanup-excess>Select duplicates</button><button data-cleanup-clear>Deselect all</button><strong data-cleanup-count>${this.selected.size} selected</strong><button class="danger-button" data-cleanup-delete ${this.selected.size ? '' : 'disabled'}>Delete selected</button></div>${this.notice ? `<p role="status">${esc(this.notice)}</p>` : ''}<div class="cleanup-grid">${visible.map(c => { const d = CARD_BY_ID.get(c.cardId)!, protection = this.store.deletionProtection(c.uid); return `<label class="cleanup-card ${protection ? 'protected' : ''}"><input type="checkbox" data-cleanup-card="${c.uid}" aria-label="Select ${esc(d.name)} ${esc(d.number)}" ${this.selected.has(c.uid) ? 'checked' : ''} ${protection ? 'disabled' : ''}/>${ownedMarkup(c, true)}<b>${esc(d.name)}</b><small>${esc(d.set)} #${esc(d.number)}</small><span>$${money(ownedValue(c, s.marketSeed))}</span>${protection ? `<small>${protection}</small>` : valuableCard(c, s) ? '<small>Valuable card</small>' : ''}</label>`; }).join('') || '<p>No matching cards.</p>'}</div><footer><span>${cards.length} matching / ${s.cards.length} owned</span><button data-cleanup-prev ${this.page ? '' : 'disabled'}>Previous</button><span>${this.page + 1} / ${pages}</span><button data-cleanup-next ${this.page + 1 < pages ? '' : 'disabled'}>Next</button></footer></section>`;
    installImageFallback(this.root);
    const click = (selector: string, fn: () => void) => { this.root.querySelector<HTMLButtonElement>(selector)!.onclick = fn; };
    click('[data-cleanup-done]', this.done);
    const select = (pool: OwnedCard[]) => { for (const c of pool) if (this.automatic(c)) this.selected.add(c.uid); this.notice = 'Protected, displayed, promo and valuable cards were skipped.'; this.render(); };
    click('[data-cleanup-visible]', () => select(visible)); click('[data-cleanup-all]', () => select(cards));
    click('[data-cleanup-excess]', () => { const excess = excessCopies(s, c => this.automatic(c)); this.selected = new Set(cards.filter(c => excess.has(c.uid)).map(c => c.uid)); this.notice = 'At least one copy of each exact printing is kept. Protected copies are never selected.'; this.render(); });
    click('[data-cleanup-clear]', () => { this.selected.clear(); this.render(); });
    click('[data-cleanup-delete]', () => { this.pending = [...this.selected]; this.render(); });
    click('[data-cleanup-prev]', () => { this.page--; this.render(); }); click('[data-cleanup-next]', () => { this.page++; this.render(); });
    this.root.querySelectorAll<HTMLInputElement>('[data-cleanup-card]').forEach(i => { i.onchange = () => {
      if (i.checked) this.selected.add(i.dataset.cleanupCard!); else this.selected.delete(i.dataset.cleanupCard!);
      this.root.querySelector('[data-cleanup-count]')!.textContent = `${this.selected.size} selected`;
      this.root.querySelector<HTMLButtonElement>('[data-cleanup-delete]')!.disabled = !this.selected.size;
    }; });
    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.cleanup-filters input, .cleanup-filters select').forEach(i => { i.onchange = () => {
      const query = this.root.querySelector<HTMLInputElement>('[data-cleanup-query]')!;
      this.filter = { query: query.value, set: this.root.querySelector<HTMLSelectElement>('[data-cleanup-set]')!.value, maximum: this.root.querySelector<HTMLInputElement>('[data-cleanup-maximum]')!.value, rarities: [...this.root.querySelectorAll<HTMLInputElement>('[data-cleanup-rarity]:checked')].map(i => i.dataset.cleanupRarity!), raw: this.root.querySelector<HTMLInputElement>('[data-cleanup-raw]')!.checked, duplicates: this.root.querySelector<HTMLInputElement>('[data-cleanup-duplicates]')!.checked };
      this.selected.clear(); this.page = 0; this.render();
    }; });
  }
  private confirm() {
    const ids = this.pending!, cards = this.store.state.cards.filter(c => ids.includes(c.uid));
    const protectedReason = ids.map(uid => this.store.deletionProtection(uid)).find(Boolean);
    const valuable = cards.filter(c => valuableCard(c, this.store.state));
    this.root.innerHTML = `<section class="cleanup-confirm" role="alertdialog" aria-label="Confirm card deletion"><h2>${ids.length === 1 ? 'Delete this card permanently?' : `Delete ${ids.length} cards permanently?`}</h2><p>This cannot be undone. No money is awarded.</p>${valuable.length ? `<p class="cleanup-warning">WARNING: This selection contains valuable cards.</p><p>${valuable.length} valuable card${valuable.length === 1 ? '' : 's'}; total selected market value $${money(cards.reduce((n, c) => n + ownedValue(c, this.store.state.marketSeed), 0))}.</p>` : ''}${protectedReason ? `<p role="status">${esc(protectedReason)}. This selection cannot be deleted.</p>` : ''}${this.notice ? `<p role="status">${esc(this.notice)}</p>` : ''}<button data-cleanup-cancel>Cancel</button><button class="danger-button" data-cleanup-confirm ${protectedReason ? 'disabled' : ''}>${ids.length === 1 ? 'Delete' : `Delete ${ids.length} cards`}</button></section>`;
    this.root.querySelector<HTMLButtonElement>('[data-cleanup-cancel]')!.onclick = () => { if (this.selected.size) { this.pending = undefined; this.render(); } else this.done(); };
    this.root.querySelector<HTMLButtonElement>('[data-cleanup-confirm]')!.onclick = () => {
      this.deleting = true;
      const success = this.store.deleteCards(ids, valuable.length > 0);
      this.deleting = false;
      if (success) { this.pending = undefined; this.selected.clear(); this.notice = `${ids.length} card${ids.length === 1 ? '' : 's'} permanently deleted.`; this.done(); }
      else { this.notice = this.store.warning ?? 'Selection changed or contains protected cards. Nothing was deleted.'; this.render(); }
    };
  }
}
