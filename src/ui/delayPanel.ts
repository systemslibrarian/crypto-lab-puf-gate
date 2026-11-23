import { cryptoRng } from '../rng';
import { delta, katWeights, phi, responseOf } from '../puf/model';
import { h, panelIntro, note } from './dom';
import { K } from './store';

const SVG = 'http://www.w3.org/2000/svg';
function s<T extends keyof SVGElementTagNameMap>(tag: T, attrs: Record<string, string | number>, ...kids: (SVGElement | string)[]): SVGElementTagNameMap[T] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of kids) el.append(c);
  return el;
}

export function renderDelayPanel(root: HTMLElement): void {
  const w = katWeights(K);
  const c = new Uint8Array(K);
  const bits = h('div', { class: 'bit-grid', role: 'group', 'aria-label': 'Challenge bits c_0 to c_63' });
  const phiStrip = h('div', { class: 'phi-strip', role: 'group', 'aria-label': 'Feature vector Φ(c), 65 entries' });
  const readout = h('div', { class: 'readout', id: 'delay-readout', role: 'status', 'aria-live': 'polite' });
  const bar = h('div', { id: 'delay-bar' });
  const cells: HTMLButtonElement[] = [];

  const render = (): void => {
    const f = phi(c);
    const d = delta(w, c);
    const r = responseOf(d);
    phiStrip.replaceChildren(...Array.from(f, (v, i) => h('span', { class: `phi ${v > 0 ? 'phi-plus' : 'phi-minus'}`, title: `Φ_${i} = ${v > 0 ? '+1' : '−1'}` }, v > 0 ? '+' : '−')));
    const max = 12;
    const x = (v: number) => 200 + (Math.max(-max, Math.min(max, v)) / max) * 180;
    bar.replaceChildren(
      s(
        'svg',
        { viewBox: '0 0 400 56', class: 'delta-bar', role: 'img', 'aria-label': `Delay difference Δ = ${d.toFixed(6)}; response ${r}` },
        s('line', { x1: 20, x2: 380, y1: 24, y2: 24, class: 'axis' }),
        s('line', { x1: 200, x2: 200, y1: 6, y2: 42, class: 'threshold' }),
        s('rect', { x: Math.min(200, x(d)), y: 14, width: Math.abs(x(d) - 200), height: 20, class: d < 0 ? 'bar-neg' : 'bar-pos' }),
        s('text', { x: 200, y: 54, 'text-anchor': 'middle', class: 'tick' }, '0 — the arbiter\'s threshold'),
        s('text', { x: 24, y: 10, class: 'tick' }, '← response 1'),
        s('text', { x: 376, y: 10, 'text-anchor': 'end', class: 'tick' }, 'response 0 →'),
      ),
    );
    readout.replaceChildren(
      h('p', {}, 'Δ = w · Φ(c) = ', h('strong', { 'data-claim': 'delta' }, d.toFixed(6))),
      h('p', {}, d < 0 ? 'The lower signal arrives first, so the arbiter outputs ' : 'The upper signal arrives first, so the arbiter outputs ', h('strong', { 'data-claim': 'response' }, String(r)), '.'),
    );
    cells.forEach((b, i) => {
      b.textContent = String(c[i]);
      b.setAttribute('aria-label', `bit ${i}: ${c[i]}`);
      b.setAttribute('aria-pressed', String(c[i] === 1));
    });
  };

  for (let i = 0; i < K; i++) {
    const b = h('button', { type: 'button', class: 'bit', 'data-bit': String(i), 'aria-label': `bit ${i}` }, '0') as HTMLButtonElement;
    b.addEventListener('click', () => {
      c[i] ^= 1;
      render();
    });
    cells.push(b);
    bits.append(b);
  }
  const preset = (label: string, id: string, fill: (i: number) => number): HTMLButtonElement => {
    const b = h('button', { type: 'button', class: 'btn btn-ghost', id }, label) as HTMLButtonElement;
    b.addEventListener('click', () => {
      for (let i = 0; i < K; i++) c[i] = fill(i);
      render();
    });
    return b;
  };

  root.append(
    panelIntro(
      'The delay model',
      'An arbiter PUF sends two signals racing through 64 switch stages. Each challenge bit sets one stage: straight through, or crossed. Manufacturing makes every stage a little faster on one path than the other, and at the end an arbiter records which signal won.',
      'The additive delay model sums those small differences. Crossing at stage i swaps the two paths, which flips the sign of everything accumulated before it — so the challenge enters through the feature vector Φ(c), where Φ_i is the product of (1 − 2c_l) over the stages from i to the end. The delay difference is a weighted sum, Δ = w · Φ(c). This chain\'s weights are the published check-A ones, so you can verify the numbers.',
    ),
    h('h3', {}, 'The challenge — click a bit to flip it (bit 0 is the least significant)'),
    bits,
    h('div', { class: 'action-row spaced' }, preset('All 0', 'delay-zeros', () => 0), ' ', preset('All 1', 'delay-ones', () => 1), ' ', preset('Alternating (c_i = i mod 2)', 'delay-alt', (i) => i % 2), ' ', preset('Random', 'delay-random', () => (cryptoRng() < 0.5 ? 1 : 0))),
    h('h3', {}, 'Φ(c): each entry is +1 or −1; the last is always +1'),
    phiStrip,
    h('h3', {}, 'Δ against the threshold'),
    bar,
    readout,
    note('info', 'The point to notice: Δ is linear in Φ(c). Whatever the 65 hidden weights are, the response is the sign of a weighted sum — and a weighted sum is exactly what logistic regression learns.'),
  );
  render();
}
