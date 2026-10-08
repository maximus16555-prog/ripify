import { sellOnEbay } from './ebay-sale';
import { receiveReturn } from './receive-return';
import { GameStore } from '../../src/core/store';

export function progressedGame() {
  const store = new GameStore({ read: () => null, write: () => {}, backup: () => {} });
  store.state.currency = 1000;
  store.buy('151-upc'); store.startContainer(store.state.sealedProducts[0].uid); store.liftLid(); store.takeContents();
  store.submit(store.state.cards[0].uid, 'PSA', 'Standard'); receiveReturn(store, store.state.orders[0].uid, Number.MAX_SAFE_INTEGER);
  store.display(store.state.cards[0].uid, 0);
  store.submit(store.state.cards[1].uid, 'BGS', 'Standard');
  store.buy('151-etb');
  store.startOpening(store.state.packs[0].uid); store.rip();
  for (let i = 0; i < 11; i++) store.swipe();
  store.collect(); sellOnEbay(store, store.state.cards.at(-1)!.uid);
  store.startOpening(store.state.packs[0].uid); store.rip(); store.swipe();
  store.settings({ graphics: 'Medium', master: .35, sensitivity: 1.3, controlsLearned: true });
  store.state.legacyArchive = { oldProgress: true };
  return store.state;
}
