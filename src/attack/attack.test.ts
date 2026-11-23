import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { seeded, seededBytes } from '../testing/seeded';
import { Device, randomWeights } from '../puf/device';
import { katWeights, phi } from '../puf/model';
import { predictRow } from './logreg';
import { attack, collect, freshChallenges, keysOf, repeatability, splitExperiment, uniqueness, compareToRepeatability } from './trials';

const k = 64;
const katDevice = (noise = 0, seed = 1) => new Device({ weights: [katWeights()], noise, rng: seeded(seed) });

describe('Invariant 1: the attacker sees only (challenge, response) pairs', () => {
  it('the device exposes no weights: no own property, nothing in JSON, only query()', () => {
    const d = katDevice();
    expect(Object.keys(d).sort()).toEqual(['chains', 'k', 'queries']);
    const json = JSON.stringify(d);
    expect(json).not.toContain(String(katWeights()[0]).slice(0, 8));
  });
  it('no attack module imports the device or a weight generator', () => {
    const dir = join(__dirname);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/from ['"][^'"]*puf\/device['"]|\bkatWeights\b|\brandomWeights\b/);
    }
  });
});

describe('C. Learnability (seeded; the page uses crypto.getRandomValues)', () => {
  it('check-A device, noise off: 2,000 CRPs give ≥ 95% on 10,000 fresh challenges', () => {
    const dev = katDevice();
    const { trainC, testC } = splitExperiment(2000, 10_000, k, seededBytes(11));
    const r = attack(trainC, collect(dev.oracle(), trainC), testC, collect(dev.oracle(), testC), { chains: 1, rng: seeded(12) });
    expect(r.nTrain).toBe(2000);
    expect(r.nTest).toBe(10_000);
    expect(r.heldOut).toBeGreaterThanOrEqual(0.95);
    expect(r.verdict).toBe('cloned');
    process.stderr.write(`[C] measured held-out accuracy ${r.heldOut} (95% CI ${r.ci.lo.toFixed(4)}–${r.ci.hi.toFixed(4)}), N = 2000, test 10000\n`);
  });

  it('accuracy is held-out: recomputed here on the test set only, and it differs from the training accuracy at small N', () => {
    const dev = katDevice();
    const { trainC, testC } = splitExperiment(50, 5000, k, seededBytes(21));
    const trainR = collect(dev.oracle(), trainC);
    const testR = collect(dev.oracle(), testC);
    const r = attack(trainC, trainR, testC, testR, { chains: 1, rng: seeded(22) });
    let ok = 0;
    testC.forEach((c, i) => {
      if (predictRow(r.train.model, phi(c), 0, k + 1) === testR[i]) ok++;
    });
    expect(r.heldOut).toBe(ok / 5000);
    expect(r.trainAccuracy).toBeGreaterThan(r.heldOut);
  });

  it('training and test challenges are disjoint, and a shared challenge is refused', () => {
    const { trainC, testC } = splitExperiment(500, 2000, k, seededBytes(31));
    const tk = keysOf(trainC);
    expect(testC.some((c) => tk.has(Array.from(keysOf([c]))[0]))).toBe(false);
    const dev = katDevice();
    expect(() => attack(trainC, collect(dev.oracle(), trainC), [trainC[0]], [dev.query(trainC[0])], { chains: 1, rng: seeded(1) })).toThrow(/held-out/);
  });
});

describe('XOR arbiter PUFs (seeded; the page shows its runs as observations)', () => {
  const rng = seeded(77);
  const ws = [randomWeights(k, rng), randomWeights(k, rng)];
  const dev = new Device({ weights: ws, noise: 0, rng: seeded(2) });
  it('the device XORs its chains\' responses', () => {
    const one = [new Device({ weights: [ws[0]], noise: 0, rng: seeded(1) }), new Device({ weights: [ws[1]], noise: 0, rng: seeded(1) })];
    for (const c of freshChallenges(300, k, seededBytes(4))) expect(dev.query(c)).toBe(one[0].query(c) ^ one[1].query(c));
  });
  it('the product model of Rührmair et al. §4.1 learns this seeded 2-XOR device from 5,000 CRPs (≥ 95% held-out)', () => {
    const { trainC, testC } = splitExperiment(5000, 10_000, k, seededBytes(41));
    const r = attack(trainC, collect(dev.oracle(), trainC), testC, collect(dev.oracle(), testC), { chains: 2, rng: seeded(42), restartBelow: 0.95, maxRestarts: 10, maxIterations: 2000 });
    expect(r.heldOut).toBeGreaterThanOrEqual(0.95);
  }, 60_000);
});

describe('E. Fail-closed', () => {
  it('N = 0: the attack refuses', () => {
    expect(() => attack([], [], freshChallenges(10, k, seededBytes(1)), new Uint8Array(10), { chains: 1, rng: seeded(1) })).toThrow(/refuses/);
  });
  it('every response the same: the result is reported against the majority baseline as matched, not beaten', () => {
    const w = new Float64Array(k + 1);
    w[k] = 5; // Φ_k = 1, so Δ = 5 for every challenge: every response is 0
    const dev = new Device({ weights: [w], noise: 0, rng: seeded(1) });
    const { trainC, testC } = splitExperiment(500, 2000, k, seededBytes(51));
    const r = attack(trainC, collect(dev.oracle(), trainC), testC, collect(dev.oracle(), testC), { chains: 1, rng: seeded(1) });
    expect(r.baseline).toBe(1);
    expect(r.verdict).toBe('baseline-only');
  });
  it('heavy noise: the device disagrees with itself, and the clone is judged against that repeatability, not 100%', () => {
    const dev = katDevice(5, 3);
    const rep = repeatability(dev.oracle(), freshChallenges(2000, k, seededBytes(61)));
    expect(rep).toBeLessThan(0.95);
    expect(compareToRepeatability(0.8, rep)).toMatch(/repeatability/);
    expect(repeatability(katDevice(0).oracle(), freshChallenges(500, k, seededBytes(62)))).toBe(1);
  });
  it('a 4-XOR device past the time budget: "not learned within the budget", never "secure"', () => {
    const r4 = seeded(91);
    const dev = new Device({ weights: [0, 1, 2, 3].map(() => randomWeights(k, r4)), noise: 0, rng: seeded(1) });
    const { trainC, testC } = splitExperiment(3000, 2000, k, seededBytes(71));
    const r = attack(trainC, collect(dev.oracle(), trainC), testC, collect(dev.oracle(), testC), { chains: 4, rng: seeded(1), budgetMs: 30, restartBelow: 0.99, maxRestarts: 100 });
    expect(r.train.stopped).toBe('budget');
    expect(r.verdict).toBe('budget');
  });
  it('uniqueness: independent random devices disagree on roughly half the challenges (seeded, wide bounds)', () => {
    const rng = seeded(99);
    const devs = Array.from({ length: 6 }, () => new Device({ weights: [randomWeights(k, rng)], noise: 0, rng: seeded(1) }).oracle());
    const u = uniqueness(devs, freshChallenges(2000, k, seededBytes(98)));
    expect(u).toBeGreaterThan(0.3);
    expect(u).toBeLessThan(0.7);
  });
});
