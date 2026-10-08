import { createServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const output = option('--output', 'artifacts/card-pricing-audit.json');
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { CARDS } = await server.ssrLoadModule('/src/data/cards.ts');
  const balance = await server.ssrLoadModule('/src/data/balance.ts');
  const { generatePack } = await server.ssrLoadModule('/src/core/packs.ts');
  const { createPack } = await server.ssrLoadModule('/src/core/inventory.ts');
  const { RARE_EVENT_ODDS } = await server.ssrLoadModule('/src/core/rare-events.ts');
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const cards = CARDS.map(c => ({ id: c.id, name: c.name, set: c.setCode, number: c.number, rarity: c.rarity, value: c.value, source: balance.FIXED_RAW_CARD_VALUES[c.id] !== undefined ? 'manual' : balance.INDIVIDUAL_RAW_CARD_VALUES?.[c.id] !== undefined ? 'individual' : 'rarity-default' }));
  const groups = Object.fromEntries([...new Set(cards.map(c => c.rarity))].map(rarity => {
    const pool = cards.filter(c => c.rarity === rarity), counts = new Map();
    for (const c of pool) counts.set(c.value, (counts.get(c.value) ?? 0) + 1);
    const duplicates = [...counts].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
    return [rarity, { cards: pool.length, distinctPrices: counts.size, min: Math.min(...counts.keys()), max: Math.max(...counts.keys()), mean: pool.reduce((s, c) => s + c.value, 0) / pool.length, largestSamePriceGroup: duplicates[0]?.[1] ?? 1, duplicateGroups: duplicates }];
  }));
  const samples = Object.fromEntries(['Common', 'Uncommon', 'Rare', 'Higher rarities'].map(rarity => {
    const filter = c => rarity === 'Higher rarities' ? !['Common', 'Uncommon', 'Rare', 'Promo'].includes(c.rarity) : c.rarity === rarity;
    const pools = ['sv03.5', 'me02.5'].map(set => cards.filter(c => c.set === set && filter(c)));
    return [rarity, Array.from({ length: 10 }, (_, i) => pools.map(p => p[Math.floor(i * p.length / 10)])).flat()];
  }));
  const fingerprints = {};
  for (const productId of ['151-booster', 'ascended-heroes-booster']) {
    const digest = createHash('sha256');
    for (let seed = 0; seed < 10000; seed++) {
      const p = { ...createPack(productId, 0, undefined, seed + 1512026, 0), uid: `audit-${seed}` };
      const pulled = generatePack(p, undefined, 0);
      digest.update(JSON.stringify({ events: p.rareEvents, cards: pulled.map(c => ({ id: c.cardId, condition: c.condition, finish: c.finish, misprint: c.misprint })) }));
    }
    fingerprints[productId] = digest.digest('hex');
  }
  const report = { definitions: cards.length, nonIndividualDefaults: cards.filter(c => c.source === 'rarity-default').length, groups, samples, cards, generationFingerprintPacksPerSet: 10000, fingerprints, generationConfigurationHash: hash({ weights: balance.PACK_BALANCE, odds: RARE_EVENT_ODDS, products: balance.PRODUCT_PRICES }), artworkAndIdentityHash: hash(CARDS.map(({ value, ...c }) => c)) };
  const beforePath = option('--baseline');
  if (beforePath) {
    const before = JSON.parse(await readFile(beforePath, 'utf8'));
    const old = new Map(before.cards.map(c => [c.id, c]));
    report.comparison = cards.map(c => ({ ...c, before: old.get(c.id)?.value, change: Math.round((c.value - old.get(c.id).value) * 100) / 100 }));
    report.generationUnchanged = hash(before.fingerprints) === hash(fingerprints) && before.generationConfigurationHash === report.generationConfigurationHash;
    report.artworkAndIdentityUnchanged = before.artworkAndIdentityHash === report.artworkAndIdentityHash;
    if (!report.generationUnchanged || !report.artworkAndIdentityUnchanged) throw Error('Unrelated generation/artwork change');
  }
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ definitions: report.definitions, nonIndividualDefaults: report.nonIndividualDefaults, groups, generationUnchanged: report.generationUnchanged }, null, 2));
} finally { await server.close(); }
