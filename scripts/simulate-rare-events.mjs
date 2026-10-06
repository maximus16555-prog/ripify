import { createServer } from 'vite';
import { writeFile, mkdir } from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { simulateRareEvents } = await server.ssrLoadModule('/scripts/rare-event-simulation.ts');
  const result = simulateRareEvents(100000, 10000000, 1512026);
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/rare-events-simulation.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (Object.values(result.errors).some(n => n !== 0) || Object.values(result.rates).some(r => Math.abs(r.standardDeviations) > 5)) process.exitCode = 1;
} finally { await server.close(); }
