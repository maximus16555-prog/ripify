import type { OwnedCard } from '../core/types';
import { crackDamage } from '../core/slab-cracking';
export type Point = [number, number];
/** Front-relative normalized silhouette; the same saved cuts apply through both faces and cardstock. */
export function cardDamageOutline(owned: Pick<OwnedCard, 'crackHistory'> | undefined, rx = .0353, ry = .0253): Point[] {
  let points: Point[] = [];
  for (const [cx, cy, start] of [[1 - rx, ry, -Math.PI / 2], [1 - rx, 1 - ry, 0], [rx, 1 - ry, Math.PI / 2], [rx, ry, Math.PI]] as const) {
    for (let i = 0; i <= 6; i++) { const a = start + i * Math.PI / 12; points.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  }
  for (const d of owned ? crackDamage(owned) : []) {
    if (d.type === 'missing-corner') {
      const dx = d.length * (.65 + .5 * d.severity), dy = dx * 660 / 921;
      const sx = d.x < .5 ? 1 : -1, sy = d.y < .5 ? 1 : -1;
      const distance = (p: Point) => sx * (p[0] - d.x) / dx + sy * (p[1] - d.y) / dy - 1;
      const clipped: Point[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length], da = distance(a), db = distance(b);
        if (da >= 0) clipped.push(a);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      points = clipped;
    } else if (d.type === 'edge-chip') {
      const edge = d.x < .5 ? 0 : 1, notch: Point[] = [], half = Math.min(.045, d.length / 2);
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length]; notch.push(a);
        if (Math.abs(a[0] - edge) > 1e-5 || Math.abs(b[0] - edge) > 1e-5 || d.y <= Math.min(a[1], b[1]) + half || d.y >= Math.max(a[1], b[1]) - half) continue;
        const sign = Math.sign(b[1] - a[1]);
        notch.push([edge, d.y - sign * half], [edge + (edge ? -1 : 1) * (.006 + d.severity * .016), d.y - sign * half * .25], [edge + (edge ? -1 : 1) * (.004 + d.severity * .01), d.y + sign * half * .3], [edge, d.y + sign * half]);
      }
      points = notch;
    }
  }
  return points;
}
export function damageClipStyle(owned?: Pick<OwnedCard, 'crackHistory'>) {
  if (!owned || !crackDamage(owned).some(d => ['missing-corner', 'edge-chip'].includes(d.type))) return '';
  return `clip-path:polygon(${cardDamageOutline(owned).map(([x, y]) => `${(x * 100).toFixed(3)}% ${(y * 100).toFixed(3)}%`).join(',')});`;
}
