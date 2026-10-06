// Preserve the existing wrapper's jagged silhouette. Coordinates are percentages.
export const SEAM: readonly (readonly [number, number])[] = [[0,8],[4,8.8],[9,7.8],[14,8.9],[18,7.7],[24,8.9],[30,7.9],[36,8.7],[43,7.8],[49,8.9],[55,7.9],[61,8.8],[67,7.8],[73,8.9],[79,7.7],[84,8.9],[91,7.8],[96,8.7],[100,8]];
export const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export function seamY(x: number) {
  const i = SEAM.findIndex(p => p[0] >= x);
  if (i <= 0) return SEAM[i < 0 ? SEAM.length - 1 : 0][1];
  const a = SEAM[i - 1], b = SEAM[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
}
const polygon = (points: readonly (readonly [number, number])[]) => `polygon(${points.map(([x,y]) => `${x.toFixed(3)}% ${y.toFixed(3)}%`).join(',')})`;
export function stripClip(left: number, right: number) {
  left = clamp(left, 0, 100); right = clamp(right, left, 100);
  return polygon([[left,0],[right,0],[right,seamY(right)+.2], ...SEAM.filter(([x]) => x > left && x < right).reverse().map(([x,y]) => [x,y+.2] as const),[left,seamY(left)+.2]]);
}
export function bodyClip(progress: number, direction: number) {
  const frontier = (direction > 0 ? clamp(progress) : 1-clamp(progress)) * 100;
  const edge: (readonly [number,number])[] = direction > 0
    ? [...SEAM.filter(([x]) => x < frontier),[frontier,seamY(frontier)],[frontier,0],[100,0]]
    : [[0,0],[frontier,0],[frontier,seamY(frontier)],...SEAM.filter(([x]) => x > frontier)];
  return polygon([...edge,[100,100],[0,100]]);
}
