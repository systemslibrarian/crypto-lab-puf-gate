import { h, note, panelIntro } from './dom';

export function renderIntroPanel(root: HTMLElement): void {
  root.append(
    panelIntro(
      'What a PUF is',
      'No two chips come out of a factory exactly alike: wires differ by a few atoms, transistors switch a few picoseconds apart. A physical unclonable function (PUF) turns those differences into an identity. Ask the chip a question — a challenge — and it answers with a bit that depends on its own physical quirks. Another chip, made the same way, answers differently. The chip is a fingerprint that answers questions.',
      'The hope is that the answers are unpredictable: that nobody, not even the manufacturer, can say what this chip will answer without asking it. This lab tests that hope on the arbiter PUF — and shows that a chip can be physically one of a kind and still entirely predictable.',
    ),
    h('h3', {}, 'Three different measurements'),
    h(
      'ul',
      { class: 'plain-list' },
      h('li', {}, h('strong', {}, 'Reliability'), ' — does the same chip give the same answer to the same challenge, again and again? Noise makes it slip.'),
      h('li', {}, h('strong', {}, 'Uniqueness'), ' — do two different chips disagree? Ideally on half of all challenges.'),
      h('li', {}, h('strong', {}, 'Modelling accuracy'), ' — can a program, trained on answers the chip gave, predict the answers it will give? This is the one that breaks.'),
    ),
    note(
      'caveat',
      'Not production software, and no hardware: a browser has no PUF. The chips here are simulated with the additive linear delay model that Rührmair et al. used for their attacks. The machine learning is real — logistic regression trained in your browser.',
    ),
  );
}
