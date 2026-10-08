import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';

// Development authoring only. Runtime reads the checked-in table; it never rolls
// prices or guesses missing entries. These are game values, not market quotations.
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { CARD_VALUES, DEFAULT_CARD_VALUE, FIXED_RAW_CARD_VALUES, INDIVIDUAL_PRICE_POLICY } = await server.ssrLoadModule('/src/data/balance.ts');
  const cards = [];
  for (const file of ['151', 'ascended-heroes']) cards.push(...JSON.parse(await readFile(`src/data/verified/${file}.json`, 'utf8')).cards);
  // Deliberate RIPIFY collector preferences, not claims about real-world demand.
  const popularity = {
    Charizard: 3.1, Pikachu: 2.9, Gengar: 2.8, Dragonite: 2.6, Mew: 2.7, Mewtwo: 2.5, Umbreon: 2.7, Eevee: 2.3,
    Blastoise: 2.2, Venusaur: 1.9, Bulbasaur: 1.7, Charmander: 2.1, Squirtle: 1.8, Charmeleon: 1.5, Ivysaur: 1.35, Wartortle: 1.4,
    Alakazam: 1.8, Abra: 1.25, Kadabra: 1.3, Gastly: 1.6, Haunter: 1.7, Snorlax: 1.9, Psyduck: 1.65, Slowpoke: 1.45,
    Lapras: 1.55, Ditto: 1.5, Magikarp: 1.6, Gyarados: 1.8, Raichu: 1.7, Vulpix: 1.5, Ninetales: 1.7, Growlithe: 1.4, Arcanine: 1.7,
    Jolteon: 1.7, Vaporeon: 1.8, Flareon: 1.65, Espeon: 1.9, Leafeon: 1.6, Sylveon: 2.1, Lucario: 1.9, Gardevoir: 1.9,
    Rayquaza: 2.5, Suicune: 1.9, Articuno: 1.7, Zapdos: 1.8, Moltres: 1.6, Dragonair: 1.7, Dratini: 1.6, Clefairy: 1.25,
    Meowth: 1.35, Jigglypuff: 1.3, Cubone: 1.4, Mimikyu: 1.9, Chikorita: 1.35, Cyndaquil: 1.5, Totodile: 1.4
  };
  const trainerDemand = { "Erika's Invitation": 1.45, "Giovanni's Charisma": 1.4, "Bill's Transfer": .9, 'Boss\'s Orders': 1.35, 'Rare Candy': 1.3, 'Ultra Ball': 1.3, Switch: 1.05 };
  const energyDemand = { Grass: 1.08, Fire: 1.2, Water: 1.12, Lightning: 1.14, Psychic: 1.25, Fighting: .88, Darkness: 1.1, Metal: .96 };
  const themeDemand = { Grass: .78, Fire: 1.13, Water: 1.02, Lightning: 1.15, Psychic: 1.18, Fighting: .82, Darkness: 1.05, Metal: .91, Dragon: 1.2, Colorless: .8 };
  const hash = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };
  const score = card => {
    let name = card.name.replace(/^(Mega |Alolan |Galarian |Hisuian |Paldean )/, '').replace(/^.*'s /, '').replace(/(?: [XY])? ex$/, '');
    let demand = popularity[name] ?? .9;
    if (card.category === 'Trainer') demand = trainerDemand[card.name] ?? 1;
    if (card.category === 'Energy') demand = Object.entries(energyDemand).find(([type]) => card.name.includes(type))?.[1] ?? 1;
    if (card.category === 'Pokemon' && card.types?.length) demand *= card.types.reduce((n, type) => n + (themeDemand[type] ?? 1), 0) / card.types.length;
    // Printing traits provide variety even for related Pokemon. Collector demand
    // dominates; stats are a modest game-economy proxy, not a competitive ranking.
    const traits = .7 + Math.min(card.hp ?? 0, 350) / 500 + (card.abilities?.length ?? 0) * .12 + (card.attacks?.length ?? 0) * .09 + (card.stage === 'Stage2' ? .07 : 0);
    const printing = .82 + (hash(`${card.id}:${card.illustrator ?? ''}`) % 10000) / 10000 * .36;
    return demand * traits * printing;
  };
  const groups = new Map();
  for (const c of cards) if (FIXED_RAW_CARD_VALUES[c.id] === undefined) {
    const key = `${c.set.id}:${c.rarity}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(c);
  }
  const values = {};
  for (const pool of groups.values()) {
    const rarity = pool[0].rarity;
    const center = (CARD_VALUES[rarity] ?? DEFAULT_CARD_VALUE) * (INDIVIDUAL_PRICE_POLICY.meanBuff[rarity] ?? 1.08);
    // Gold cards retain a meaningful utility/collector baseline even when the
    // pictured subject is less popular. Manual prices never enter this authoring.
    const demand = c => score(c) ** (rarity === 'Hyper rare' ? .5 : 1);
    const meanScore = pool.reduce((n, c) => n + demand(c), 0) / pool.length;
    for (const c of pool) values[c.id] = Math.max(.01, Math.round(center * demand(c) / meanScore * 100) / 100);
  }
  const result = { version: 1, revision: 'individual-prices-v1', basis: 'RIPIFY simulated base raw values, not real market quotes', policy: INDIVIDUAL_PRICE_POLICY, values: Object.fromEntries(cards.filter(c => values[c.id] !== undefined).map(c => [c.id, values[c.id]])) };
  if (process.argv.includes('--check')) {
    const stored = JSON.parse(await readFile('src/data/card-prices.json', 'utf8'));
    if (JSON.stringify(stored) !== JSON.stringify(result)) throw new Error('Stored card prices differ from the authored pricing policy');
  } else await writeFile('src/data/card-prices.json', JSON.stringify(result, null, 2) + '\n');
  console.log(`Stored ${Object.keys(values).length} individual prices; ${Object.keys(FIXED_RAW_CARD_VALUES).length} manual overrides left untouched.`);
} finally { await server.close(); }
