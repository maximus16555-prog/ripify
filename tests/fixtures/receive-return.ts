import type { GameStore } from '../../src/core/store';

/** Existing grading fixtures now fulfill the same persisted shipping stages as gameplay. */
export function receiveReturn(store: GameStore, orderUid: string, now = Date.now()) {
  if (!store.state.orders.some(o => o.uid === orderUid && o.dueAt <= now)) return null;
  store.arriveDeliveries(now);
  const box = store.state.shippingPackages!.find(p => p.source === 'grading' && p.orderUids.includes(orderUid))!;
  store.packageStage(box.uid, 'untaped');
  store.packageStage(box.uid, 'open');
  return store.receive(orderUid, now);
}
