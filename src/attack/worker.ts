/// <reference lib="webworker" />
import { cryptoRng } from '../rng';
import type { Challenge } from '../puf/model';
import { attack } from './trials';
import type { AttackJob, CurveJob, WorkerReply } from './jobs';

/**
 * Training off the main thread. The page sends flattened challenges and response bits —
 * never a device or its weights — and can terminate this worker at any time.
 */
export function unflatten(flat: Uint8Array, k: number): Challenge[] {
  const out: Challenge[] = [];
  for (let o = 0; o < flat.length; o += k) out.push(flat.subarray(o, o + k));
  return out;
}

self.onmessage = (e: MessageEvent<AttackJob | CurveJob>) => {
  const job = e.data;
  try {
    if (job.kind === 'attack') {
      const report = attack(unflatten(job.trainC, job.k), job.trainR, unflatten(job.testC, job.k), job.testR, {
        chains: job.chains,
        rng: cryptoRng,
        budgetMs: job.budgetMs,
        restartBelow: job.restartBelow,
        maxRestarts: job.maxRestarts,
      });
      postMessage({ ok: true, kind: 'attack', report } satisfies WorkerReply);
    } else {
      const pool = unflatten(job.poolC, job.k);
      const test = unflatten(job.testC, job.k);
      const t0 = Date.now();
      const points = [];
      for (const n of job.sizes) {
        if (Date.now() - t0 > job.budgetMs) break;
        const r = attack(pool.slice(0, n), job.poolR.subarray(0, n), test, job.testR, { chains: 1, rng: cryptoRng });
        points.push({ n, heldOut: r.heldOut, lo: r.ci.lo, hi: r.ci.hi });
      }
      postMessage({ ok: true, kind: 'curve', points } satisfies WorkerReply);
    }
  } catch (err) {
    postMessage({ ok: false, error: (err as Error).message } satisfies WorkerReply);
  }
};
