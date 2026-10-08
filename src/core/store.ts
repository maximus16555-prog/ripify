import { activeListing } from './computer-state';
import { CARD_BY_ID, PRODUCTS } from '../data/cards';
import { calculateGrade, GRADERS } from './economy';
import { generatePack, uuid } from './packs';
import { createPack, createSealed, createCard, seeded, canOpenProduct } from './inventory';
import { PRODUCT_BY_ID } from '../data/products';
import { browserStorage, loadSave, newSave, parseSave, type SaveStorage } from './save';
import type { Grader, OwnedCard, Pack, Save, Settings } from './types';
import { createSlabCrack } from './slab-cracking';
import { hydratePopulation, recordGradedCopy } from './population';
import { emptyRareEventStats, recordRareEvents } from './rare-events';
import { disposalProtection, valuableCard } from './card-disposal';
import { samplePortfolio } from './computer';
import { arrivePackages, deliveryDue } from './delivery';
export class GameStore {
  state: Save;
  warning?: string;
  private listeners = new Set<() => void>();
  private cracking = new Set<string>();
  constructor(private storage: SaveStorage = browserStorage) { const loaded = loadSave(storage); this.state = loaded.save; this.warning = loaded.warning; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  persist() { try { this.storage.write(JSON.stringify(this.state)); this.warning = undefined; } catch { this.warning = 'Save failed. Export your save from Settings.'; } }
  private changed() { this.persist(); this.listeners.forEach(fn => fn()); }
  /** Persist first: commerce never exposes unpaid items or half-completed transfers. */
  commit(next: Save) {
    try { this.storage.write(JSON.stringify(next)); } catch { this.warning = 'Could not save. Transaction cancelled.'; return false; }
    this.state = next; this.warning = undefined; this.listeners.forEach(fn => fn()); return true;
  }
  isCardLocked(uid: string) {
    const c = this.state.cards.find(c => c.uid === uid);
    return !c || c.owner !== 'local-player' || c.status === 'grading' || !!c.ownershipLock || !!activeListing(this.state, uid) || this.cracking.has(uid) || this.state.orders.some(o => o.cardUid === uid);
  }
  canCrack(uid: string) { const c = this.state.cards.find(c => c.uid === uid); return !!c && c.status === 'graded' && !this.isCardLocked(uid); }
  deletionProtection(uid: string) {
    const c = this.state.cards.find(c => c.uid === uid);
    return c ? disposalProtection(c, this.isCardLocked(uid)) : 'Card no longer owned';
  }
  /** All or nothing, including stale selections and storage failure. No payout. */
  deleteCards(uids: string[], valuableConfirmed = false, now = Date.now()) {
    const ids = new Set(uids);
    if (!ids.size || [...ids].some(uid => this.deletionProtection(uid))) return false;
    const selected = this.state.cards.filter(c => ids.has(c.uid));
    if (selected.some(c => valuableCard(c, this.state)) && !valuableConfirmed) return false;
    const next = { ...this.state, ...(this.state.computer ? { computer: structuredClone(this.state.computer) } : {}), cards: this.state.cards.filter(c => !ids.has(c.uid)),
      displays: this.state.displays.map(uid => uid && ids.has(uid) ? null : uid),
      gradingPopulation: hydratePopulation({ cards: this.state.cards, gradingPopulation: structuredClone(this.state.gradingPopulation ?? []) }),
      cardDisposals: [...(this.state.cardDisposals ?? []), { uid: uuid(), at: now, cards: selected.map(c => {
        const { uid, cardId, condition, acquiredAt, source, finish, origin, baseRawValue, misprint, gradingHistory, crackHistory } = c;
        return structuredClone({ uid, cardId, condition, acquiredAt, source, finish, origin, baseRawValue, misprint, gradingHistory, crackHistory });
      }) }]
    };
    samplePortfolio(next);
    return this.commit(next);
  }
  crackSlab(uid: string, seed?: number, now = Date.now()) {
    if (!this.canCrack(uid)) return null;
    const card = this.state.cards.find(c => c.uid === uid)!;
    const event = createSlabCrack(card, seed, now);
    const history = [...(card.gradingHistory ?? [])];
    if (history.at(-1)?.grader !== event.grader || history.at(-1)?.grade !== event.grade) history.push({ grader: event.grader, grade: event.grade, at: now, orderUid: event.uid });
    const replacement: OwnedCard = { ...card, status: 'raw', condition: { ...event.conditionAfter }, gradingHistory: history, crackHistory: [...(card.crackHistory ?? []), event] };
    delete replacement.grader; delete replacement.grade; delete replacement.subgrades;
    const population = hydratePopulation({ cards: this.state.cards, gradingPopulation: structuredClone(this.state.gradingPopulation ?? []) });
    const displays = this.state.displays.map(d => d === uid ? null : d);
    const committed = { ...this.state, gradingPopulation: population, displays, cards: this.state.cards.map(c => c.uid === uid ? replacement : c) };
    // No result/animation is exposed until this one durable transaction succeeds.
    try { this.storage.write(JSON.stringify(committed)); }
    catch { this.warning = 'Could not save. The slab was not cracked.'; return null; }
    Object.assign(card.condition, replacement.condition); card.status = 'raw'; card.gradingHistory = history; card.crackHistory = replacement.crackHistory;
    delete card.grader; delete card.grade; delete card.subgrades;
    this.state.gradingPopulation = population; this.state.displays = displays;
    this.cracking.add(uid); this.warning = undefined; this.listeners.forEach(fn => fn());
    return event;
  }
  finishCrack(uid: string) { this.cracking.delete(uid); }
  grantCurrencyBonus() {
    this.state.currency = Math.round((this.state.currency + 10) * 100) / 100;
    this.changed();
  }
  addUnopenedPack(pack: Pack) {
    const p = PRODUCT_BY_ID.get(pack.productId);
    if (!p || p.type !== 'booster' || !canOpenProduct(p) || p.setCode !== pack.setCode || pack.state !== 'unopened' || this.state.packs.some(item => item.uid === pack.uid) || this.state.opening?.pack.uid === pack.uid || this.state.packReceipts?.some(r => r.pack.uid === pack.uid)) return false;
    this.state.packs.push(pack); this.changed(); return true;
  }
  private log(type: Save['history'][number]['type'], amount: number, label: string) { if (type === 'sale') this.state.stats.totalSales = Math.round(((this.state.stats.totalSales ?? this.state.history.filter(h => h.type === 'sale').reduce((n, h) => n + h.amount, 0)) + amount) * 100) / 100; this.state.history.push({ uid: uuid(), type, amount, label, at: Date.now() }); this.state.history = this.state.history.slice(-100); }
  buy(code: string) {
    const p = PRODUCTS.find(p => p.code === code);
    if (!p || !canOpenProduct(p) || this.state.currency < p.price) return false;
    this.state.currency = Math.round((this.state.currency - p.price) * 100) / 100;
    if (p.type === 'booster') this.state.packs.push(createPack(p.code, p.price));
    else this.state.sealedProducts.push(createSealed(p, p.price));
    this.state.stats.spent += p.price; this.log('purchase', -p.price, p.name); this.changed(); return true;
  }
  startOpening(uid: string) {
    if (this.state.opening || this.state.containerOpening || activeListing(this.state, uid)) return false;
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
    if (this.state.opening || this.state.containerOpening || activeListing(this.state, uid)) return false;
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
  display(uid: string, slot: number) {
    const c = this.state.cards.find(c => c.uid === uid); if (!c || this.isCardLocked(uid) || !Number.isInteger(slot) || slot < 0 || slot > 2) return false;
    this.state.displays = this.state.displays.map(d => d === uid ? null : d); this.state.displays[slot] = uid; this.changed(); return true;
  }
  clearDisplay(slot: number) { if (slot >= 0 && slot < 3) { this.state.displays[slot] = null; this.changed(); } }
  submit(uid: string, grader: Grader, service: 'Standard' | 'Express') {
    const c = this.state.cards.find(c => c.uid === uid); if (!c || this.isCardLocked(uid) || c.finish === 'metal' || c.status !== 'raw' || !Object.hasOwn(GRADERS, grader) || !['Standard', 'Express'].includes(service)) return false;
    const g = GRADERS[grader]; const cost = g.cost * (service === 'Express' ? 1.8 : 1);
    if (this.state.currency < cost) return false;
    const result = calculateGrade(c, grader); const now = Date.now();
    this.state.currency = Math.round((this.state.currency - cost) * 100) / 100; c.status = 'grading';
    this.state.displays = this.state.displays.map(d => d === uid ? null : d);
    this.state.orders.push({ uid: uuid(), cardUid: uid, grader, service, paid: cost, sentAt: now, dueAt: now + g.seconds * (service === 'Express' ? .4 : 1) * 1000, result: result.grade, subgrades: result.subgrades });
    this.state.stats.spent += cost; this.log('grading', -cost, `${grader} · ${CARD_BY_ID.get(c.cardId)!.name}`); this.changed(); return true;
  }
  receive(uid: string, now = Date.now()): OwnedCard | null {
    const o = this.state.orders.find(o => o.uid === uid);
    const p = this.state.shippingPackages?.find(p => p.source === 'grading' && p.orderUids.includes(uid) && p.stage === 'open');
    return o && p && this.claimPackage(p.uid, now) ? this.state.cards.find(c => c.uid === o.cardUid)! : null;
  }
  arriveDeliveries(now = Date.now()) {
    if (!deliveryDue(this.state, now)) return true;
    const next = structuredClone(this.state); arrivePackages(next, now); return this.commit(next);
  }
  packageStage(uid: string, stage: 'untaped' | 'open') {
    const p = this.state.shippingPackages?.find(p => p.uid === uid);
    if (!p || (stage === 'untaped' ? p.stage !== 'sealed' : p.stage !== 'untaped')) return false;
    const next = structuredClone(this.state); next.shippingPackages!.find(p => p.uid === uid)!.stage = stage; return this.commit(next);
  }
  /** One durable claim releases the exact order instances, never replacement copies. */
  claimPackage(uid: string, now = Date.now()) {
    const current = this.state.shippingPackages?.find(p => p.uid === uid);
    if (!current || current.stage !== 'open') return false;
    const next = structuredClone(this.state), p = next.shippingPackages!.find(p => p.uid === uid)!;
    if (p.source === 'store') {
      const orders = p.orderUids.map(uid => next.computer?.orders.find(o => o.uid === uid && o.status === 'DELIVERED'));
      if (orders.some(o => !o)) return false;
      const items = orders.flatMap(o => o!.items);
      if (items.length !== p.itemUids.length || items.some(i => !p.itemUids.includes(i.uid) || [...next.packs, ...next.sealedProducts].some(owned => owned.uid === i.uid))) return false;
      for (const item of items) { if ('generationVersion' in item) next.packs.push(item); else next.sealedProducts.push(item); }
    } else {
      const orders = p.orderUids.map(uid => next.orders.find(o => o.uid === uid && o.dueAt <= now));
      if (orders.some(o => !o) || orders.length !== p.itemUids.length) return false;
      for (const o of orders) {
        const c = next.cards.find(c => c.uid === o!.cardUid && c.status === 'grading');
        if (!c || !p.itemUids.includes(c.uid)) return false;
        (c.gradingHistory ??= []).push({ grader: o!.grader, grade: o!.result, at: now, orderUid: o!.uid });
        c.status = 'graded'; c.grader = o!.grader; c.grade = o!.result;
        if (o!.grader === 'BGS') c.subgrades = [...o!.subgrades]; else delete c.subgrades;
        recordGradedCopy(next.gradingPopulation ??= [], { cardUid: c.uid, cardId: c.cardId, grader: o!.grader, grade: o!.result });
      }
      next.orders = next.orders.filter(o => !p.orderUids.includes(o.uid));
    }
    p.stage = 'claimed'; p.claimedAt = now; samplePortfolio(next); return this.commit(next);
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
    this.state = replacement; this.cracking.clear(); this.warning = undefined;
    this.listeners.forEach(fn => fn()); return true;
  }
  import(raw: string) { const replacement = parseSave(raw); this.state = replacement; this.cracking.clear(); this.changed(); }
}
export function orderStatus(sentAt: number, dueAt: number, now = Date.now()) {
  const progress = (now - sentAt) / (dueAt - sentAt);
  return progress >= 1 ? 'Delivered' : progress >= .8 ? 'Returning' : progress >= .25 ? 'Grading' : 'Shipped';
}
