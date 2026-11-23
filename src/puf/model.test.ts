import { describe, expect, it } from 'vitest';
import { seeded } from '../testing/seeded';
import { challengeFromU64, delta, katChallenge, katWeights, phi, responseOf, xorResponse } from './model';

/** Φ by the definition, O(k²), written separately from src: Φ_i = ∏_{l=i}^{k−1} (1 − 2c_l), Φ_k = 1. */
function phiByProducts(c: Uint8Array): number[] {
  const k = c.length;
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    let p = 1;
    for (let l = i; l < k; l++) p *= 1 - 2 * c[l];
    out.push(p);
  }
  out.push(1);
  return out;
}
const dotp = (a: ArrayLike<number>, b: ArrayLike<number>): number => Array.from(a).reduce((s, x, i) => s + x * b[i], 0);

describe('A. Model KAT (LSB-first challenge bits; brief author\'s Python, reproduced)', () => {
  const w = katWeights();
  it('w_0 = 0.191507457 and w_64 = −0.56183053', () => {
    expect(w).toHaveLength(65);
    expect(w[0].toFixed(9)).toBe('0.191507457');
    expect(w[64].toFixed(8)).toBe('-0.56183053');
  });
  it('all zeros → Δ = −1.798473, response 1; all ones → 2.683968, 0; c_i = i mod 2 → 1.769958, 0', () => {
    const cases: [Uint8Array, string, number][] = [
      [new Uint8Array(64), '-1.798473', 1],
      [new Uint8Array(64).fill(1), '2.683968', 0],
      [Uint8Array.from({ length: 64 }, (_, i) => i % 2), '1.769958', 0],
    ];
    for (const [c, d, r] of cases) {
      expect(delta(w, c).toFixed(6)).toBe(d);
      expect(responseOf(delta(w, c))).toBe(r);
      // Independent route: Φ by the definition.
      expect(dotp(w, phiByProducts(c)).toFixed(6)).toBe(d);
    }
  });
  it('exactly 582 of the 1,000 KAT challenges give response 1', () => {
    let ones = 0;
    for (let t = 0; t < 1000; t++) ones += responseOf(dotp(w, phiByProducts(katChallenge(t))));
    expect(ones).toBe(582);
  });
  it('LSB-first: bit i of the integer is challenge bit i (MSB-first would differ)', () => {
    const c = challengeFromU64(1n);
    expect(c[0]).toBe(1);
    expect(c[63]).toBe(0);
    const v = 0x0123456789abcdefn;
    const lsb = challengeFromU64(v);
    const msb = Uint8Array.from(lsb).reverse();
    expect(delta(w, lsb)).not.toBe(delta(w, msb));
  });
});

describe('B. Feature-map identity', () => {
  it('for 1,000 random challenges Φ by products equals Φ by the recurrence, and Φ_k = 1', () => {
    const rng = seeded(5);
    for (let n = 0; n < 1000; n++) {
      const c = Uint8Array.from({ length: 64 }, () => (rng() < 0.5 ? 1 : 0));
      const a = phi(c);
      expect(Array.from(a)).toEqual(phiByProducts(c));
      expect(a[64]).toBe(1);
    }
  });
});

describe('XOR arbiter PUF', () => {
  it('two chains: the response is the XOR of the two chains\' responses; the same chain twice always gives 0', () => {
    const rng = seeded(8);
    const w1 = Float64Array.from({ length: 65 }, () => rng() - 0.5);
    const w2 = Float64Array.from({ length: 65 }, () => rng() - 0.5);
    for (let n = 0; n < 200; n++) {
      const c = Uint8Array.from({ length: 64 }, () => (rng() < 0.5 ? 1 : 0));
      const r1 = dotp(w1, phiByProducts(c)) < 0 ? 1 : 0;
      const r2 = dotp(w2, phiByProducts(c)) < 0 ? 1 : 0;
      expect(xorResponse([w1, w2], c)).toBe(r1 ^ r2);
      expect(xorResponse([w1, w1], c)).toBe(0);
    }
  });
});
