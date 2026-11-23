#!/usr/bin/env node
/*
 * Mutation runner (§4.1c). Every mutation is a CONCRETE PATCH — file, an anchor
 * that must occur exactly once, its replacement — never a sentence. A KILL is
 * defined by four rules, all enforced here:
 *   1. the owning test PASSED unmutated, in this same run;
 *   2. the patch actually CHANGED the file (anchor found exactly once);
 *   3. the run served the MUTATED code — the built bundle's hash moved;
 *   4. a patch that does not compile is DOES NOT BUILD, never a kill.
 * A red run whose output is a build error, a server that never started or a
 * refused connection is classified, not counted. Playwright runs with CI=1 so
 * `reuseExistingServer` is off and no stale server can answer.
 *
 * The records in mutations/observed.json are written by this script from what
 * it ran. Nothing in that file is typed by hand.
 *
 * Usage: node scripts/mutate.mjs            all mutations
 *        node scripts/mutate.mjs M03 M07    selected ids
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Both runners treat the name as a REGULAR EXPRESSION. An unescaped "[00]" in a
// test name once matched nothing, ran zero tests and passed — the §4.1e hazard —
// so names are escaped here AND every owner run must report a nonzero count.
const re = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const UNIT = (name) => `npx vitest run -t ${JSON.stringify(re(name))}`;
// --retries=0: a retry that passes on a lucky draw would read as a survivor.
const CLAIM = (name) => `npx playwright test --project=claims --retries=0 -g ${JSON.stringify(re(name))}`;
const A11Y = `npx playwright test --project=a11y --retries=0 -g "dark theme$"`;

export const MUTATIONS = [
  {
    id: 'M01', what: 'Φ built from prefix products instead of suffix products (brief D1)',
    file: 'src/puf/model.ts',
    anchor: '  for (let i = k - 1; i >= 0; i--) {\n    acc *= 1 - 2 * c[i];\n    out[i] = acc;\n  }',
    replace: '  for (let i = 0; i < k; i++) {\n    acc *= 1 - 2 * c[i];\n    out[i] = acc;\n  }',
    owner: UNIT('all zeros → Δ = −1.798473'),
  },
  {
    id: 'M02', what: 'Φ_k omitted (the constant feature set to 0) (brief D2)',
    file: 'src/puf/model.ts',
    anchor: '  out[k] = 1;\n',
    replace: '  out[k] = 0;\n',
    owner: UNIT('all zeros → Δ = −1.798473'),
  },
  {
    id: 'M03', what: 'training and test sets share challenges: the test set is drawn without excluding the training set (brief D3)',
    file: 'src/attack/trials.ts',
    anchor: 'const testC = freshChallenges(nTest, k, bytes, keysOf(trainC));',
    replace: 'const testC = [...trainC.slice(0, Math.min(nTest, trainC.length)), ...freshChallenges(Math.max(0, nTest - trainC.length), k, bytes)];',
    owner: UNIT('check-A device, noise off: 2,000 CRPs'),
  },
  {
    id: 'M04', what: 'accuracy computed on the training set (brief D4)',
    file: 'src/attack/trials.ts',
    anchor: '  const heldOut = accuracy(result.model, te);',
    replace: '  const heldOut = accuracy(result.model, tr) + 0 * te.n;',
    owner: UNIT('accuracy is held-out'),
  },
  {
    id: 'M05', what: 'XOR PUF responses ORed instead of XORed (brief D5)',
    file: 'src/puf/device.ts',
    anchor: '      r ^= responseOf(d);',
    replace: '      r |= responseOf(d);',
    owner: UNIT("the device XORs its chains"),
  },
  {
    id: 'M06', what: 'the attacker given w directly: training starts from the check-A weights (brief D6)',
    file: 'src/attack/logreg.ts',
    anchor: '    const model = randomModel(chains, d, rng);',
    replace: '    const model = chains === 1 ? { ws: [katWeights(d - 1)] } : randomModel(chains, d, rng);',
    prelude: { anchor: "import type { Rng } from '../rng';", replace: "import type { Rng } from '../rng';\nimport { katWeights } from '../puf/model';" },
    owner: UNIT('no attack module imports the device or a weight generator'),
  },
  {
    id: 'M07', what: 'negative-claim sentence deleted from the clone fixture (§4.1d bite, assertion 3)',
    file: 'src/ui/attackPanel.ts',
    anchor: "h('p', {}, 'This clone answers fresh challenges the way the chip does. That does not mean anyone copied the chip: nothing physical was touched — the security property that failed is unpredictability of responses, not unclonability of silicon.'),",
    replace: '',
    owner: CLAIM('the negative claim: the device is genuine and its responses are predicted'),
  },
  {
    id: 'M08', what: 'a check inside the fixture broken: the verifier compares the re-query with a fresh set of challenges (§4.1d bite, assertion 2)',
    file: 'src/ui/attackPanel.ts',
    anchor: '  const now = collect(store.device.oracle(), cs);',
    replace: '  const now = collect(store.device.oracle(), freshChallenges(1000, K, cryptoBytes));',
    owner: CLAIM('the negative claim: the device is genuine and its responses are predicted'),
  },
  {
    id: 'M09', what: 'changing N no longer retires the clone',
    file: 'src/ui/attackPanel.ts',
    anchor: "  nSel.addEventListener('change', () => retire('N changed, so the clone shown was trained on a different number of CRPs. Train again.'));\n",
    replace: '',
    owner: CLAIM('changing N retires the clone'),
  },
  {
    id: 'M10', what: 'noise applied to nothing: the device ignores its noise setting',
    file: 'src/puf/device.ts',
    anchor: 'const d = delta(w, c) + (this.#noise > 0 ? this.#noise * gaussian(this.#rng) : 0);',
    replace: 'const d = delta(w, c) + (this.#noise > 1e9 ? this.#noise * gaussian(this.#rng) : 0);',
    owner: UNIT('heavy noise'),
  },
  {
    id: 'M11', what: 'the attack runs on zero CRPs instead of refusing',
    file: 'src/attack/trials.ts',
    anchor: "  if (trainC.length === 0) throw new RangeError('no CRPs collected — the attack refuses to run on nothing');\n",
    replace: '',
    owner: UNIT('N = 0: the attack refuses'),
  },
  {
    id: 'M12', what: 'the majority baseline is not consulted: a constant device is reported as cloned',
    file: 'src/attack/trials.ts',
    anchor: ": heldOut <= baseline + 0.005 ? 'baseline-only'",
    replace: ": heldOut <= baseline - 2 ? 'baseline-only'",
    owner: UNIT('every response the same'),
  },
  {
    id: 'M13', what: 'the gradient sign flipped: training climbs the log-likelihood the wrong way',
    file: 'src/attack/logreg.ts',
    anchor: '        const coef = t * (sigmoid(t * f) - 1);',
    replace: '        const coef = -t * (sigmoid(t * f) - 1);',
    owner: UNIT('check-A device, noise off: 2,000 CRPs'),
  },
  {
    id: 'M14', what: 'gate bite: muted text token darkened below 4.5:1',
    file: 'src/style.css',
    anchor: '--text-dim: #b3bdc8;',
    replace: '--text-dim: #4a525c;',
    owner: A11Y,
  },
];

const sh = (cmd) => {
  try {
    return { ok: true, out: execSync(cmd, { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, CI: '1' }, maxBuffer: 64 << 20 }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};
const bundleHash = () => {
  const dir = join('dist', 'assets');
  const h = createHash('md5');
  for (const f of readdirSync(dir).sort()) h.update(f).update(readFileSync(join(dir, f)));
  return h.digest('hex');
};
/** Tests actually executed, from the runner's own summary line; 0 means the run proved nothing. */
const testsRan = (out) => {
  const v = /Tests\s+(?:\d+ failed \| )?(\d+) passed/.exec(out) ?? /Tests\s+(\d+) failed/.exec(out);
  const p = /(\d+) passed \(/.exec(out) ?? /(\d+) failed/.exec(out);
  return Number((v ?? p)?.[1] ?? 0);
};
const INFRA = /webServer|ECONNREFUSED|was not able to start|Error: Cannot find module|error TS\d+/;

const wanted = process.argv.slice(2);
const list = wanted.length ? MUTATIONS.filter((m) => wanted.includes(m.id)) : MUTATIONS;

const build0 = sh('npm run build');
if (!build0.ok) throw new Error('baseline build fails; refusing to mutate');
const baseHash = bundleHash();
const ownerBaseline = new Map();
for (const owner of new Set(list.map((m) => m.owner))) {
  const r = sh(owner);
  const n = testsRan(r.out);
  ownerBaseline.set(owner, r.ok && n > 0);
  console.log(`baseline ${r.ok ? 'PASS' : 'FAIL'} (${n} test${n === 1 ? '' : 's'})  ${owner}`);
}

const records = [];
for (const m of list) {
  const src = readFileSync(m.file, 'utf8');
  const count = src.split(m.anchor).length - 1;
  const rec = { id: m.id, what: m.what, file: m.file, owner: m.owner, ownerPassedUnmutated: ownerBaseline.get(m.owner) };
  if (count !== 1) {
    records.push({ ...rec, result: `ANCHOR FOUND ${count} TIMES` });
    console.log(`${m.id} ANCHOR FOUND ${count} TIMES`);
    continue;
  }
  let mutated = src.replace(m.anchor, m.replace);
  if (m.prelude) mutated = mutated.replace(m.prelude.anchor, m.prelude.replace);
  writeFileSync(m.file, mutated);
  try {
    const b = sh('npm run build');
    if (!b.ok) {
      records.push({ ...rec, result: 'DOES NOT BUILD' });
      console.log(`${m.id} DOES NOT BUILD`);
      continue;
    }
    const h = bundleHash();
    const t = sh(m.owner);
    const infra = !t.ok && INFRA.test(t.out);
    const killed = rec.ownerPassedUnmutated && h !== baseHash && !t.ok && !infra;
    const result = killed ? 'KILLED' : infra ? 'INCONCLUSIVE (infrastructure failure)' : h === baseHash ? 'INCONCLUSIVE (bundle unchanged)' : 'SURVIVED';
    const failLine = t.out.split('\n').find((l) => /✘|FAIL|AssertionError|Expected|expect\(/.test(l)) ?? '';
    records.push({ ...rec, bundleHashChanged: h !== baseHash, ownerFailedMutated: !t.ok, result, evidence: failLine.trim().slice(0, 240) });
    console.log(`${m.id} ${result}  ${m.what}`);
  } finally {
    writeFileSync(m.file, src);
  }
}
const restored = sh('npm run build');
const restoredHash = restored.ok ? bundleHash() : 'BUILD FAILED';
const summary = {
  ranAt: new Date().toISOString(),
  baselineBundle: baseHash,
  restoredBundleMatches: restoredHash === baseHash,
  killed: records.filter((r) => r.result === 'KILLED').length,
  total: records.length,
  records,
};
mkdirSync('mutations', { recursive: true });
if (!wanted.length) writeFileSync('mutations/observed.json', JSON.stringify(summary, null, 2) + '\n');
console.log(`\n${summary.killed}/${summary.total} killed; restored bundle matches baseline: ${summary.restoredBundleMatches}`);
if (summary.killed !== summary.total || !summary.restoredBundleMatches) process.exit(1);
