/** Physical construction profiles, separate from verified inventory manifests.
 * UV quadrilaterals select ONLY the visible face of the exact local retail photo.
 * Coordinates are normalized top-left, top-right, bottom-right, bottom-left.
 * No photograph is repeated across unknown faces. */
export type FaceQuad = readonly [number, number, number, number, number, number, number, number];
export interface ContainerProfile {
  construction: 'sleeve-lift' | 'hinged-case';
  width: number; height: number; depth: number;
  shell: string; lining: string;
  front: FaceQuad; left: FaceQuad;
}
export const CONTAINER_PROFILES: Record<string, ContainerProfile> = {
  '151-etb': {
    construction: 'sleeve-lift', width: 2.35, height: 2.06, depth: 1.1,
    shell: '#c7b89b', lining: '#eee8d9',
    front: [.214, .002, .999, .087, .999, .904, .214, .998],
    left: [.002, .065, .214, .002, .214, .998, .002, .931],
  },
  '151-upc': {
    construction: 'hinged-case', width: 3.65, height: .82, depth: 2.25,
    shell: '#e4ddd1', lining: '#eee9df',
    front: [.083, .007, .999, .116, .999, .901, .083, .999],
    left: [.002, .062, .083, .007, .083, .999, .002, .949],
  },
};

/** Projective, rather than bilinear UVs: straighten an oblique photographed face.
 * x/y refer to a unit square, y=0 is its top. */
export function photoFaceUV(q: FaceQuad, x: number, y: number): [number, number] {
  const [x0,y0,x1,y1,x2,y2,x3,y3] = q;
  const dx1=x1-x2, dx2=x3-x2, dx3=x0-x1+x2-x3;
  const dy1=y1-y2, dy2=y3-y2, dy3=y0-y1+y2-y3;
  const det=dx1*dy2-dx2*dy1;
  const g=(dx3*dy2-dx2*dy3)/det, h=(dx1*dy3-dx3*dy1)/det;
  const a=x1-x0+g*x1, b=x3-x0+h*x3;
  const d=y1-y0+g*y1, e=y3-y0+h*y3;
  const divisor=g*x+h*y+1;
  return [(a*x+b*y+x0)/divisor, 1-(d*x+e*y+y0)/divisor];
}
