import type { OwnedCard } from '../core/types';
import { crackDamage } from '../core/slab-cracking';

/** Saved post-production damage, in front-relative coordinates. Never rolls artwork. */
export function crackDamageMarkup(owned?: Pick<OwnedCard, 'crackHistory'>, side: 'front' | 'back' = 'front') {
  if (!owned) return '';
  const marks = crackDamage(owned).filter(d => d.side === 'both' || d.side === side).map(d => {
    const x = (side === 'back' ? 1 - d.x : d.x) * 660, y = d.y * 921;
    const dx = (side === 'back' ? -1 : 1) * Math.cos(d.angle) * d.length * 660, dy = Math.sin(d.angle) * d.length * 921;
    if (d.type === 'bent-corner') {
      const sx = x < 330 ? 1 : -1, sy = y < 460 ? 1 : -1, r = 15 + d.severity * 28;
      return `<path d="M${x},${y} l${sx * r},0 l${-sx * r},${sy * r} Z" fill="#e4ddc9" opacity=".92"/><path d="M${x + sx * r},${y} L${x},${y + sy * r}" stroke="#524c42" stroke-width="2" opacity=".8"/>`;
    }
    if (d.type === 'edge-chip') return `<path d="M${x},${y} l${x < 330 ? 7 : -7},8 l${x < 330 ? -7 : 7},${d.length * 921}" fill="#eee5cf" opacity=".9"/>`;
    if (d.type === 'dent') return `<ellipse cx="${x}" cy="${y}" rx="${d.length * 200}" ry="7" fill="#292a25" opacity=".2" stroke="#eee6ce"/>`;
    return `<path d="M${x},${y} l${dx},${dy}" fill="none" stroke="#504a42" opacity="${.3 + d.severity * .25}" stroke-width="${d.type === 'crease' ? 4 : 2}"/><path d="M${x + 2},${y + 2} l${dx},${dy}" fill="none" stroke="#f6eed7" opacity=".8" stroke-width="${d.type === 'crease' ? 2 : 1}"/>`;
  }).join('');
  return marks ? `<svg class="crack-damage-overlay" viewBox="0 0 660 921" preserveAspectRatio="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${marks}</svg>` : '';
}

export function drawCrackDamage(ctx: CanvasRenderingContext2D, owned: OwnedCard, side: 'front' | 'back', width: number, height: number) {
  ctx.save(); ctx.scale(width / 660, height / 921); ctx.lineCap = 'round';
  for (const d of crackDamage(owned)) {
    if (d.side !== 'both' && d.side !== side) continue;
    const x = (side === 'back' ? 1 - d.x : d.x) * 660, y = d.y * 921;
    ctx.globalAlpha = .85;
    if (d.type === 'bent-corner') {
      const sx = x < 330 ? 1 : -1, sy = y < 460 ? 1 : -1, r = 15 + d.severity * 28;
      ctx.fillStyle = '#e4ddc9'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sx * r, y); ctx.lineTo(x, y + sy * r); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#524c42'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + sx * r, y); ctx.lineTo(x, y + sy * r); ctx.stroke();
    } else if (d.type === 'edge-chip') {
      ctx.fillStyle = '#eee5cf'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (x < 330 ? 7 : -7), y + 8); ctx.lineTo(x, y + d.length * 921); ctx.closePath(); ctx.fill();
    } else if (d.type === 'dent') {
      ctx.globalAlpha = .2; ctx.fillStyle = '#292a25'; ctx.beginPath(); ctx.ellipse(x, y, d.length * 200, 7, d.angle, 0, Math.PI * 2); ctx.fill();
    } else {
      const dx = (side === 'back' ? -1 : 1) * Math.cos(d.angle) * d.length * 660, dy = Math.sin(d.angle) * d.length * 921;
      ctx.strokeStyle = '#504a42'; ctx.globalAlpha = .3 + d.severity * .25; ctx.lineWidth = d.type === 'crease' ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
      ctx.strokeStyle = '#f6eed7'; ctx.globalAlpha = .8; ctx.lineWidth = d.type === 'crease' ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + dx + 2, y + dy + 2); ctx.stroke();
    }
  }
  ctx.restore();
}
