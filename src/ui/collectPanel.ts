import { cryptoBytes } from '../group-bytes';
import { cryptoRng } from '../rng';
import { Device, randomWeights } from '../puf/device';
import { challengeToHex } from '../puf/model';
import { collect, freshChallenges, repeatability, uniqueness } from '../attack/trials';
import { clear, control, evidenceRetired, h, panelIntro, select, selectWrap } from './dom';
import { DEVICE_LABELS, K, store, type DeviceKind } from './store';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function renderCollectPanel(root: HTMLElement): void {
  const kindSel = select('dev-kind', Object.entries(DEVICE_LABELS) as [string, string][], store.kind);
  const noiseSel = select('dev-noise', [['0', 'No noise'], ['0.25', 'Light noise (σ = 0.25)'], ['1', 'Moderate noise (σ = 1)'], ['5', 'Heavy noise (σ = 5)']], String(store.noise));
  const nSel = select('crp-n', [['100', '100 CRPs'], ['1000', '1 000 CRPs'], ['5000', '5 000 CRPs']], '100');
  const go = h('button', { class: 'btn btn-primary', type: 'button', id: 'crp-collect' }, 'Query the device') as HTMLButtonElement;
  const measure = h('button', { class: 'btn btn-ghost', type: 'button', id: 'crp-measure' }, 'Measure reliability and uniqueness') as HTMLButtonElement;
  const out = h('div', { class: 'output', id: 'crp-out' });
  const meas = h('div', { class: 'output', id: 'crp-measure-out' });
  let shown = false;

  const onDevice = (): void => {
    store.set(kindSel.value as DeviceKind, Number(noiseSel.value));
  };
  kindSel.addEventListener('change', onDevice);
  noiseSel.addEventListener('change', onDevice);
  store.onChange(() => {
    if (shown) {
      clear(out);
      clear(meas);
      out.append(evidenceRetired('The device changed, so the answers shown came from a different chip. Query it again.'));
      shown = false;
    }
  });

  go.addEventListener('click', () => {
    const n = Number(nSel.value);
    const cs = freshChallenges(n, K, cryptoBytes);
    const rs = collect(store.device.oracle(), cs);
    const ones = rs.reduce((a, b) => a + b, 0);
    clear(out);
    out.append(
      h('p', {}, `${n.toLocaleString('en-US')} challenges sent, `, h('strong', { 'data-claim': 'crp-ones' }, String(ones)), ` answered 1 and ${n - ones} answered 0. The first 12:`),
      h(
        'div',
        { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Challenge–response pairs' },
        h(
          'table',
          { class: 'kat-table crp-table' },
          h('caption', { class: 'sr-caption' }, 'Challenge–response pairs'),
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, '#'), h('th', { scope: 'col' }, 'Challenge (64 bits, hex, bit 0 = least significant)'), h('th', { scope: 'col' }, 'Response'))),
          h('tbody', {}, ...cs.slice(0, 12).map((c, i) => h('tr', {}, h('td', {}, String(i + 1)), h('td', {}, h('code', {}, challengeToHex(c))), h('td', {}, String(rs[i]))))),
        ),
      ),
    );
    shown = true;
  });

  measure.addEventListener('click', () => {
    const cs = freshChallenges(1000, K, cryptoBytes);
    const rep = repeatability(store.device.oracle(), cs);
    const others = Array.from({ length: 7 }, () => new Device({ weights: [randomWeights(K, cryptoRng)], noise: store.noise, rng: cryptoRng }).oracle());
    const uni = uniqueness([store.device.oracle(), ...others], cs);
    clear(meas);
    meas.append(
      h(
        'ul',
        { class: 'plain-list' },
        h('li', {}, h('strong', {}, 'Reliability: '), h('span', { 'data-claim': 'reliability' }, pct(rep)), ' of 1,000 challenges answered the same way twice by this device.'),
        h('li', {}, h('strong', {}, 'Uniqueness: '), h('span', { 'data-claim': 'uniqueness' }, pct(uni)), ' mean disagreement between this device and 7 freshly simulated ones (ideal: 50%).'),
      ),
      h('p', { class: 'help' }, 'Neither number says anything about whether the answers can be predicted. That is the next tab.'),
    );
    shown = true;
  });

  root.append(
    panelIntro(
      'Collect CRPs',
      'An attacker who can talk to the chip — or overhear it being authenticated — collects challenge–response pairs (CRPs). Here you are that attacker: send random 64-bit challenges and record what comes back. The device keeps its delays to itself; all you ever see is one bit per challenge.',
    ),
    h('div', { class: 'controls' }, control('dev-kind', 'The device', selectWrap(kindSel)), control('dev-noise', 'Noise inside the device', selectWrap(noiseSel), 'Added by the device to Δ on every query.'), control('crp-n', 'How many challenges', selectWrap(nSel))),
    h('div', { class: 'action-row spaced' }, go, ' ', measure),
    out,
    meas,
  );
}
