import { ComputerServices } from '../../src/core/computer';
import { ownedValue } from '../../src/core/economy';
import type { GameStore } from '../../src/core/store';

/** Test-only deterministic buyer outcome; settlement uses the real eBay transaction. */
export function sellOnEbay(store: GameStore, uid: string) {
  const card = store.state.cards.find(c => c.uid === uid);
  if (!card) return false;
  const services = new ComputerServices(store);
  if (!services.list('card', uid, ownedValue(card, store.state.marketSeed))) return false;
  const listing = store.state.computer!.listings.at(-1)!;
  listing.outcome = 'sale';
  store.state.computer!.minute = listing.due;
  services.advance();
  return store.state.computer!.listings.find(l => l.uid === listing.uid)!.status === 'SOLD';
}
