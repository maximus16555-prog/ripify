import { CARD_BY_ID, PRODUCTS } from '../data/cards';
import { calculateGrade, GRADERS, ownedValue } from './economy';
import { generatePack, uuid } from './packs';
import { createPack, createSealed, createCard, seeded, canOpenProduct } from './inventory';
import { PRODUCT_BY_ID } from '../data/products';
import { browserStorage, loadSave, newSave, parseSave, type SaveStorage } from './save';
import type { Grader, OwnedCard, Pack, Save, Settings } from './types';
import { emptyRareEventStats, recordRareEvents } from './rare-events';
export class GameStore {
  state: Save;
  warning?: string;
  private listeners = new Set<() => void>();
  constructor(private storage: SaveStorage = browserStorage) { const loaded = loadSave(storage); this.state = loaded.save; this.warning = loaded.warning; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  persist() { try { this.storage.write(JSON.stringify(this.state)); this.warning = undefined; } catch { this.warning = 'Save failed. Export your save from Settings.'; } }
  private changed() { this.persist(); this.listeners.forEach(fn => fn()); }
  grantCurrencyBonus() {
    this.state.currency = Math.round((this.state.currency + 10) * 100) / 100;
    this.changed();
  }
  addUnopenedPack(pack: Pack) {
    const p = PRODUCT_BY_ID.get(pack.productId);
    if (!p || p.type !== 'booster' || !canOpenProduct(p) || p.setCode !== pack.setCode || pack.state !== 'unopened' || this.state.packs.some(item => item.uid === pack.uid) || this.state.opening?.pack.uid === pack.uid || this.state.packReceipts?.some(r => r.pack.uid === pack.uid)) return false;
    this.state.packs.push(pack); this.changed(); return true;
  }
  private log(type: Save['history'][number]['type'], amount: number, label: string) { this.state.history.push({ uid: uuid(), type, amount, label, at: Date.now() }); this.state.history = this.state.history.slice(-100); }
  buy(code: string) {
    const p = PRODUCTS.find(p => p.code === code);
    if (!p || !canOpenProduct(p) || this.state.currency < p.price) return false;
    this.state.currency = Math.round((this.state.currency - p.price) * 100) / 100;
    if (p.type === 'booster') this.state.packs.push(createPack(p.code, p.price));
    else this.state.sealedProducts.push(createSealed(p, p.price));
    this.state.stats.spent += p.price; this.log('purchase', -p.price, p.name); this.changed(); return true;
  }
  startOpening(uid: string) {
    if (this.state.opening || this.state.containerOpening) return false;
    const pack = this.state.packs.find(p => p.uid === uid); if (!pack) return false;
    // Unopened old packs have no generated results. Never upgrade/re-generate
    // the persisted cards in an existing opening.
    pack.generationVersion = 2;
    const cards = generatePack(pack);
    recordRareEvents(this.state.rareEventStats ??= emptyRareEventStats(), pack, cards);
    (this.state.packReceipts ??= []).push({ pack: structuredClone(pack), generatedAt: cards[0].acquiredAt, cards: cards.map(({ uid, cardId, finish, baseRawValue, misprint }) => ({ uid, cardId, finish, baseRawValue, ...(misprint ? { misprint: structuredClone(misprint) } : {}) })) });
    this.state.packs = this.state.packs.filter(p => p.uid !== uid);
    this.state.opening = { pack, cards, stage: 'sealed', index: 0 }; this.changed(); return true;
  }
  startContainer(uid: string) {
    if (this.state.opening || this.state.containerOpening) return false;
    const owned = this.state.sealedProducts.find(p => p.uid === uid);
    const p = owned && PRODUCT_BY_ID.get(owned.productId);
    if (!p || !canOpenProduct(p) || owned?.manifestRevision !== p.manifest.revision) return false;
    this.state.containerOpening = { productUid: uid, stage: 'sealed' }; this.changed(); return true;
  }
  liftLid() {
    const o = this.state.containerOpening; if (!o || o.stage !== 'sealed') return false;
    o.stage = 'contents'; this.changed(); return true;
  }
  takeContents() {
    const o = this.state.containerOpening; if (!o || o.stage !== 'contents') return false;
    const owned = this.state.sealedProducts.find(p => p.uid === o.productUid); const p = owned && PRODUCT_BY_ID.get(owned.productId);
    if (!owned || !p || owned.manifestRevision !== p.manifest.revision || !canOpenProduct(p) || this.state.productReceipts.some(r => r.productUid === owned.uid)) return false;
    const random = seeded(owned.seed); const now = Date.now();
    // Construct everything before mutating inventory; one persisted transaction resolves the container.
    const packs = p.manifest.packs.flatMap(item => Array.from({ length: item.quantity }, () => createPack(item.productId, 0, owned.uid, Math.floor(random() * 4294967296), now)));
    const cards = p.manifest.cards.flatMap(item => Array.from({ length: item.quantity }, () => createCard(item.cardId, owned.uid, random, item.finish, 'promo', now)));
    this.state.packs.push(...packs); this.state.cards.push(...cards);
    this.state.sealedProducts = this.state.sealedProducts.filter(item => item.uid !== owned.uid);
    this.state.productReceipts.push({ productUid: owned.uid, productId: p.code, openedAt: now, packUids: packs.map(pack => pack.uid), cardUids: cards.map(card => card.uid) });
    this.state.containerOpening = null; this.changed(); return true;
  }
  keepSealed() {
    if (this.state.containerOpening?.stage !== 'sealed') return false;
    this.state.containerOpening = null; this.changed(); return true;
  }
  rip() { if (this.state.opening?.stage !== 'sealed') return false; this.state.opening.stage = 'cards'; this.changed(); return true; }
  swipe() {
    const o = this.state.opening; if (!o || o.stage !== 'cards') return false;
    if (o.index < o.cards.length - 1) o.index++; else o.stage = 'complete';
    this.changed(); return true;
  }
  collect() {
    const o = this.state.opening; if (!o || o.stage !== 'complete') return false;
    this.state.cards.push(...o.cards); this.state.stats.opened++; this.state.opening = null; this.changed(); return true;
  }
  favorite(uid: string) { const c = this.state.cards.find(c => c.uid === uid); if (c) { c.favorite = !c.favorite; this.changed(); } }
  sell(uid: string) {
    const c = this.state.cards.find(c => c.uid === uid); if (!c || c.status === 'grading') return false;
    const value = ownedValue(c, this.state.marketSeed);
    this.state.currency = Math.round((this.state.currency + value) * 100) / 100;
    this.state.cards = this.state.cards.filter(c => c.uid !== uid);
    this.state.displays = this.state.displays.map(d => d === uid ? null : d);
    this.state.stats.sold++; this.log('sale', value, CARD_BY_ID.get(c.cardId)!.name); this.changed(); return true;
  }
  display(uid: string, slot: number) {
    const c = this.state.cards.find(c => c.uid === uid); if (!c || c.status === 'grading' || !Number.isInteger(slot) || slot < 0 || slot > 2) return false;
    this.state.displays = this.state.displays.map(d => d === uid ? null : d); this.state.displays[slot] = uid; this.changed(); return true;
  }
  clearDisplay(slot: number) { if (slot >= 0 && slot < 3) { this.state.displays[slot] = null; this.changed(); } }
  submit(uid: string, grader: Grader, service: 'Standard' | 'Express') {
    const c = this.state.cards.find(c => c.uid === uid); if (!c || c.finish === 'metal' || c.status !== 'raw' || !Object.hasOwn(GRADERS, grader) || !['Standard', 'Express'].includes(service)) return false;
    const g = GRADERS[grader]; const cost = g.cost * (service === 'Express' ? 1.8 : 1);
    if (this.state.currency < cost) return false;
    const result = calculateGrade(c, grader); const now = Date.now();
    this.state.currency = Math.round((this.state.currency - cost) * 100) / 100; c.status = 'grading';
    this.state.displays = this.state.displays.map(d => d === uid ? null : d);
    this.state.orders.push({ uid: uuid(), cardUid: uid, grader, service, paid: cost, sentAt: now, dueAt: now + g.seconds * (service === 'Express' ? .4 : 1) * 1000, result: result.grade, subgrades: result.subgrades });
    this.state.stats.spent += cost; this.log('grading', -cost, `${grader} · ${CARD_BY_ID.get(c.cardId)!.name}`); this.changed(); return true;
  }
  receive(uid: string, now = Date.now()): OwnedCard | null {
    const o = this.state.orders.find(o => o.uid === uid); if (!o || now < o.dueAt) return null;
    const c = this.state.cards.find(c => c.uid === o.cardUid); if (!c) return null;
    (c.gradingHistory ??= []).push({ grader: o.grader, grade: o.result, at: now, orderUid: o.uid });
    c.status = 'graded'; c.grader = o.grader; c.grade = o.result; if (o.grader === 'BGS') c.subgrades = o.subgrades;
    this.state.orders = this.state.orders.filter(o => o.uid !== uid); this.changed(); return c;
  }
  settings(patch: Partial<Settings>) { Object.assign(this.state.settings, patch); this.changed(); }
  resetProgress() {
    const replacement = newSave();
    replacement.settings = { ...this.state.settings, controlsLearned: false };
    // Commit the fresh save before replacing live inventory. A storage failure
    // must not discard the session or falsely report a successful reset.
    try { this.storage.write(JSON.stringify(replacement)); }
    catch { this.warning = 'Reset failed. Your progress is unchanged.'; return false; }
    try { this.storage.clearRecovery?.(); } catch { /* Recovery copies are never loaded as active saves. */ }
    this.state = replacement; this.warning = undefined;
    this.listeners.forEach(fn => fn()); return true;
  }
  import(raw: string) { const replacement = parseSave(raw); this.state = replacement; this.changed(); }
}
export function orderStatus(sentAt: number, dueAt: number, now = Date.now()) {
  const progress = (now - sentAt) / (dueAt - sentAt);
  return progress >= 1 ? 'Delivered' : progress >= .8 ? 'Returning' : progress >= .25 ? 'Grading' : 'Shipped';
}
