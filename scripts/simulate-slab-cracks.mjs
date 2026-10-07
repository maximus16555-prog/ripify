import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { simulateSlabCracks } = await server.ssrLoadModule('/scripts/slab-crack-simulation.ts');
  const result = simulateSlabCracks();
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/slab-crack-simulation.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (result.violations || Math.abs(result.standardDeviations) > 5) process.exitCode = 1;
} finally { await server.close(); }
