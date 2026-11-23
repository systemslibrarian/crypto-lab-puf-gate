import type { Rng } from '../rng';

/**
 * Logistic regression with RProp, as Rührmair et al. use it (CCS 2010, §2.1.1):
 * minimise the negative log-likelihood  l = Σ −ln σ(t·f(w, C))  over the training
 * CRPs, with gradient  ∇l = Σ t(σ(t·f) − 1) ∇f  (their equations 1 and 2), by RProp,
 * which they found best. t ∈ {−1, +1}: here t = +1 for response 0 (Δ > 0) and −1 for
 * response 1.
 *
 *  - linear model (one arbiter chain):     f = w · Φ(c)
 *  - product model (l-XOR arbiter PUF, §4.1): f = ∏_i (w_i · Φ(c))
 *
 * This module sees only feature rows built from challenges and the response bits — no
 * device, no weights: it imports nothing from the device module.
 */

// [extension] point — Attack: Evolution Strategies (the paper's §2.1.2, used for
// feed-forward PUFs) would be a second implementation of this training step. Not built here.

export interface Dataset {
  /** Feature rows, n × d, flattened. */
  readonly X: Float64Array;
  /** Response bits, length n. */
  readonly r: Uint8Array;
  readonly n: number;
  readonly d: number;
}

export interface Model {
  /** One weight vector for a single chain; l for the product model. */
  readonly ws: Float64Array[];
}

export interface TrainResult {
  readonly model: Model;
  readonly iterations: number;
  readonly restarts: number;
  readonly trainAccuracy: number;
  readonly stopped: 'converged' | 'max-iterations' | 'budget';
  readonly ms: number;
}

export interface TrainOptions {
  readonly chains: number;
  readonly rng: Rng;
  readonly maxIterations?: number;
  /** Restart from fresh random weights when a run converges below this training accuracy (the paper restarts too). */
  readonly restartBelow?: number;
  readonly maxRestarts?: number;
  readonly budgetMs?: number;
}

function score(m: Model, X: Float64Array, row: number, d: number, parts?: Float64Array): number {
  let f = 1;
  for (let j = 0; j < m.ws.length; j++) {
    const w = m.ws[j];
    let g = 0;
    const o = row * d;
    for (let i = 0; i < d; i++) g += w[i] * X[o + i];
    if (parts) parts[j] = g;
    f *= g;
  }
  return f;
}

/** Response predicted for one feature row: 1 when f < 0. */
export function predictRow(m: Model, X: Float64Array, row: number, d: number): 0 | 1 {
  return score(m, X, row, d) < 0 ? 1 : 0;
}

export function accuracy(m: Model, data: Dataset): number {
  if (data.n === 0) return Number.NaN;
  let ok = 0;
  for (let i = 0; i < data.n; i++) if (predictRow(m, data.X, i, data.d) === data.r[i]) ok++;
  return ok / data.n;
}

function randomModel(chains: number, d: number, rng: Rng): Model {
  return { ws: Array.from({ length: chains }, () => Float64Array.from({ length: d }, () => (rng() - 0.5) * 0.2)) };
}

/** σ(z) = 1/(1 + e^−z), written to avoid overflow. */
function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

export function train(data: Dataset, opts: TrainOptions): TrainResult {
  if (data.n === 0) throw new RangeError('no CRPs to learn from — the attack needs at least one challenge–response pair');
  const { chains, rng } = opts;
  const d = data.d;
  const maxIt = opts.maxIterations ?? 1000;
  const budget = opts.budgetMs ?? Number.POSITIVE_INFINITY;
  const t0 = Date.now();
  const P = chains * d;
  let restarts = 0;
  let totalIt = 0;
  let best: { model: Model; acc: number } | null = null;

  for (;;) {
    const model = randomModel(chains, d, rng);
    const step = new Float64Array(P).fill(0.1);
    const prev = new Float64Array(P);
    const grad = new Float64Array(P);
    const parts = new Float64Array(chains);
    const blockRates: number[] = [];
    let stopped: TrainResult['stopped'] = 'max-iterations';
    let it = 0;
    for (; it < maxIt; it++) {
      grad.fill(0);
      let correct = 0;
      for (let row = 0; row < data.n; row++) {
        const f = score(model, data.X, row, d, parts);
        const t = data.r[row] === 1 ? -1 : 1;
        if ((f < 0 ? 1 : 0) === data.r[row]) correct++;
        const coef = t * (sigmoid(t * f) - 1);
        const o = row * d;
        for (let j = 0; j < chains; j++) {
          let others = 1;
          for (let q = 0; q < chains; q++) if (q !== j) others *= parts[q];
          const c = coef * others;
          const base = j * d;
          for (let i = 0; i < d; i++) grad[base + i] += c * data.X[o + i];
        }
      }
      // iRprop−: grow the step while the gradient keeps its sign, shrink it when it flips.
      for (let p = 0; p < P; p++) {
        const s = prev[p] * grad[p];
        if (s > 0) step[p] = Math.min(step[p] * 1.2, 50);
        else if (s < 0) {
          step[p] = Math.max(step[p] * 0.5, 1e-6);
          grad[p] = 0;
        }
        const w = model.ws[Math.floor(p / d)];
        w[p % d] -= Math.sign(grad[p]) * step[p];
        prev[p] = grad[p];
      }
      // The paper's stopping rule: stop when the mean training prediction rate of a block of
      // five iterations no longer improves on the previous block.
      blockRates.push(correct / data.n);
      if (blockRates.length % 5 === 0 && blockRates.length >= 10) {
        const n = blockRates.length;
        const mean = (a: number, b: number) => blockRates.slice(a, b).reduce((x, y) => x + y, 0) / 5;
        if (mean(n - 5, n) <= mean(n - 10, n - 5)) {
          stopped = 'converged';
          it++;
          break;
        }
      }
      if (Date.now() - t0 > budget) {
        stopped = 'budget';
        it++;
        break;
      }
    }
    totalIt += it;
    const acc = accuracy(model, data);
    if (!best || acc > best.acc) best = { model, acc };
    const enough = opts.restartBelow === undefined || acc >= opts.restartBelow;
    if (enough || stopped === 'budget' || restarts >= (opts.maxRestarts ?? 0) || Date.now() - t0 > budget) {
      return {
        model: best.model,
        iterations: totalIt,
        restarts,
        trainAccuracy: best.acc,
        stopped: Date.now() - t0 > budget && !enough ? 'budget' : stopped,
        ms: Date.now() - t0,
      };
    }
    restarts++;
  }
}
