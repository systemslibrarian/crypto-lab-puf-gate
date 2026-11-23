# PUF Gate

**Arbiter PUF · additive delay model · modeling attack**

Browser-based physical unclonable functions — an arbiter PUF and its XOR-arbiter hardening side by side, with the additive delay model, challenge–response pairs collected live, and a logistic-regression modeling attack that learns a clone from a few thousand responses.

## What It Is

A physical unclonable function (PUF) answers challenges with bits that depend on manufacturing variation. This lab simulates the **arbiter PUF** in the **additive linear delay model** that Rührmair et al. used in "Modeling Attacks on Physical Unclonable Functions" (ACM CCS 2010): a 64-stage chain with a hidden delay vector w of 65 reals, a feature map Φ(c), and the response given by the sign of Δ = w · Φ(c). It then attacks it the way the paper does — **logistic regression trained with RProp** on collected challenge–response pairs (CRPs) — and the **XOR arbiter PUF** with the paper's product model, f = ∏ (w_i · Φ(c)).

What is real: the machine learning, the measurements, and every number on the page. What is modelled: the chip itself — there is no hardware, and the simulated chip follows the delay model exactly, which real silicon does only closely. The device keeps its weights in a private field; the attacker modules receive only challenges and response bits. **Not production software — a teaching demo**, and no claim about any commercial product.

### Exact conventions

- Challenges are 64 bits c_0 … c_63. Written as a 64-bit integer, bit i of the integer is c_i (**LSB-first**). MSB-first gives different responses.
- Φ_i(c) = ∏_{l=i}^{63} (1 − 2c_l) for i = 0 … 63, and Φ_64 = 1. Δ = w · Φ(c); the response is 1 if Δ < 0, else 0. The paper writes t = sgn(Δ) ∈ {−1, 1} and does not print Φ; this index convention is the brief's.
- Check-A device: w_i = (first 4 bytes of SHA-256(ASCII "puf-gate weight" ‖ byte i), as a big-endian signed int32) / 2^31. KAT challenge t: the first 8 bytes of SHA-256("puf-gate challenge" ‖ uint32 big-endian t), as a big-endian integer, LSB-first.
- Noise: the device adds N(0, σ²) to each chain's Δ on every query.
- Random devices: delays drawn from a standard normal, as in the paper's §2.4. Challenges, delays and noise come from `crypto.getRandomValues`; tests inject a seeded generator.

## Exhibits

1. **What a PUF is** — a fingerprint that answers questions; reliability, uniqueness and modelling accuracy told apart.
2. **The delay model** — 64 challenge bits to click, Φ(c) as a ±1 strip, Δ as a signed bar against the arbiter's threshold, on the check-A weights.
3. **Collect CRPs** — query the device (check-A, a random one, or a pathological one; with or without noise), and measure reliability and uniqueness.
4. **Modeling attack** — train a clone in a worker; held-out accuracy on 10,000 fresh challenges with a 95% interval, the training accuracy and the majority baseline beside it, and accuracy plotted against N.
5. **XOR hardening** — 2-, 3- and 4-XOR arbiter PUFs against the linear learner and against the product model, with CRPs, iterations, restarts and time, and a 20-second budget.
6. **What this means** — PUFs for key storage (with a fuzzy extractor) versus PUFs for CRP authentication, and why modeling attacks hit the second.

## When to Use It

- To see why physical uniqueness does not make responses unpredictable.
- To see how few CRPs a linear model needs, and what XORing chains changes.
- **Do NOT** read a "not learned within the budget" result as security.
- **Do NOT** draw conclusions about real chips or products: the device here is the model.

## Live Demo

https://systemslibrarian.github.io/crypto-lab-puf-gate/

Flip challenge bits and watch Δ change, collect CRPs, train a clone that predicts a chip it never touched, and try the same against XOR arbiter PUFs.

## What Can Go Wrong

Physical uniqueness does not make challenge responses unpredictable. If its responses are a simple function of the challenge, an attacker who collects enough challenge–response pairs can learn that function in software and answer future challenges without the chip.

## Real-World Usage

- Gassend, Clarke, van Dijk and Devadas introduced silicon PUFs (ACM CCS 2002); Lim et al. used arbiter PUFs to extract secret keys from integrated circuits (IEEE TVLSI, 2005).
- Rührmair et al. (ACM CCS 2010) reported modeling attacks on arbiter, XOR arbiter, lightweight, feed-forward and ring-oscillator PUFs; for 64-stage arbiter PUFs, 640 CRPs gave 95% prediction and 2,555 gave 99% (Table 1).
- Katzenbeisser et al. (CHES 2012) evaluated PUFs cast in silicon.

## How to Run Locally

```bash
npm ci
npm run dev          # http://localhost:5173/crypto-lab-puf-gate/
npm test             # unit tests and KATs (Vitest)
npm run test:e2e:all # accessibility gate + claims suite (Playwright, builds first)
npm run test:mutations
```

## Related Demos

