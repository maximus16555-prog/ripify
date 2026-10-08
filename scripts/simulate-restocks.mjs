import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';

// Isolated, deterministic demand audit. Never reads or awards a player's save.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { COMMERCE, stock } = await server.ssrLoadModule('/src/core/computer.ts');
  const { seeded } = await server.ssrLoadModule('/src/core/inventory.ts');
  const previous = {
    stock: { '151-booster': 35, '151-etb': 12, '151-upc': 6, 'ascended-heroes-booster': 24 },
    demand: { '151-booster': .13, '151-etb': .055, '151-upc': .033, 'ascended-heroes-booster': .2 }
  };
  function oldStock(s, id) {
    const day = Math.floor(s.computer.minute / 1440), since = s.computer.minute % 1440 - 570;
    if (since < 0) return 0;
    const hash = [...id].reduce((n, c) => n + c.charCodeAt(0), 0);
    const r = seeded((Math.floor(s.marketSeed * 1000) + day * 917 + hash) >>> 0)();
    return Math.max(0, previous.stock[id] - Math.floor(since * previous.demand[id] * (.8 + r * .4)));
  }
  const products = [];
  for (const id of Object.keys(COMMERCE.stock)) {
    let beforeMinutes = 0, afterMinutes = 0;
    const observations = Object.fromEntries([0, 240, 720, 1080, 1439].map(minute => [minute, { before: 0, after: 0 }]));
    for (let seed = 1; seed <= 1000; seed++) {
      const s = { marketSeed: seed / 10, computer: { minute: 570, drops: {} } };
      for (let elapsed = 0; elapsed < 1440; elapsed++) {
        s.computer.minute = 570 + elapsed;
        const before = oldStock(s, id), after = stock(s, id);
        beforeMinutes += Number(before > 0); afterMinutes += Number(after > 0);
        if (observations[elapsed]) { observations[elapsed].before += before / 1000; observations[elapsed].after += after / 1000; }
      }
    }
    products.push({ productId: id, batchBefore: previous.stock[id], batchAfter: COMMERCE.stock[id],
      availableCyclePercent: { before: +(beforeMinutes / 14400).toFixed(2), after: +(afterMinutes / 14400).toFixed(2) },
      averageRealMinutesAvailableAtDefaultClock: { before: +(beforeMinutes / 30000).toFixed(2), after: +(afterMinutes / 30000).toFixed(2) },
      meanStockByMinutesSinceDrop: Object.fromEntries(Object.entries(observations).map(([minute, counts]) => [minute, Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, +n.toFixed(2)]))])) });
  }
  const report = { seeds: 1000, minutesPerCycle: 1440, schedule: 'Daily 9:30 AM game time', playerPurchases: 0, defaultGameSecondsPerRealSecond: 30, products };
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/store-restock-simulation.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(products.map(p => ({ product: p.productId, batches: [p.batchBefore, p.batchAfter], availability: p.availableCyclePercent, realMinutes: p.averageRealMinutesAvailableAtDefaultClock })), null, 2));
} finally { await server.close(); }
