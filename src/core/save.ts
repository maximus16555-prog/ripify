import { validateLocalShop } from './local-shop';
import { validateComputer } from './computer-state';
import { CARD_BY_ID, PRODUCTS } from '../data/cards';
import { createPack } from './inventory';
import { PRODUCT_BY_ID } from '../data/products';
import { GRADERS } from './economy';
import type { Save, Settings, OwnedCard, Pack, SealedProduct, PackReceipt } from './types';
import { emptyRareEventStats } from './rare-events';
import { validCardMisprint, validPackEvents, validOpeningEvents } from './rare-event-validation';
import { validSlabHistory } from './slab-validation';
import { hydratePopulation } from './population';
import { validatePackages } from './delivery';
export const SAVE_KEY = 'ripify.save.v1';
export const DEFAULT_SETTINGS: Settings = { graphics: 'Auto', renderScale: 1, sensitivity: 1, master: .65, music: .25, sfx: .6, fps: false, controlsLearned: false };
export function newSave(): Save {
  return { version: 2, rareEventStats: emptyRareEventStats(), currency: 120, packs: [createPack()], sealedProducts: [], containerOpening: null, productReceipts: [], cards: [], orders: [], opening: null, displays: [null, null, null], settings: { ...DEFAULT_SETTINGS }, stats: { opened: 0, sold: 0, spent: 0 }, history: [], marketSeed: Math.random() * 100 };
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(v);
const validSeed = (v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 4294967295;
const validPack = (v: unknown): v is Pack => record(v) && validId(v.uid) && typeof v.productId === 'string' && PRODUCT_BY_ID.get(v.productId)?.type === 'booster' && PRODUCT_BY_ID.get(v.productId)?.setCode === v.setCode && finite(v.price) && v.price >= 0 && finite(v.purchasedAt) && v.variant === 0 && validSeed(v.seed) && v.owner === 'local-player' && v.state === 'unopened' && (v.generationVersion === 1 || v.generationVersion === 2) && (v.rareEvents === undefined || (v.generationVersion === 2 && validPackEvents(v.rareEvents, v as unknown as Pack))) && (v.debugGenerated === undefined || v.debugGenerated === true) && (v.sourceProduct === undefined || validId(v.sourceProduct));
const validSealed = (v: unknown): v is SealedProduct => record(v) && validId(v.uid) && typeof v.productId === 'string' && PRODUCT_BY_ID.has(v.productId) && PRODUCT_BY_ID.get(v.productId)?.type !== 'booster' && finite(v.price) && v.price >= 0 && finite(v.purchasedAt) && validSeed(v.seed) && v.owner === 'local-player' && v.state === 'sealed' && v.manifestRevision === 1;
const validCard = (v: unknown): v is OwnedCard => {
  if (!record(v) || !record(v.condition)) return false;
  const condition = v.condition;
  if (!validCardMisprint(v) || !validSlabHistory(v)) return false;
  if (v.gradingHistory !== undefined && (!Array.isArray(v.gradingHistory) || !v.gradingHistory.every(h => record(h) && typeof h.grader === 'string' && Object.hasOwn(GRADERS, h.grader) && finite(h.grade) && h.grade >= 1 && h.grade <= 10 && finite(h.at) && validId(h.orderUid)))) return false;
  return v.owner === 'local-player' && ['normal', 'holo', 'reverse', 'metal'].includes(String(v.finish)) && ['pack', 'promo'].includes(String(v.origin)) && (v.finish !== 'metal' || (v.cardId === 'sv03.5-205' && v.origin === 'promo')) && validId(v.uid) && typeof v.cardId === 'string' && CARD_BY_ID.has(v.cardId) && ['centering', 'corners', 'edges', 'surface', 'print'].every(k => finite(condition[k]) && Number(condition[k]) >= 0 && Number(condition[k]) <= 100) && finite(v.acquiredAt) && typeof v.source === 'string' && typeof v.favorite === 'boolean' && ['raw', 'grading', 'graded'].includes(String(v.status)) && (v.grader === undefined || (typeof v.grader === 'string' && Object.hasOwn(GRADERS, v.grader))) && (v.grade === undefined || (finite(v.grade) && v.grade >= 1 && v.grade <= 10)) && (v.subgrades === undefined || (Array.isArray(v.subgrades) && v.subgrades.length === 4 && v.subgrades.every(n => finite(n) && n >= 1 && n <= 10))) && (v.status !== 'graded' || (v.grader !== undefined && v.grade !== undefined));
};
export function parseSave(raw: string): Save {
  let v: unknown = JSON.parse(raw);
  if (record(v) && v.version === 1) {
    if (!finite(v.currency) || v.currency < 0 || !Array.isArray(v.packs) || !Array.isArray(v.cards) || !Array.isArray(v.orders)) throw new Error('Invalid legacy save');
    // Never relabel invented IDs as real printings. Keep the original inventory intact in the exportable archive.
    v = { ...newSave(), currency: v.currency, packs: [], settings: v.settings, stats: v.stats, history: v.history, marketSeed: v.marketSeed, legacyArchive: v };
  }
  if (!record(v) || v.version !== 2 || !finite(v.currency) || v.currency < 0 || !Array.isArray(v.packs) || !Array.isArray(v.cards) || !Array.isArray(v.orders)) throw new Error('Invalid or unsupported save');
  if (!v.packs.every(validPack) || !v.cards.every(validCard)) throw new Error('Invalid inventory');
  const packs = v.packs as Pack[]; const cards = v.cards as OwnedCard[];
  if (new Set(packs.map(p => p.uid)).size !== packs.length || new Set(cards.map(c => c.uid)).size !== cards.length) throw new Error('Duplicate inventory');
  const result = newSave();
  result.currency = v.currency; result.packs = packs; result.cards = cards;
  if (v.cardDisposals !== undefined) {
    if (!Array.isArray(v.cardDisposals) || !v.cardDisposals.every(r => record(r) && validId(r.uid) && finite(r.at) && Array.isArray(r.cards) && r.cards.length > 0 && r.cards.every(c => record(c) && validCard({ ...c, owner: 'local-player', status: 'raw', favorite: false })))) throw new Error('Invalid card disposal history');
    const disposed = v.cardDisposals.flatMap(r => r.cards.map((c: { uid: string }) => c.uid));
    if (new Set(v.cardDisposals.map(r => r.uid)).size !== v.cardDisposals.length || new Set(disposed).size !== disposed.length || disposed.some(uid => [...packs, ...cards].some(c => c.uid === uid) || (record(v.opening) && Array.isArray(v.opening.cards) && v.opening.cards.some(c => record(c) && c.uid === uid)))) throw new Error('Disposed card still in inventory');
    result.cardDisposals = v.cardDisposals as unknown as Save['cardDisposals'];
  }
  if (v.gradingPopulation !== undefined) {
    if (!Array.isArray(v.gradingPopulation) || !v.gradingPopulation.every(e => record(e) && validId(e.cardUid) && typeof e.cardId === 'string' && CARD_BY_ID.has(e.cardId) && typeof e.grader === 'string' && Object.hasOwn(GRADERS, e.grader) && finite(e.grade) && e.grade >= 1 && e.grade <= 10 && (!cards.some(c => c.uid === e.cardUid) || cards.find(c => c.uid === e.cardUid)!.cardId === e.cardId))) throw new Error('Invalid grading population');
    result.gradingPopulation = [];
    for (const e of v.gradingPopulation) if (!result.gradingPopulation.some(p => p.cardUid === e.cardUid && p.cardId === e.cardId && p.grader === e.grader && p.grade === e.grade)) result.gradingPopulation.push(e as unknown as NonNullable<Save['gradingPopulation']>[number]);
  }
  if (result.gradingPopulation || cards.some(c => c.status === 'graded' || c.gradingHistory?.length || c.crackHistory?.length)) hydratePopulation(result);
  if (v.packReceipts !== undefined) {
    if (!Array.isArray(v.packReceipts) || !v.packReceipts.every(r => {
      if (!record(r) || !validPack(r.pack) || r.pack.generationVersion !== 2 || !r.pack.rareEvents || !finite(r.generatedAt) || !Array.isArray(r.cards) || r.cards.length !== 11) return false;
      const pack = r.pack;
      const receiptCards: (Record<string, unknown> | null)[] = r.cards.map(c => record(c) ? { ...c, source: pack.uid, origin: 'pack' } : null);
      return receiptCards.every(c => c && validId(c.uid) && typeof c.cardId === 'string' && [pack.setCode, 'sve'].includes(CARD_BY_ID.get(c.cardId)?.setCode ?? '') && ['normal', 'reverse', 'holo'].includes(String(c.finish)) && validCardMisprint(c)) && new Set(receiptCards.map(c => c?.uid)).size === 11 && new Set(receiptCards.map(c => c?.cardId)).size === 11 && validOpeningEvents(r.pack, receiptCards as unknown as OwnedCard[]);
    }) || new Set(v.packReceipts.map(r => r.pack.uid)).size !== v.packReceipts.length) throw new Error('Invalid pack receipts');
    result.packReceipts = v.packReceipts as PackReceipt[];
  }
  if (v.rareEventStats !== undefined) {
    if (!record(v.rareEventStats) || !Object.keys(emptyRareEventStats()).every(key => Number.isSafeInteger((v.rareEventStats as Record<string, unknown>)[key]) && Number((v.rareEventStats as Record<string, unknown>)[key]) >= 0)) throw new Error('Invalid rare-event statistics');
    result.rareEventStats = v.rareEventStats as unknown as Save['rareEventStats'];
  }
  if (!Array.isArray(v.sealedProducts) || !v.sealedProducts.every(validSealed) || !Array.isArray(v.productReceipts)) throw new Error('Invalid sealed inventory');
  result.sealedProducts = v.sealedProducts;
  const ids = [...packs, ...cards, ...result.sealedProducts].map(item => item.uid);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate inventory');
  result.productReceipts = v.productReceipts.filter(r => record(r) && validId(r.productUid) && typeof r.productId === 'string' && PRODUCT_BY_ID.has(r.productId) && finite(r.openedAt) && Array.isArray(r.packUids) && r.packUids.every(validId) && Array.isArray(r.cardUids) && r.cardUids.every(validId)) as Save['productReceipts'];
  if (result.productReceipts.length !== v.productReceipts.length || new Set(result.productReceipts.map(r => r.productUid)).size !== result.productReceipts.length || result.productReceipts.some(r => result.sealedProducts.some(p => p.uid === r.productUid))) throw new Error('Invalid product receipts');
  if (v.containerOpening != null) {
    if (!record(v.containerOpening) || !validId(v.containerOpening.productUid) || !['sealed', 'contents'].includes(String(v.containerOpening.stage)) || !result.sealedProducts.some(p => p.uid === (v.containerOpening as Record<string, unknown>).productUid) || v.opening != null) throw new Error('Invalid container opening');
    result.containerOpening = v.containerOpening as unknown as Save['containerOpening'];
  }
  if (v.legacyArchive !== undefined) result.legacyArchive = v.legacyArchive;
  result.orders = v.orders.filter(o => record(o) && validId(o.uid) && validId(o.cardUid) && cards.some(c => c.uid === o.cardUid && c.status === 'grading') && typeof o.grader === 'string' && Object.hasOwn(GRADERS, o.grader) && ['Standard', 'Express'].includes(String(o.service)) && finite(o.sentAt) && finite(o.dueAt) && o.dueAt > o.sentAt && finite(o.paid) && o.paid >= 0 && finite(o.result) && o.result >= 1 && o.result <= 10 && Array.isArray(o.subgrades) && o.subgrades.length === 4 && o.subgrades.every(n => finite(n) && n >= 1 && n <= 10)) as Save['orders'];
  if (new Set(result.orders.map(o => o.uid)).size !== result.orders.length || new Set(result.orders.map(o => o.cardUid)).size !== result.orders.length) throw new Error('Duplicate grading order');
  for (const card of cards) if (card.status === 'grading' && !result.orders.some(o => o.cardUid === card.uid)) card.status = 'raw';
  if (record(v.opening) && validPack(v.opening.pack) && !packs.some(p => p.uid === (v.opening as Record<string, Pack>).pack.uid) && Array.isArray(v.opening.cards) && v.opening.cards.length === 11 && v.opening.cards.every(validCard) && validOpeningEvents(v.opening.pack, v.opening.cards as OwnedCard[]) && (v.opening.pack.generationVersion === 1 || new Set(v.opening.cards.map(c => (c as OwnedCard).cardId)).size === 11) && new Set(v.opening.cards.map(c => c.uid)).size === 11 && v.opening.cards.every(c => c.status === 'raw' && c.origin === 'pack' && c.source === (v.opening as Record<string, Pack>).pack.uid && [(v.opening as Record<string, Pack>).pack.setCode, 'sve'].includes(CARD_BY_ID.get(c.cardId)!.setCode)) && !v.opening.cards.some(c => cards.some(owned => owned.uid === c.uid)) && ['sealed', 'cards', 'complete'].includes(String(v.opening.stage)) && Number.isInteger(v.opening.index) && Number(v.opening.index) >= 0 && Number(v.opening.index) <= 10 && (v.opening.stage !== 'sealed' || v.opening.index === 0) && (v.opening.stage !== 'complete' || v.opening.index === 10)) result.opening = v.opening as unknown as Save['opening'];
  else if (v.opening != null) throw new Error('Invalid opening');
  if (Array.isArray(v.displays)) { const displays = v.displays; result.displays = [0, 1, 2].map(i => typeof displays[i] === 'string' && cards.some(c => c.uid === displays[i] && c.status !== 'grading') ? displays[i] as string : null); }
  if (record(v.settings)) {
    const s = v.settings;
    if (['Auto', 'Low', 'Medium', 'High'].includes(String(s.graphics))) result.settings.graphics = s.graphics as Settings['graphics'];
    for (const k of ['renderScale', 'sensitivity', 'master', 'music', 'sfx'] as const) if (finite(s[k])) result.settings[k] = Math.max(k === 'sensitivity' ? .3 : k === 'renderScale' ? .5 : 0, Math.min(k === 'sensitivity' ? 2 : k === 'renderScale' ? 1.5 : 1, s[k]));
    result.settings.fps = s.fps === true;
    result.settings.controlsLearned = s.controlsLearned === true;
  }
  if (record(v.stats)) for (const k of ['opened', 'sold', 'spent', 'totalSales'] as const) if (finite(v.stats[k]) && v.stats[k] >= 0) result.stats[k] = v.stats[k];
  if (finite(v.marketSeed)) result.marketSeed = v.marketSeed;
  if (Array.isArray(v.history)) result.history = v.history.filter(h => record(h) && typeof h.uid === 'string' && ['purchase', 'sale', 'grading'].includes(String(h.type)) && finite(h.amount) && typeof h.label === 'string' && finite(h.at)).slice(-100) as Save['history'];
  if (v.computer !== undefined) result.computer = validateComputer(v.computer, result, validPack, validSealed);
  if (v.shippingPackages !== undefined) result.shippingPackages = validatePackages(v.shippingPackages, result);
  if (v.localShop !== undefined) result.localShop = validateLocalShop(v.localShop, result, validCard);
  return result;
}
export interface SaveStorage { read(): string | null; write(data: string): void; backup(data: string): void; clearRecovery?(): void }
export const browserStorage: SaveStorage = { read: () => localStorage.getItem(SAVE_KEY), write: d => localStorage.setItem(SAVE_KEY, d), backup: d => localStorage.setItem(`${SAVE_KEY}.recovery`, d), clearRecovery: () => localStorage.removeItem(`${SAVE_KEY}.recovery`) };
export function loadSave(storage: SaveStorage = browserStorage): { save: Save; warning?: string } {
  let raw: string | null = null;
  try { raw = storage.read(); const save = raw ? parseSave(raw) : newSave(); return { save, warning: save.legacyArchive ? 'Legacy inventory archived. Export your save to keep it.' : undefined }; }
  catch { if (raw) { try { storage.backup(raw); } catch { /* Original key remains untouched until next write. */ } } return { save: newSave(), warning: raw ? 'Save could not be loaded. A recovery copy was kept where storage permits.' : 'Storage unavailable. Progress is temporary.' }; }
}
