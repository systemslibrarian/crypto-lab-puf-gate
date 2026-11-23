import { sha256 } from '@noble/hashes/sha2.js';

/**
 * The additive linear delay model of a k-stage arbiter PUF (Rührmair et al., CCS 2010,
 * §2.3: Δ = wᵀΦ, response from the sign of Δ).
 *
 * Conventions used throughout this lab, stated once:
 *  - A challenge is k bits c_0 … c_{k−1}. When a challenge is written as a 64-bit
 *    integer, bit i of the integer is c_i (LSB-first: c_0 is the least significant bit).
 *  - Feature map: Φ_i(c) = ∏_{l=i}^{k−1} (1 − 2c_l) for i = 0 … k−1, and Φ_k = 1.
 *    (Each stage that crosses the wires flips the sign of every delay difference
 *    accumulated before it, so Φ_i is a product over the stages from i to the end.)
 *  - Δ = w · Φ(c); the response is 1 if Δ < 0, else 0.
 * Rührmair et al. write the response as t ∈ {−1, 1} with t = sgn(Δ); the paper does not
 * print Φ, citing [15], [9], [16]. This lab's index convention is the brief's, above.
 */

// [extension] point — PufModel: a feature map plus a response rule. Feed-forward and
// lightweight PUFs (§2.3 of the paper) would implement it. Not built here.
export interface PufModel {
  readonly k: number;
  respond(c: Uint8Array): 0 | 1;
}

export type Challenge = Uint8Array;

/** Φ(c) by the suffix-product recurrence: Φ_k = 1, Φ_i = (1 − 2c_i) · Φ_{i+1}. */
export function phi(c: Challenge): Float64Array {
  const k = c.length;
  const out = new Float64Array(k + 1);
  out[k] = 1;
  let acc = 1;
  for (let i = k - 1; i >= 0; i--) {
    acc *= 1 - 2 * c[i];
    out[i] = acc;
  }
  return out;
}

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function delta(w: ArrayLike<number>, c: Challenge): number {
  return dot(w, phi(c));
}

export const responseOf = (d: number): 0 | 1 => (d < 0 ? 1 : 0);

/** An l-XOR arbiter PUF: l chains on the same challenge, responses XORed (§2.3). */
export function xorResponse(ws: readonly ArrayLike<number>[], c: Challenge): 0 | 1 {
  let r = 0;
  for (const w of ws) r ^= responseOf(delta(w, c));
  return r as 0 | 1;
}

/** Challenge bits from a 64-bit integer, LSB-first: bit i of v is c_i. */
export function challengeFromU64(v: bigint, k = 64): Challenge {
  const c = new Uint8Array(k);
  for (let i = 0; i < k; i++) c[i] = Number((v >> BigInt(i)) & 1n);
  return c;
}

export function challengeToHex(c: Challenge): string {
  let v = 0n;
  for (let i = c.length - 1; i >= 0; i--) v = (v << 1n) | BigInt(c[i]);
  return v.toString(16).padStart(Math.ceil(c.length / 4), '0');
}

/**
 * The check-A device's weights (the brief's KAT): w_i = int32_be(SHA-256("puf-gate weight" ‖ byte i)[0..4]) / 2^31,
 * for i = 0 … k. Public by construction — used as the reproducible device, and as the
 * see-through chain in the delay-model exhibit.
 */
export function katWeights(k = 64): Float64Array {
  const w = new Float64Array(k + 1);
  const label = new TextEncoder().encode('puf-gate weight');
  for (let i = 0; i <= k; i++) {
    const msg = new Uint8Array(label.length + 1);
    msg.set(label);
    msg[label.length] = i;
    const d = sha256(msg);
    w[i] = new DataView(d.buffer, d.byteOffset, 4).getInt32(0, false) / 2 ** 31;
  }
  return w;
}

/** The brief's KAT challenge t: the low 64 bits of the first 8 bytes (big-endian) of SHA-256("puf-gate challenge" ‖ uint32_be t). */
export function katChallenge(t: number): Challenge {
  const label = new TextEncoder().encode('puf-gate challenge');
  const msg = new Uint8Array(label.length + 4);
  msg.set(label);
  new DataView(msg.buffer).setUint32(label.length, t, false);
  const d = sha256(msg);
  const v = new DataView(d.buffer, d.byteOffset, 8).getBigUint64(0, false);
  return challengeFromU64(v);
}
