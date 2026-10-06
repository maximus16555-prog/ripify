import { createServer } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { validate151 } = await server.ssrLoadModule('/src/data/validate-151.ts');
  const { simulateEconomy } = await server.ssrLoadModule('/scripts/economy-simulation.ts');
  const { generatePack } = await server.ssrLoadModule('/src/core/packs.ts');
  const { seeded } = await server.ssrLoadModule('/src/core/inventory.ts');
  const count = Number(process.argv[2] ?? 100000);
  if (!Number.isInteger(count) || count < 1000 || count > 1000000) throw new Error('Use 1,000-1,000,000 packs');
  const random = seeded(1512026), seen = new Set();
  let duplicateOccurrences = 0, duplicateOwnedIds = 0;
  for (let i = 0; i < count; i++) {
    const pack = { uid: `audit-${i}`, setCode: 'sv03.5', productId: '151-booster', variant: 0, price: 8, purchasedAt: 0, seed: Math.floor(random() * 4294967296), owner: 'local-player', state: 'unopened', generationVersion: 1 };
    const cards = generatePack(pack, undefined, 0);
    duplicateOccurrences += cards.length - new Set(cards.map(c => c.cardId)).size;
    duplicateOwnedIds += cards.length - new Set(cards.map(c => c.uid)).size;
    for (const card of cards) if (card.cardId.startsWith('sv03.5-')) seen.add(card.cardId);
  }
  const catalog = validate151();
  const expectedHashes = JSON.parse(await readFile('artifacts/economy-preserved-systems.json', 'utf8'));
  const mechanics = Object.keys(expectedHashes).filter(path => path.startsWith('src/ui/') || path.includes('/camera'));
  const unchanged = Object.fromEntries(await Promise.all(mechanics.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex') === expectedHashes[path]])));
  const report = { checkedAt: new Date().toISOString(), catalog, simulation: { packs: count, seed: 1512026, duplicateExactCardOccurrences: duplicateOccurrences, duplicateOwnedIds, uniqueSetCardsObserved: seen.size, setCardsNotObserved: catalog.pullPaths.filter(c => !seen.has(c.id)).map(c => c.id) }, economy: simulateEconomy(count, 1512026), unchangedOpener: unchanged };
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/151-validation.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...catalog, pullPaths: undefined, simulation: report.simulation, rarityPackPercent: report.economy.sets[0].rarityPackPercent, rawRecoveryPercent: report.economy.sets[0].rawRecoveryPercent, unchangedOpener: unchanged }, null, 2));
  if (duplicateOccurrences || duplicateOwnedIds || Object.entries(catalog).some(([key, value]) => key !== 'pullPaths' && Array.isArray(value) && value.length) || Object.values(unchanged).some(value => !value)) process.exitCode = 1;
} finally { await server.close(); }
