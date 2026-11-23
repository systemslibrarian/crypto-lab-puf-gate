import type { Rng } from '../rng';
import { wilson } from '../rng';
import { phi, challengeToHex, type Challenge } from '../puf/model';
import { accuracy, train, type Dataset, type TrainResult } from './logreg';

/**
 * The attack as an experiment. The attacker gets an ORACLE (challenge → response bit)
 * and nothing else (invariant 1). Training and test challenges are drawn separately
 * and checked to be disjoint; accuracy is measured on the test set only (invariants 2, 3).
 */
export type Oracle = (c: Challenge) => 0 | 1;
export type ByteSource = (n: number) => Uint8Array;

export const SUCCESS_THRESHOLD = 0.95;

/** n distinct random k-bit challenges, none of which appears in `avoid`. */
export function freshChallenges(n: number, k: number, bytes: ByteSource, avoid: ReadonlySet<string> = new Set()): Challenge[] {
  const out: Challenge[] = [];
  const seen = new Set<string>();
  while (out.length < n) {
    const raw = bytes(Math.ceil(k / 8));
    const c = new Uint8Array(k);
    for (let i = 0; i < k; i++) c[i] = (raw[i >> 3] >> (i & 7)) & 1;
    const key = challengeToHex(c);
    if (seen.has(key) || avoid.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export function keysOf(cs: readonly Challenge[]): Set<string> {
  return new Set(cs.map(challengeToHex));
}

export function dataset(cs: readonly Challenge[], rs: ArrayLike<number>): Dataset {
  const n = cs.length;
  const d = n ? cs[0].length + 1 : 0;
  const X = new Float64Array(n * d);
  cs.forEach((c, i) => X.set(phi(c), i * d));
  return { X, r: Uint8Array.from(rs), n, d };
}

export function collect(oracle: Oracle, cs: readonly Challenge[]): Uint8Array {
  return Uint8Array.from(cs, (c) => oracle(c));
}

/** Reliability: the share of challenges on which two queries of the same device agree. */
export function repeatability(oracle: Oracle, cs: readonly Challenge[]): number {
  let same = 0;
  for (const c of cs) if (oracle(c) === oracle(c)) same++;
  return same / cs.length;
}

/** Uniqueness: mean disagreement between every pair of devices over the same challenges. */
export function uniqueness(oracles: readonly Oracle[], cs: readonly Challenge[]): number {
  const resp = oracles.map((o) => collect(o, cs));
  let sum = 0;
  let pairs = 0;
  for (let a = 0; a < resp.length; a++)
    for (let b = a + 1; b < resp.length; b++) {
      let diff = 0;
      for (let i = 0; i < cs.length; i++) if (resp[a][i] !== resp[b][i]) diff++;
      sum += diff / cs.length;
      pairs++;
    }
  return sum / pairs;
}

/** Draw the training challenges, then a test set that excludes them (invariant 2). */
export function splitExperiment(nTrain: number, nTest: number, k: number, bytes: ByteSource): { trainC: Challenge[]; testC: Challenge[] } {
  const trainC = freshChallenges(nTrain, k, bytes);
  const testC = freshChallenges(nTest, k, bytes, keysOf(trainC));
  return { trainC, testC };
}

/** When the device is noisy, the clone is measured against the device's own repeatability, not against 100%. */
export function compareToRepeatability(heldOut: number, rep: number): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  if (rep >= 0.99) return `the device answers itself the same way ${pct(rep)} of the time, so ${pct(heldOut)} is measured against an essentially stable device`;
  return `the device itself repeats its own answer only ${pct(rep)} of the time (repeatability), so the clone's ${pct(heldOut)} is to be read against that, not against 100%`;
}

export interface AttackReport {
  readonly nTrain: number;
  readonly nTest: number;
  readonly heldOut: number;
  readonly ci: { lo: number; hi: number };
  readonly trainAccuracy: number;
  /** Accuracy of always answering the test set's majority response. */
  readonly baseline: number;
  readonly train: TrainResult;
  readonly verdict: 'cloned' | 'baseline-only' | 'not-cloned' | 'budget';
}

export function attack(
  trainC: readonly Challenge[],
  trainR: ArrayLike<number>,
  testC: readonly Challenge[],
  testR: ArrayLike<number>,
  opts: { chains: number; rng: Rng; budgetMs?: number; restartBelow?: number; maxRestarts?: number; maxIterations?: number },
): AttackReport {
  if (trainC.length === 0) throw new RangeError('no CRPs collected — the attack refuses to run on nothing');
  const trainKeys = keysOf(trainC);
  for (const c of testC) if (trainKeys.has(challengeToHex(c))) throw new Error('a test challenge also appears in the training set; accuracy would not be held-out');
  const tr = dataset(trainC, trainR);
  const te = dataset(testC, testR);
  const result = train(tr, opts);
  const heldOut = accuracy(result.model, te);
  const ones = Array.from(testR).filter((x) => x === 1).length;
  const baseline = Math.max(ones, te.n - ones) / te.n;
  const correct = Math.round(heldOut * te.n);
  const verdict: AttackReport['verdict'] =
    result.stopped === 'budget' && heldOut < SUCCESS_THRESHOLD ? 'budget' : heldOut <= baseline + 0.005 ? 'baseline-only' : heldOut >= SUCCESS_THRESHOLD ? 'cloned' : 'not-cloned';
  return { nTrain: tr.n, nTest: te.n, heldOut, ci: wilson(correct, te.n), trainAccuracy: result.trainAccuracy, baseline, train: result, verdict };
}
