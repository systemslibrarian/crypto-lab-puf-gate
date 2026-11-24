import { cryptoBytes } from '../group-bytes';
import type { AttackJob, CurveJob, WorkerReply } from '../attack/jobs';
import { collect, compareToRepeatability, freshChallenges, repeatability, splitExperiment, SUCCESS_THRESHOLD, type AttackReport } from '../attack/trials';
import { checkRow, clear, control, evidenceRetired, h, note, panelIntro, select, selectWrap, threatModel, verdict } from './dom';
import { flatten, K, runWorker, store } from './store';

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const N_TEST = 10_000;
const SVG = 'http://www.w3.org/2000/svg';
function s<T extends keyof SVGElementTagNameMap>(tag: T, attrs: Record<string, string | number>, ...kids: (SVGElement | string)[]): SVGElementTagNameMap[T] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of kids) el.append(c);
  return el;
}

/** The verifier's own check: re-query enrolled challenges and compare with the enrolled answers. */
function verifierAccepts(): { rate: number; ok: boolean } {
  const cs = freshChallenges(1000, K, cryptoBytes);
  const enrolled = collect(store.device.oracle(), cs);
  const now = collect(store.device.oracle(), cs);
  let same = 0;
  for (let i = 0; i < cs.length; i++) if (enrolled[i] === now[i]) same++;
  const rate = same / cs.length;
  return { rate, ok: rate >= SUCCESS_THRESHOLD };
}

