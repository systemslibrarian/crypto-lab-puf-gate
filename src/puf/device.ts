import type { Rng } from '../rng';
import { delta, responseOf, type Challenge } from './model';

/**
 * A simulated PUF device. Its delay vectors are held in a private field: the only
 * way in is query(), which returns a response bit. The attacker modules never import
 * this file; they are handed a query function (invariant 1).
 *
 * Noise (invariant 4) is applied by the device: each query adds Gaussian noise of
 * standard deviation `noise` to every chain's Δ before thresholding, drawn from the
 * device's own generator.
 */
export interface DeviceSpec {
  /** One delay vector per chain: one chain is an arbiter PUF, l chains an l-XOR arbiter PUF. */
  readonly weights: readonly Float64Array[];
  readonly noise: number;
  readonly rng: Rng;
}

/** Standard normal by Box–Muller. */
export function gaussian(rng: Rng): number {
  let u = rng();
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Fresh delays, standard normal as in Rührmair et al. §2.4. */
export function randomWeights(k: number, rng: Rng): Float64Array {
  return Float64Array.from({ length: k + 1 }, () => gaussian(rng));
}

export class Device {
  readonly #weights: readonly Float64Array[];
  readonly #noise: number;
  readonly #rng: Rng;
  readonly k: number;
  readonly chains: number;
  queries = 0;

  constructor(spec: DeviceSpec) {
    if (!spec.weights.length) throw new RangeError('a device needs at least one chain');
    this.#weights = spec.weights.map((w) => Float64Array.from(w));
    this.#noise = spec.noise;
    this.#rng = spec.rng;
    this.k = spec.weights[0].length - 1;
    this.chains = spec.weights.length;
  }

  query(c: Challenge): 0 | 1 {
    if (c.length !== this.k) throw new RangeError(`challenge has ${c.length} bits; this device takes ${this.k}`);
    this.queries++;
    let r = 0;
    for (const w of this.#weights) {
      const d = delta(w, c) + (this.#noise > 0 ? this.#noise * gaussian(this.#rng) : 0);
      r ^= responseOf(d);
    }
    return r as 0 | 1;
  }

  /** The device as an attacker sees it: a function from challenges to response bits, nothing else. */
  oracle(): (c: Challenge) => 0 | 1 {
    return (c) => this.query(c);
  }
}
