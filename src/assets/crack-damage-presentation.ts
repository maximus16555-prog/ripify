import type { OwnedCard } from '../core/types';
import { crackDamage } from '../core/slab-cracking';
/** Restrained finish marks. Missing stock is clipped, never painted white. */
export function crackDamageMarkup(owned?: Pick<OwnedCard, 'crackHistory'>, side: 'front' | 'back' = 'front') {
  if (!owned) return '';
  const marks = crackDamage(owned).filter(d => d.side === 'both' || d.side === side).map(d => {
    const x = (side === 'back' ? 1 - d.x : d.x) * 660, y = d.y * 921;
    const dx = (side === 'back' ? -1 : 1) * Math.cos(d.angle) * d.length * 660, dy = Math.sin(d.angle) * d.length * 660;
    if (['missing-corner', 'edge-chip'].includes(d.type)) return '';
    if (d.type === 'bent-corner') { const sx = x < 330 ? 1 : -1, sy = y < 460 ? 1 : -1, r = d.length * 660; return `<path d="M${x + sx * r},${y} L${x},${y + sy * r}" stroke="#34372f" stroke-width="1.2" opacity=".22" fill="none"/>`; }
    if (d.type === 'whitening') return `<path d="M${x},${y} l0,${d.length * 921}" stroke="#d7ceb9" stroke-width="2" opacity="${d.severity * .35}"/>`;
    if (d.type === 'dent') return `<ellipse cx="${x}" cy="${y}" rx="12" ry="5" fill="none" stroke="#333a33" opacity=".12"/>`;
    return `<path d="M${x},${y} l${dx},${dy}" fill="none" stroke="#343b33" opacity="${d.type === 'crease' ? .22 : .13}" stroke-width="${d.type === 'crease' ? 1.3 : .6}"/>`;
  }).join('');
  return marks ? `<svg class="crack-damage-overlay" viewBox="0 0 660 921" preserveAspectRatio="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${marks}</svg>` : '';
}
export function drawCrackDamage(ctx: CanvasRenderingContext2D, owned: OwnedCard, side: 'front' | 'back', width: number, height: number) {
  ctx.save(); ctx.scale(width / 660, height / 921); ctx.lineCap = 'round';
  for (const d of crackDamage(owned)) {
    if (d.side !== 'both' && d.side !== side || ['missing-corner', 'edge-chip', 'dent'].includes(d.type)) continue;
    const x = (side === 'back' ? 1 - d.x : d.x) * 660, y = d.y * 921;
    ctx.strokeStyle = '#353b33'; ctx.globalAlpha = d.type === 'crease' ? .18 : .1; ctx.lineWidth = d.type === 'crease' ? 1.2 : .65;
    ctx.beginPath();
    if (d.type === 'bent-corner') { const sx = x < 330 ? 1 : -1, sy = y < 460 ? 1 : -1, r = d.length * 660; ctx.moveTo(x + sx * r, y); ctx.lineTo(x, y + sy * r); }
    else if (d.type === 'whitening') { ctx.strokeStyle = '#d7ceb9'; ctx.lineWidth = 1.6; ctx.globalAlpha = d.severity * .3; ctx.moveTo(x, y); ctx.lineTo(x, y + d.length * 921); }
    else { ctx.moveTo(x, y); ctx.lineTo(x + (side === 'back' ? -1 : 1) * Math.cos(d.angle) * d.length * 660, y + Math.sin(d.angle) * d.length * 660); }
    ctx.stroke();
  }
  ctx.restore();
}