export function renderAttackPanel(root: HTMLElement): void {
  const nSel = select('atk-n', [['0', '0 CRPs'], ['100', '100 CRPs'], ['640', '640 CRPs'], ['2000', '2 000 CRPs'], ['5000', '5 000 CRPs']], '2000');
  const run = h('button', { class: 'btn btn-primary', type: 'button', id: 'atk-run' }, 'Train a clone') as HTMLButtonElement;
  const cancel = h('button', { class: 'btn btn-ghost', type: 'button', id: 'atk-cancel', disabled: true }, 'Cancel') as HTMLButtonElement;
  const status = h('p', { class: 'help', id: 'atk-status', role: 'status', 'aria-live': 'polite' });
  const devLabel = h('p', { class: 'help', id: 'atk-device' }, `Attacking: ${store.label()}. Change the device in the Collect CRPs tab.`);
  const out = h('div', { class: 'output', id: 'atk-out' });
  const curveBtn = h('button', { class: 'btn btn-ghost', type: 'button', id: 'atk-curve' }, 'Plot accuracy against N') as HTMLButtonElement;
  const curveOut = h('div', { class: 'output', id: 'atk-curve-out' });
  let stop: (() => void) | null = null;
  let shown = false;

  const retire = (why: string): void => {
    stop?.();
    stop = null;
    run.disabled = false;
    cancel.disabled = true;
    if (shown) {
      clear(out);
      out.append(evidenceRetired(why));
      shown = false;
    }
  };
  nSel.addEventListener('change', () => retire('N changed, so the clone shown was trained on a different number of CRPs. Train again.'));
  store.onChange(() => {
    devLabel.textContent = `Attacking: ${store.label()}. Change the device in the Collect CRPs tab.`;
    retire('The device changed, so the clone shown was trained on a different chip. Train again.');
    clear(curveOut);
  });

  const show = (r: AttackReport, rep: number): void => {
    clear(out);
    const lead: HTMLElement[] = [
      h('p', {}, 'Device repeatability (measured first): ', h('strong', { 'data-claim': 'atk-repeat' }, pct(rep))),
      h('p', {}, 'Clone vs device on ', h('strong', { 'data-claim': 'atk-ntest' }, r.nTest.toLocaleString('en-US')), ' fresh challenges never used in training: ', h('strong', { 'data-claim': 'atk-heldout' }, pct(r.heldOut, 2)), ` (95% interval ${pct(r.ci.lo, 2)}–${pct(r.ci.hi, 2)}), trained on `, h('strong', { 'data-claim': 'atk-ntrain' }, r.nTrain.toLocaleString('en-US')), ' CRPs.'),
      h('p', { class: 'help' }, `On its own training CRPs the clone scores ${pct(r.trainAccuracy, 2)} — not evidence of anything. Always answering the test set's majority response would score ${pct(r.baseline, 2)}. ${r.train.iterations} RProp iterations, ${r.train.ms} ms.`),
    ];
    if (rep < 0.99) lead.push(note('info', `Noise: ${compareToRepeatability(r.heldOut, rep)}.`));
    out.append(...lead);
    if (r.verdict === 'baseline-only') {
      const comparison = r.heldOut === r.baseline ? 'matched the majority-class baseline' : 'did not clearly outperform the majority-class baseline';
      out.append(verdict('alarm', `The clone ${comparison}. Compare its held-out accuracy with always predicting the more frequent test response.`));
    } else if (r.verdict === 'not-cloned') {
      out.append(verdict('pass', `Below the ${pct(SUCCESS_THRESHOLD, 0)} threshold on held-out challenges with ${r.nTrain} CRPs. This run establishes neither security nor how many observations a different run would need.`));
    } else if (r.verdict === 'budget') {
      out.append(verdict('pass', 'Not learned within the budget. That is not evidence of security.'));
    } else {
      const v = verifierAccepts();
      out.append(
        h(
          'div',
          { class: 'fixture-card', id: 'clone-fixture' },
          h('h3', {}, 'The verifier\'s view'),
          h(
            'ul',
            { class: 'check-list' },
            checkRow(rep >= SUCCESS_THRESHOLD, `Device self-check: it repeats its own answers ${pct(rep)} of the time`, 'fx-repeat', 'reliability'),
            checkRow(v.ok, `The verifier accepts the device: ${pct(v.rate)} of 1,000 enrolled challenges answered as enrolled`, 'fx-genuine', 'the chip is the enrolled chip'),
            checkRow(r.heldOut >= SUCCESS_THRESHOLD, `The clone answers ${pct(r.heldOut, 2)} of ${r.nTest.toLocaleString('en-US')} fresh challenges as the device does — above the ${pct(SUCCESS_THRESHOLD, 0)} threshold`, 'fx-clone', 'modelling accuracy'),
          ),
          verdict('alarm', 'DEVICE GENUINE — AND ITS RESPONSES PREDICTED'),
          h(
            'div',
            { class: 'callout callout-danger negative-claim', 'data-negative-claim': 'clone' },
            h('p', { class: 'negative-claim-title' }, h('span', { 'aria-hidden': 'true' }, '⚠ '), 'A CLONE THAT NEVER TOUCHED THE CHIP'),
            h('p', {}, 'This clone answers fresh challenges the way the chip does. That does not mean anyone copied the chip: nothing physical was touched — the security property that failed is unpredictability of responses, not unclonability of silicon.'),
          ),
        ),
      );
    }
    shown = true;
  };

  run.addEventListener('click', () => {
    clear(out);
    const n = Number(nSel.value);
    if (n === 0) {
      out.append(verdict('fail', 'No CRPs: the attack refuses to run. A model needs examples to learn from.'));
      shown = true;
      return;
    }
    const rep = repeatability(store.device.oracle(), freshChallenges(1000, K, cryptoBytes));
    const { trainC, testC } = splitExperiment(n, N_TEST, K, cryptoBytes);
    const oracle = store.device.oracle();
    const job: AttackJob = { kind: 'attack', k: K, trainC: flatten(trainC, K), trainR: collect(oracle, trainC), testC: flatten(testC, K), testR: collect(oracle, testC), chains: 1, budgetMs: 15_000 };
    run.disabled = true;
    cancel.disabled = false;
    status.textContent = `Training on ${n} CRPs…`;
    stop = runWorker<WorkerReply>(job, (reply) => {
      stop = null;
      run.disabled = false;
      cancel.disabled = true;
      status.textContent = 'Done.';
      if (!reply.ok) {
        out.append(verdict('fail', reply.error));
        return;
      }
      if (reply.kind === 'attack') show(reply.report, rep);
    });
  });
  cancel.addEventListener('click', () => {
    stop?.();
    stop = null;
    run.disabled = false;
    cancel.disabled = true;
    status.textContent = 'Cancelled. No result: a partial run is not reported.';
  });

  curveBtn.addEventListener('click', () => {
    const sizes = [25, 50, 100, 200, 400, 800, 1600, 3200];
    const { trainC, testC } = splitExperiment(3200, 5000, K, cryptoBytes);
    const oracle = store.device.oracle();
    const job: CurveJob = { kind: 'curve', k: K, sizes, poolC: flatten(trainC, K), poolR: collect(oracle, trainC), testC: flatten(testC, K), testR: collect(oracle, testC), budgetMs: 20_000 };
    curveBtn.disabled = true;
    clear(curveOut);
    curveOut.append(h('p', { class: 'help', role: 'status' }, 'Training eight clones…'));
    runWorker<WorkerReply>(job, (reply) => {
      curveBtn.disabled = false;
      clear(curveOut);
      if (!reply.ok || reply.kind !== 'curve') {
        curveOut.append(verdict('fail', reply.ok ? 'unexpected reply' : reply.error));
        return;
      }
      const pts = reply.points;
      const W = 520, H = 260, L = 56, R = 16, T = 14, B = 42;
      const x = (n: number) => L + ((Math.log2(n) - Math.log2(25)) / (Math.log2(3200) - Math.log2(25))) * (W - L - R);
      const y = (a: number) => T + (1 - (a - 0.5) / 0.5) * (H - T - B);
      const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Held-out accuracy against the number of training CRPs; the values are in the table below' });
      for (const a of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) svg.append(s('line', { x1: L, x2: W - R, y1: y(a), y2: y(a), class: 'grid' }), s('text', { x: L - 6, y: y(a) + 4, 'text-anchor': 'end', class: 'tick' }, pct(a, 0)));
      for (const n of sizes) svg.append(s('text', { x: x(n), y: H - B + 16, 'text-anchor': 'middle', class: 'tick' }, String(n)));
      svg.append(
        s('line', { x1: L, x2: W - R, y1: y(SUCCESS_THRESHOLD), y2: y(SUCCESS_THRESHOLD), class: 'threshold-line' }),
        s('text', { x: L + 6, y: y(SUCCESS_THRESHOLD) + 14, class: 'tick' }, `${pct(SUCCESS_THRESHOLD, 0)} threshold`),
        s('text', { x: (L + W - R) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis-label' }, 'training CRPs, N (log scale)'),
        s('polyline', { points: pts.map((p) => `${x(p.n).toFixed(1)},${y(p.heldOut).toFixed(1)}`).join(' '), class: 'curve current' }),
        ...pts.map((p) => s('circle', { cx: x(p.n), cy: y(p.heldOut), r: 4, class: 'marker-dot' })),
      );
      curveOut.append(
        h('div', { class: 'chart-box' }, svg),
        h(
          'div',
          { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Accuracy against N' },
          h('table', { class: 'kat-table', id: 'curve-table' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'N'), h('th', { scope: 'col' }, 'Held-out accuracy'), h('th', { scope: 'col' }, '95% interval'))), h('tbody', {}, ...pts.map((p) => h('tr', {}, h('td', {}, String(p.n)), h('td', {}, pct(p.heldOut, 2)), h('td', {}, `${pct(p.lo, 2)}–${pct(p.hi, 2)}`))))),
        ),
        h('p', { class: 'help' }, `Each point: a new clone trained on the first N of the same 3,200 CRPs, tested on 5,000 fresh challenges. For comparison, Rührmair et al. report 95% after 640 CRPs and 99% after 2,555 for 64-stage arbiter PUFs (their Table 1, averaged over five training sets, Gaussian delays).`),
      );
    });
  });

  root.append(
    panelIntro(
      'Modeling attack',
      'Because the response is the sign of w · Φ(c), learning the chip means learning 65 numbers. Logistic regression does exactly that: it searches for weights whose sign pattern matches the CRPs collected, by gradient descent on the log-likelihood (with RProp, as Rührmair et al. did). Training runs in a background worker.',
      'The result is a program — a clone — that answers challenges the chip has never been asked. It is judged only on fresh challenges it was not trained on, drawn with crypto.getRandomValues.',
    ),
    devLabel,
    h('div', { class: 'controls' }, control('atk-n', 'Training CRPs', selectWrap(nSel))),
    h('div', { class: 'action-row spaced' }, run, ' ', cancel),
    status,
    out,
    h('h3', {}, 'How many CRPs does it take?'),
    h('div', { class: 'action-row spaced' }, curveBtn),
    curveOut,
    threatModel({
      attacker: 'Anyone who can send challenges to the chip, or record a verifier doing so.',
      access: 'Challenge–response pairs only. No probing, no side channels, no knowledge of the delays.',
      trusted: 'That the additive delay model describes the chip — here it does exactly, because the chip is simulated with it.',
      success: `The clone matches the device on at least ${pct(SUCCESS_THRESHOLD, 0)} of fresh challenges.`,
      notShown: 'Anything about real silicon, which follows the model closely but not perfectly, or about a commercial product.',
    }),
  );
}
