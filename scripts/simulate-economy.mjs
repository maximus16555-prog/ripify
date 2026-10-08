import { createServer } from 'vite';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
const count = Number(option('--packs', '100000'));
const seed = Number(option('--seed', '1512026'));
const output = option('--output', 'artifacts/economy-current.json');
if (!Number.isInteger(count) || count < 1000 || count > 1000000 || !Number.isInteger(seed)) throw new Error('Use 1,000–1,000,000 packs and an integer seed.');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { simulateEconomy, exploreProfiles } = await server.ssrLoadModule('/scripts/economy-simulation.ts');
  const pricesPath = option('--baseline-prices');
  if (pricesPath) {
    // Counterfactual pricing in this isolated development process only. The real
    // production generator/valuation still run, with no store or player save.
    const before = JSON.parse(await readFile(pricesPath, 'utf8'));
    const values = new Map(before.cards.map(c => [c.id, c.value]));
    const { CARDS } = await server.ssrLoadModule('/src/data/cards.ts');
    for (const c of CARDS) { if (!values.has(c.id)) throw Error(`Missing baseline price: ${c.id}`); c.value = values.get(c.id); }
  }
  const rareEventsIncluded = args.includes('--include-rare');
  const result = args.includes('--explore') ? { candidates: exploreProfiles(count, seed) } : simulateEconomy(count, seed, rareEventsIncluded);
  result.rareEventsIncluded = rareEventsIncluded;
  if (pricesPath) result.counterfactualPriceSource = pricesPath;
  const baselinePath = option('--baseline');
  if (baselinePath) {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    result.baselineSource = baselinePath;
    const compare = (before, after, keys) => Object.fromEntries(keys.map(key => [key, { before: before[key], after: after[key], delta: Number((after[key] - before[key]).toFixed(4)) }]));
    result.comparison = result.sets.map(after => {
      const before = baseline.sets.find(set => set.productId === after.productId);
      if (!before) throw new Error(`No baseline for ${after.productId}`);
      return { productId: after.productId, ...compare(before, after, ['averagePackCost', 'averageRawValue', 'medianRawValue', 'rawRecoveryPercent', 'strictLossPercent', 'chasePackPercent', 'charizard199PackPercent']), outcomes: compare(before.outcomePercent, after.outcomePercent, Object.keys(after.outcomePercent)), rarities: compare(before.rarityPackPercent, after.rarityPackPercent, Object.keys(after.rarityPackPercent)) };
    });
  }
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.sets ?? result.candidates, null, 2));
  if (result.comparison) console.log(JSON.stringify(result.comparison, null, 2));
  console.log(`Saved ${output}`);
} finally { await server.close(); }
