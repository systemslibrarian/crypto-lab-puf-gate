# Claims and their evidence — PUF Gate

Batch requirement 1. Every claim the page makes, how it is produced, the test that pins it, the source, and how far it can be read.

| Claim | Execution mode | Evidence (test name) | Source | Interpretation limit |
|---|---|---|---|---|
| Check-A device: w_0 = 0.191507457, w_64 = −0.56183053; Δ(all 0) = −1.798473 → 1; Δ(all 1) = 2.683968 → 0; Δ(c_i = i mod 2) = 1.769958 → 0; 582 of the 1,000 KAT challenges answer 1 | computed | unit `A. Model KAT…` (four tests); claims `the delay model prints the brief's KAT…` | brief author's computation, reproduced here in Python and in the tests | LSB-first challenge bits; the brief's index convention |
| Φ by the product formula equals Φ by the suffix recurrence; Φ_k = 1 | computed | unit `B. Feature-map identity`; claims `flipping bit 10…` | Rührmair et al. §2.3 (Δ = wᵀΦ) | The paper does not print Φ; the convention is the brief's |
| An XOR arbiter PUF's response is the XOR of its chains' responses | computed | unit `two chains: the response is the XOR…`, `the device XORs its chains' responses` | Rührmair et al. §2.3 (XOR Arbiter PUFs) | — |
| The attacker sees only challenges and response bits | computed (module boundary) | unit `the device exposes no weights…`, `no attack module imports the device or a weight generator` | invariant 1 | — |
| 2,000 CRPs give a clone above 95% on 10,000 fresh challenges (check-A device, noise off) | computed (seeded in tests; crypto.getRandomValues on the page) | unit `check-A device, noise off: 2,000 CRPs give ≥ 95%…` (measured 97.60%, 95% CI 97.28–97.88%); claims `the negative claim…` | Rührmair et al. §2.1.1, Table 1 | A simulated chip that follows the model exactly |
| Accuracy is measured on held-out challenges only | computed | unit `accuracy is held-out…`, `training and test challenges are disjoint…` | invariants 2–3 | — |
| The product model learns a 2-XOR arbiter PUF | computed (seeded test); observation on the page | unit `the product model of Rührmair et al. §4.1 learns this seeded 2-XOR device…` | Rührmair et al. §4.1, eq. (4) | One seeded device; the page's runs are observations |
| The linear learner fails on XOR PUFs — the wrong tool, not security | observation | claims `XOR: the linear learner on a 2-XOR device is named the wrong tool…` | Rührmair et al. §2.3 (eq. 5 needs (k+1)^l dimensions) | — |
| Accuracy against N | simulated model, displayed with intervals | not gated | Rührmair et al. Table 1 (cited for comparison) | One device, one run |
| Reliability, uniqueness and modelling accuracy are different measurements | computed | unit `heavy noise…`, `uniqueness: independent random devices disagree…`; claims `a noiseless device repeats itself 100%…`, `heavy noise…` | — | Noise model: Gaussian added to Δ by the device |
| N = 0 is refused; a constant device only matches the baseline; a budget stop is never "secure" | computed | unit `N = 0: the attack refuses`, `every response the same…`, `a 4-XOR device past the time budget…`; claims `N = 0…`, `a device whose every response is 0…` | — | — |
| The shipped randomness is crypto.getRandomValues | computed | unit `the shipped default RNG is crypto.getRandomValues`, `no UI module imports the seeded test generator` | batch requirement 3 | — |
