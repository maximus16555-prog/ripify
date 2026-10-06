import { describe, expect, it } from 'vitest';
import { SEAM, bodyClip, seamY, stripClip } from '../src/ui/tear-seam';
describe('existing jagged seam with progressive separation', () => {
  it('retains every original jagged point and interpolates the active tear', () => {
    for (const [x,y] of SEAM) expect(seamY(x)).toBe(y);
    expect(seamY(2)).toBeCloseTo(8.4);
    expect(stripClip(0,100)).toContain('4.000% 9.000%');
  });
  it('cuts only the crossed side and leaves the remaining top intact', () => {
    expect(bodyClip(.4,1)).toContain('40.000% 0.000%,100.000% 0.000%');
    expect(bodyClip(.4,-1)).toContain('0.000% 0.000%,60.000% 0.000%');
    const xs = (clip: string) => [...clip.matchAll(/([\d.]+)% [\d.]+%/g)].map(match => Number(match[1]));
    expect(xs(stripClip(40,100)).every(x => x >= 40)).toBe(true);
    expect(xs(stripClip(0,60)).every(x => x <= 60)).toBe(true);
  });
  it('bounds extreme input and keeps foil and body edges corresponding', () => {
    expect(bodyClip(9,1)).toBe(bodyClip(1,1));
    expect(bodyClip(-9,-1)).toBe(bodyClip(0,-1));
    const clip = stripClip(33,61);
    expect(clip).toContain(`33.000% ${(seamY(33)+.2).toFixed(3)}%`);
    expect(bodyClip(.33,1)).toContain(`33.000% ${seamY(33).toFixed(3)}%`);
  });
});
