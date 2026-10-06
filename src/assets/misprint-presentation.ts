import type { OwnedCard } from '../core/types';

// All geometry/printing offsets come from the saved copy, never a render-time roll.
export function printAppearance(owned: Pick<OwnedCard, 'misprint'>, rear = false) {
  const saved = owned.misprint?.defect;
  const d = saved?.side === 'both' || saved?.side === (rear ? 'back' : 'front') ? saved : undefined;
  const shifted = d?.type === 'off-center' || d?.type === 'miscut';
  return { type: d?.type, x: shifted ? d.offsetX * (rear ? -1 : 1) : 0, y: shifted ? d.offsetY : 0,
    tilt: d?.type === 'miscut' ? d.cutTilt * (rear ? -1 : 1) : 0,
    registrationX: d?.type === 'registration' ? d.registrationX * (rear ? -1 : 1) : 0,
    registrationY: d?.type === 'registration' ? d.registrationY : 0,
    inkY: d?.inkBandY ?? 0, inkWidth: d?.inkBandWidth ?? 0, severity: d?.severity ?? 0 };
}

/** Exact source artwork, with simulated physical print/cut faults over that copy. */
export function drawPrintedFace(ctx: CanvasRenderingContext2D, image: CanvasImageSource, owned: OwnedCard, rear: boolean, width: number, height: number) {
  const a = printAppearance(owned, rear);
  ctx.save(); ctx.fillStyle = '#eee9dc'; ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, a.x * width, a.y * height, width, height);
  if (a.type === 'registration') {
    // A displaced, faint impression of the same printing; no replacement artwork.
    ctx.globalAlpha = .20 + a.severity * .16;
    ctx.drawImage(image, a.registrationX * width, a.registrationY * height, width, height);
  } else if (a.type === 'ink-defect') {
    ctx.fillStyle = '#f4efe0'; ctx.globalAlpha = .4 + a.severity * .3;
    ctx.fillRect(0, a.inkY * height, width, a.inkWidth * height);
    ctx.globalAlpha = .22; ctx.fillRect(width * .18, a.inkY * height, width * .006, a.inkWidth * height);
  }
  ctx.restore();
}

export function printImageStyle(owned?: Partial<OwnedCard>) {
  if (!owned?.misprint) return '';
  const a = printAppearance(owned as OwnedCard);
  return `transform:translate(${a.x * 100}%,${a.y * 100}%);`;
}
export function printPaperStyle(owned?: Partial<OwnedCard>) {
  if (!owned?.misprint) return '';
  const a = printAppearance(owned as OwnedCard);
  const cut = Math.abs(a.tilt) * 100;
  return a.type === 'miscut' ? `clip-path:polygon(${a.tilt > 0 ? cut : 0}% 0,100% 0,100% 100%,${a.tilt < 0 ? cut : 0}% 100%);` : '';
}
export function inkDefectMarkup(owned?: Partial<OwnedCard>, image?: string) {
  const d = owned?.misprint?.defect;
  if (!d || d.side === 'back') return '';
  if (d.type === 'registration' && image) return `<i class="print-registration" style="background-image:url('${image}');transform:translate(${d.registrationX * 100}%,${d.registrationY * 100}%);opacity:${.20 + d.severity * .16}"></i>`;
  return d.type === 'ink-defect' ? `<i class="print-ink-defect" style="top:${d.inkBandY * 100}%;height:${d.inkBandWidth * 100}%;opacity:${.4 + d.severity * .3}"></i>` : '';
}
