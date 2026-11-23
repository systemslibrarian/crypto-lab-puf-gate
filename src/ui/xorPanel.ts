import { cryptoBytes } from '../group-bytes';
import { cryptoRng } from '../rng';
import type { AttackJob, WorkerReply } from '../attack/jobs';
import { collect, splitExperiment, SUCCESS_THRESHOLD } from '../attack/trials';
import { Device, randomWeights } from '../puf/device';
import { clear, control, evidenceRetired, h, note, panelIntro, select, selectWrap, threatModel, verdict } from './dom';
import { flatten, K, runWorker } from './store';

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const BUDGET_MS = 20_000;

export function renderXorPanel(root: HTMLElement): void {
  const lSel = select('xor-l', [['2', '2-XOR'], ['3', '3-XOR'], ['4', '4-XOR']], '2');
  const nSel = select('xor-n', [['2000', '2 000 CRPs'], ['5000', '5 000 CRPs'], ['12000', '12 000 CRPs']], '5000');
  const mSel = select('xor-model', [['linear', 'The linear learner (one weight vector)'], ['product', 'The product model of Rührmair et al. §4.1']], 'linear');
  const run = h('button', { class: 'btn btn-primary', type: 'button', id: 'xor-run' }, 'Attack the XOR PUF') as HTMLButtonElement;
  const cancel = h('button', { class: 'btn btn-ghost', type: 'button', id: 'xor-cancel', disabled: true }, 'Cancel') as HTMLButtonElement;
  const status = h('p', { class: 'help', role: 'status', 'aria-live': 'polite', id: 'xor-status' });
  const out = h('div', { class: 'output', id: 'xor-out' });
  let device: Device | null = null;
  let deviceL = 0;
  let stop: (() => void) | null = null;
  let shown = false;

  const retire = (): void => {
    stop?.();
    stop = null;
    run.disabled = false;
    cancel.disabled = true;
    if (shown) {
      clear(out);
      out.append(evidenceRetired('The settings changed, so the result shown was for a different attack. Run it again.'));
      shown = false;
    }
  };
  for (const el of [lSel, nSel, mSel]) el.addEventListener('change', retire);

  run.addEventListener('click', () => {
    const l = Number(lSel.value);
    if (!device || deviceL !== l) {
      device = new Device({ weights: Array.from({ length: l }, () => randomWeights(K, cryptoRng)), noise: 0, rng: cryptoRng });
      deviceL = l;
    }
    const n = Number(nSel.value);
    const model = mSel.value;
    const { trainC, testC } = splitExperiment(n, 10_000, K, cryptoBytes);
    const oracle = device.oracle();
    const job: AttackJob = {
      kind: 'attack', k: K, trainC: flatten(trainC, K), trainR: collect(oracle, trainC), testC: flatten(testC, K), testR: collect(oracle, testC),
      chains: model === 'product' ? l : 1, budgetMs: BUDGET_MS,
      ...(model === 'product' ? { restartBelow: SUCCESS_THRESHOLD, maxRestarts: 50 } : {}),
    };
    clear(out);
    run.disabled = true;
    cancel.disabled = false;
    status.textContent = `Training on ${n} CRPs from a ${l}-XOR device…`;
    stop = runWorker<WorkerReply>(job, (reply) => {
      stop = null;
      run.disabled = false;
      cancel.disabled = true;
      status.textContent = 'Done.';
      if (!reply.ok || reply.kind !== 'attack') {
        out.append(verdict('fail', reply.ok ? 'unexpected reply' : reply.error));
        return;
      }
      const r = reply.report;
      out.append(
        h('p', {}, `${l}-XOR, ${model === 'product' ? 'product model' : 'linear learner'}: held-out accuracy `, h('strong', { 'data-claim': 'xor-heldout' }, pct(r.heldOut, 2)), ` on ${r.nTest.toLocaleString('en-US')} fresh challenges (95% interval ${pct(r.ci.lo, 2)}–${pct(r.ci.hi, 2)}); ${r.nTrain.toLocaleString('en-US')} training CRPs, ${r.train.iterations} iterations, ${r.train.restarts} restart${r.train.restarts === 1 ? '' : 's'}, ${(r.train.ms / 1000).toFixed(1)} s.`),
        r.verdict === 'cloned'
          ? verdict('alarm', `Cloned: above ${pct(SUCCESS_THRESHOLD, 0)} on held-out challenges. XORing ${l} chains did not stop the attack.`)
          : r.verdict === 'budget'
            ? verdict('pass', `Not learned within the budget of ${BUDGET_MS / 1000} s. That is not evidence of security — Rührmair et al. needed minutes to hours for larger XORs (Table 2).`)
            : model === 'linear'
              ? verdict('pass', 'The linear learner is stuck near a coin flip. That is because an XOR PUF is not a single linear threshold function of Φ — this is the wrong tool, not evidence of security. Switch to the product model.')
              : verdict('pass', `Below the ${pct(SUCCESS_THRESHOLD, 0)} threshold with these CRPs. Not evidence of security: try more CRPs.`),
      );
      shown = true;
    });
  });
  cancel.addEventListener('click', () => {
    stop?.();
    stop = null;
    run.disabled = false;
    cancel.disabled = true;
    status.textContent = 'Cancelled. No result: a partial run is not reported.';
  });

  root.append(
    panelIntro(
      'XOR hardening',
      'The suggested fix: put l arbiter chains side by side, give them the same challenge, and XOR their answers. The XOR of several linear threshold functions is no longer one linear threshold function, so the learner from the previous tab fails.',
      'Rührmair et al. answered by changing the model, not the method. Writing each chain\'s answer as ±1, the XOR is the product of the signs, so the decision boundary is f = ∏ (w_i · Φ(c)) — l weight vectors trained together by the same logistic regression (their §4.1, equation 4).',
    ),
    h('div', { class: 'controls' }, control('xor-l', 'Chains XORed', selectWrap(lSel)), control('xor-n', 'Training CRPs', selectWrap(nSel)), control('xor-model', 'The attack', selectWrap(mSel))),
    h('div', { class: 'action-row spaced' }, run, ' ', cancel),
    status,
    out,
    note(
      'info',
      'From the paper, for 64-stage XOR arbiter PUFs and 99% prediction (their Table 2, one core of a 2010 desktop): 4-XOR needed 12,000 CRPs and 3 min 42 s; 5-XOR 80,000 CRPs and 2 h 8 min; 6-XOR 200,000 CRPs and 31 h. The cost grows quickly with the number of XORs — and so does the noise of the chip, which the paper notes rises too.',
    ),
    threatModel({
      attacker: 'Anyone with challenge–response pairs from the XOR PUF.',
      access: 'CRPs only; a time budget of 20 s in your browser.',
      trusted: 'The additive delay model, exactly, for every chain.',
      success: `A clone above ${pct(SUCCESS_THRESHOLD, 0)} on fresh challenges.`,
      notShown: 'Security for any XOR count: a run that stops at the budget proves nothing.',
    }),
  );
}
