import { h, panelIntro } from './dom';

const link = (href: string, text: string): HTMLElement => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);

export function renderMeaningPanel(root: HTMLElement): void {
  root.append(
    panelIntro(
      'What this means',
      'PUFs are used in two very different ways, and modeling attacks hit only one of them.',
    ),
    h('h3', {}, 'Key storage: the PUF answers privately'),
    h('p', {}, 'A chip can derive a secret key from its own PUF at power-up, without keeping a persistent copy of the key across restarts. The answers never leave the chip; a fuzzy extractor turns the slightly noisy readings into the same key every time. An attacker with no access to the raw answers has no CRPs to learn from. The ', link('https://systemslibrarian.github.io/crypto-lab-drift-key/', 'Drift Key'), ' lab builds that fuzzy extractor.'),
    h('h3', {}, 'Authentication: the PUF answers in public'),
    h('p', {}, 'A verifier stores CRPs at enrolment and later asks the chip some of them. Every exchange shows an eavesdropper another challenge and its answer — exactly the data a modeling attack needs. Rührmair et al. conclude that such protocols are broken for the PUFs they modelled, because a clone answers future challenges too.'),
    h('h3', {}, 'Not covered here'),
    h(
      'ul',
      { class: 'plain-list' },
      h('li', {}, 'Real hardware: every chip on this page is simulated.'),
      h('li', {}, 'Ring-oscillator, SRAM and optical PUFs — named, not built. Rührmair et al. also attack ring-oscillator PUFs (§7).'),
      h('li', {}, 'Feed-forward and lightweight PUFs, and Evolution Strategies, the paper\'s second attack: extension points, not built here.'),
      h('li', {}, 'Side-channel-assisted modeling attacks, deep-learning attacks, and any claim about a commercial product.'),
    ),
    h('h3', {}, 'Sources'),
    h(
      'ul',
      { class: 'plain-list sources' },
      h('li', {}, 'U. Rührmair, F. Sehnke, J. Sölter, G. Dror, S. Devadas, J. Schmidhuber, "Modeling Attacks on Physical Unclonable Functions", ACM CCS 2010 — §2.1.1 (logistic regression, RProp), §2.3 (delay model, XOR model), Tables 1–2. ', link('https://doi.org/10.1145/1866307.1866335', 'doi:10.1145/1866307.1866335')),
      h('li', {}, 'B. Gassend, D. Clarke, M. van Dijk, S. Devadas, "Silicon Physical Random Functions", ACM CCS 2002. ', link('https://doi.org/10.1145/586110.586132', 'doi:10.1145/586110.586132')),
      h('li', {}, 'D. Lim et al., "Extracting Secret Keys from Integrated Circuits", IEEE Trans. VLSI Systems 13(10), 2005. ', link('https://doi.org/10.1109/TVLSI.2005.859470', 'doi:10.1109/TVLSI.2005.859470')),
      h('li', {}, 'S. Katzenbeisser, Ü. Kocabaş, V. Rožić, A.-R. Sadeghi, I. Verbauwhede, C. Wachsmann, "PUFs: Myth, Fact or Busted? A Security Evaluation of Physically Unclonable Functions (PUFs) Cast in Silicon", CHES 2012. ', link('https://doi.org/10.1007/978-3-642-33027-8_17', 'doi:10.1007/978-3-642-33027-8_17')),
    ),
  );
}
