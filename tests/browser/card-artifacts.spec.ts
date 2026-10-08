import { test, expect } from '@playwright/test';

test('undamaged card textures preserve exact artwork pixels on both sides', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.goto('/');
  const report = await page.evaluate(async () => {
    const path = '/src/game/physical-card.ts';
    const { createPhysicalCard } = await import(/* @vite-ignore */ path);
    const results = [];
    // Different art/rarities, and ordinary condition scores which are not saved defects.
    for (const cardId of ['sve-1', 'sv03.5-001', 'sv03.5-006', 'sv03.5-199']) {
      for (const score of [100, 87, 63]) {
        const owned = { uid: `artwork-${cardId}-${score}`, cardId, condition: { centering: score, corners: score, edges: score, surface: score, print: score }, acquiredAt: 100, source: 'fixture', favorite: false, status: 'raw', owner: 'local-player', finish: 'normal', origin: 'pack' };
        const item = createPhysicalCard(owned); await item.ready;
        for (const side of ['front', 'back']) {
          const texture = item.group.getObjectByName(`card-${side}`).material.map;
          if (texture.userData.state !== 'ready') throw new Error(`Missing exact image: ${cardId} ${side}`);
          const actual = texture.image as HTMLCanvasElement;
          const reference = document.createElement('canvas'); reference.width = actual.width; reference.height = actual.height;
          const image = new Image(); image.crossOrigin = 'anonymous'; image.src = texture.userData.source; await image.decode();
          // Compare against the same source at the existing texture resolution. No
          // color-keying, cropping, image replacement, or inspection-lighting noise.
          reference.getContext('2d')!.drawImage(image, 0, 0, actual.width, actual.height);
          const a = actual.getContext('2d')!.getImageData(0, 0, actual.width, actual.height).data;
          const b = reference.getContext('2d')!.getImageData(0, 0, actual.width, actual.height).data;
          let changedPixels = 0, edgeChanges = 0, originalWhitePixels = 0, changedWhitePixels = 0, transparentPixels = 0, changedAlphaPixels = 0;
          for (let i = 0; i < a.length; i += 4) {
            const changed = a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3];
            const y = Math.floor(i / 4 / actual.width);
            if (changed) { changedPixels++; if (y < 12 || y >= actual.height - 12) edgeChanges++; }
            if (b[i] >= 245 && b[i + 1] >= 245 && b[i + 2] >= 245 && b[i + 3] === 255) { originalWhitePixels++; if (changed) changedWhitePixels++; }
            if (b[i + 3] < 255) transparentPixels++;
            if (a[i + 3] !== b[i + 3]) changedAlphaPixels++;
          }
          results.push({ cardId, score, side, changedPixels, edgeChanges, originalWhitePixels, changedWhitePixels, transparentPixels, changedAlphaPixels });
        }
        item.dispose();
      }
    }
    return results;
  });
  await info.attach('card-artifact-pixel-audit', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  expect(report.filter(r => r.changedPixels > 0)).toEqual([]);
  expect(report.some(r => r.originalWhitePixels > 0)).toBe(true);
  expect(report.some(r => r.transparentPixels > 0)).toBe(true);
});

test('only saved whitening affects the designated face and survives reload', async ({ page }) => {
  await page.goto('/');
  const report = await page.evaluate(async () => {
    const path = '/src/game/physical-card.ts';
    const { createPhysicalCard } = await import(/* @vite-ignore */ path);
    const crackingPath = '/src/core/slab-cracking.ts';
    const { createSlabCrack } = await import(/* @vite-ignore */ crackingPath);
    const card = { uid: 'saved-whitening', cardId: 'sve-1', condition: { centering: 91, corners: 87, edges: 63, surface: 87, print: 96 }, acquiredAt: 100, source: 'fixture', favorite: false, status: 'raw', owner: 'local-player', finish: 'holo', origin: 'pack' };
    const event = createSlabCrack({ ...card, status: 'graded', grader: 'PSA', grade: 9 }, 1000);
    event.damage = [{ type: 'whitening', side: 'back', x: 0, y: .25, length: .18, severity: .8, angle: 0 }];
    const damaged = { ...card, crackHistory: [event] };
    const snapshots = [];
    for (const owned of [card, damaged, JSON.parse(JSON.stringify(damaged))]) {
      const item = createPhysicalCard(owned); await item.ready;
      const faces: number[][] = [];
      for (const side of ['front', 'back']) {
        const mesh = item.group.getObjectByName(`card-${side}`);
        const canvas = mesh.material.map.image as HTMLCanvasElement;
        faces.push(Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data));
        if (!mesh.material.transparent || mesh.material.alphaTest <= 0) throw new Error('Original image transparency is not rendered');
        if (side === 'front' && mesh.material.metalness !== .1) throw new Error('Holo finish lost');
      }
      snapshots.push(faces); item.dispose();
    }
    let frontChanges = 0, backChanges = 0, outsideSavedRegion = 0, reloadChanges = 0, outsideDelta = 0;
    for (let side = 0; side < 2; side++) for (let i = 0; i < snapshots[0][side].length; i++) {
      if (snapshots[0][side][i] !== snapshots[1][side][i]) {
        if (side === 0) frontChanges++; else backChanges++;
        const x = Math.floor(i / 4) % 660, y = Math.floor(i / 4 / 660);
        if (x < 657 || y < 229 || y > 399) {
          const delta = Math.abs(snapshots[0][side][i] - snapshots[1][side][i]);
          outsideDelta = Math.max(outsideDelta, delta);
          // A GPU canvas stroke can round unrelated channels by one byte when
          // compositing. It must never introduce an actual mark outside the defect.
          if (delta > 1) outsideSavedRegion++;
        }
      }
      if (snapshots[1][side][i] !== snapshots[2][side][i]) reloadChanges++;
    }
    return { frontChanges, backChanges, outsideSavedRegion, reloadChanges, outsideDelta };
  });
  expect(report.frontChanges).toBe(0);
  expect(report.backChanges).toBeGreaterThan(0);
  expect(report, JSON.stringify(report)).toMatchObject({ outsideSavedRegion: 0 });
  expect(report.reloadChanges).toBe(0);
});
