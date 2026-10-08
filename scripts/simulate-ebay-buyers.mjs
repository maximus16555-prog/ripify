import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';

// Isolated development simulation: no GameStore, browser storage, or player items.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, entries: [] } });
try {
  const { rollBuyer, buyerTerms } = await server.ssrLoadModule('/src/core/ebay-buyers.ts');
  const { seeded } = await server.ssrLoadModule('/src/core/inventory.ts');
  const market = 22, count = 100000, results = [];
  for (const asking of [11, 19.5, 22, 25, 33, 44]) {
    const random = seeded(810), waits = []; let sales = 0, offers = 0;
    for (let i = 0; i < count; i++) {
      const buyer = rollBuyer(asking, market, 1, random);
      sales += Number(buyer.outcome === 'sale'); offers += Number(buyer.outcome === 'offer'); waits.push(buyer.minutes);
    }
    waits.sort((a, b) => a - b);
    results.push({ asking, market, simulatedListings: count,
      previousSaleChance: Math.min(.93, .8 / Math.max(.5, (asking / market) ** 2)), previousAverageMinutes: 120,
      salePercent: +(100 * sales / count).toFixed(2), offerPercent: +(100 * offers / count).toFixed(2),
      unsoldPercent: +(100 * (count - sales - offers) / count).toFixed(2),
      averageMinutes: +(waits.reduce((a, b) => a + b, 0) / count).toFixed(2), medianMinutes: +waits[count / 2].toFixed(2),
      configuredSaleChance: buyerTerms(asking, market).saleChance });
  }
  await writeFile('artifacts/ebay-buyer-simulation.json', JSON.stringify({ basis: 'RIPIFY simulated buyers; neutral demand; in-game minutes', results }, null, 2));
  console.table(results.map(({ asking, salePercent, offerPercent, unsoldPercent, averageMinutes, previousAverageMinutes }) => ({ asking, salePercent, offerPercent, unsoldPercent, averageMinutes, previousAverageMinutes })));
} finally { await server.close(); }