- [Drift Key](https://systemslibrarian.github.io/crypto-lab-drift-key/) — the fuzzy extractor that turns noisy PUF readings into a stable key.
- [Attestation Gate](https://systemslibrarian.github.io/crypto-lab-attestation-gate/)
- [Power Trace](https://systemslibrarian.github.io/crypto-lab-power-trace/)
- [Model Breach](https://systemslibrarian.github.io/crypto-lab-model-breach/)

## Build & Verify

- **Unit tests (Vitest): 23 tests**, including:
  - A. Model KAT (LSB-first): w_0, w_64, the three Δ values and responses, and 582 ones among the 1,000 KAT challenges — each also recomputed through Φ by the product definition.
  - B. Φ by products equals Φ by the recurrence on 1,000 random challenges; Φ_64 = 1.
  - C. Learnability: on the check-A device with noise off, 2,000 seeded CRPs give **97.60%** on 10,000 fresh seeded challenges (95% CI 97.28–97.88%); accuracy recomputed on the test set only; disjoint training and test sets.
  - XOR: the device XORs its chains; the product model learns a seeded 2-XOR device from 5,000 CRPs (≥ 95% held out).
  - Invariant 1: the device exposes no weights; no attack module imports the device or a weight generator.
  - E. Fail-closed: N = 0 refused; a constant device matched the baseline, not beaten; heavy noise judged against repeatability; a 4-XOR run stopped by the budget reported as such.
- **Claims suite (Playwright): 10 tests** — the KAT values printed by the delay model, recomputed with node:crypto; the Φ strip after one flip; the negative claim in its fixture (§4.1d); N = 0; the constant device; heavy noise; two retirements; repeatability; the XOR linear learner named the wrong tool.
- **Maintenance controls: 12 tests** on the workflow, pinning and provenance, run before every build.
- **Mutation ledger: 14 of 14 killed** — the brief's six (prefix products; Φ_k omitted; training and test sets sharing challenges; accuracy on the training set; XOR responses ORed; the attacker given w), the two §4.1d bites, a retirement, the device ignoring its noise, the attack running on zero CRPs, the baseline ignored, the gradient sign flipped, and the accessibility gate. Run by `scripts/mutate.mjs`; its record is `mutations/observed.json`.
- **Accessibility gate:** axe-core WCAG 2.1 A/AA plus arithmetic contrast, non-text contrast, reflow at 380px, scroll-region and focus oracles over every driven state at desktop and phone width. Zero violations.

## Claim-to-evidence table

The full table is in [claims.md](claims.md). Deterministic correctness, KATs and property tests gate CI; accuracy curves and the page's XOR runs are displayed with N and intervals and never gate.

## Negative claim

> This clone answers fresh challenges the way the chip does. That does not mean anyone copied the chip: nothing physical was touched — the security property that failed is unpredictability of responses, not unclonability of silicon.

Evidence fixture (Modeling attack tab, check-A device, 2,000 CRPs): the device's self-check passes, the verifier accepts the device, the clone matches the device on 10,000 fresh challenges above the 95% threshold — and the verdict is **DEVICE GENUINE — AND ITS RESPONSES PREDICTED**.

## Notes on the brief

- The author list on the paper's title page is confirmed: Rührmair, Sehnke, Sölter, Dror, Devadas, Schmidhuber.
- The paper states Δ = wᵀΦ and t = sgn(Δ) but does not print Φ (it cites [15], [9], [16]), so there is no paper index convention to compare with; the lab uses the brief's, stated in full above, and the KAT reproduces exactly.
- The XOR attack is the paper's: logistic regression with the product decision boundary of §4.1 (equation 4), RProp, and restarts when a run converges below the target. Evolution Strategies are an extension point, not built.

## Performance

Training on 2,000 CRPs takes tens of milliseconds; all training runs in a Web Worker with Cancel and a time budget (15 s for the single chain, 20 s for XOR). A run cut short reports "not learned within the budget".

## Non-goals

Real hardware; ring-oscillator, SRAM and optical PUFs (named, not built); feed-forward and lightweight PUFs and Evolution Strategies (extension points); side-channel-assisted modeling attacks; deep-learning attacks; any claim about a commercial product.

## Sources

- U. Rührmair, F. Sehnke, J. Sölter, G. Dror, S. Devadas, J. Schmidhuber, "Modeling Attacks on Physical Unclonable Functions", ACM CCS 2010 — https://doi.org/10.1145/1866307.1866335
- B. Gassend, D. Clarke, M. van Dijk, S. Devadas, "Silicon Physical Random Functions", ACM CCS 2002 — https://doi.org/10.1145/586110.586132
- D. Lim, J. W. Lee, B. Gassend, G. E. Suh, M. van Dijk, S. Devadas, "Extracting Secret Keys from Integrated Circuits", IEEE Trans. VLSI Systems 13(10), 2005 — https://doi.org/10.1109/TVLSI.2005.859470
- S. Katzenbeisser, Ü. Kocabaş, V. Rožić, A.-R. Sadeghi, I. Verbauwhede, C. Wachsmann, "PUFs: Myth, Fact or Busted? A Security Evaluation of Physically Unclonable Functions (PUFs) Cast in Silicon", CHES 2012 — https://doi.org/10.1007/978-3-642-33027-8_17

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
