import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { boot } from './gate';

/**
 * The claims suite (§4.1b): what the page SAYS, re-derived here. The check-A weights
 * and the feature map are rebuilt below from their definitions with node:crypto, by a
 * route separate from src/.
 */
const W = Array.from({ length: 65 }, (_, i) => createHash('sha256').update(Buffer.concat([Buffer.from('puf-gate weight'), Buffer.from([i])])).digest().readInt32BE(0) / 2 ** 31);
const deltaOf = (c: number[]): number => {
  let s = W[64];
  for (let i = 0; i < 64; i++) {
    let p = 1;
    for (let l = i; l < 64; l++) p *= 1 - 2 * c[l];
    s += W[i] * p;
  }
  return s;
};

async function openTab(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
}
const pctNum = async (page: Page, sel: string): Promise<number> => Number((await page.locator(sel).innerText()).replace('%', '')) / 100;

async function trainClone(page: Page, n = '2000'): Promise<void> {
  await openTab(page, /Modeling attack/);
  await page.locator('#atk-n').selectOption(n);
  await page.locator('#atk-run').click();
  await expect(page.locator('#atk-status')).toHaveText('Done.', { timeout: 30_000 });
}

test.describe('displayed claims', () => {
  test('the delay model prints the brief\'s KAT: Δ and response for all zeros, all ones and c_i = i mod 2, recomputed here', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /The delay model/);
    const cases: [string, number[], string, string][] = [
      ['#delay-zeros', Array(64).fill(0), '-1.798473', '1'],
      ['#delay-ones', Array(64).fill(1), '2.683968', '0'],
      ['#delay-alt', Array.from({ length: 64 }, (_, i) => i % 2), '1.769958', '0'],
    ];
    for (const [btn, c, d, r] of cases) {
      await page.locator(btn).click();
      expect(deltaOf(c).toFixed(6)).toBe(d);
      await expect(page.locator('[data-claim="delta"]')).toHaveText(d);
      await expect(page.locator('[data-claim="response"]')).toHaveText(r);
    }
  });

  test('flipping bit 10 from all zeros makes Φ_0 … Φ_10 negative and leaves the rest positive', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /The delay model/);
    await page.locator('#delay-zeros').click();
    await page.locator('.bit[data-bit="10"]').click();
    const strip = (await page.locator('.phi-strip .phi').allInnerTexts()).join('');
    expect(strip).toBe('−'.repeat(11) + '+'.repeat(54));
    const c = Array(64).fill(0);
    c[10] = 1;
    await expect(page.locator('[data-claim="delta"]')).toHaveText(deltaOf(c).toFixed(6));
  });

  test('the negative claim: the device is genuine and its responses are predicted', async ({ page }) => {
    await boot(page, 'dark');
    await trainClone(page);
    const fixture = page.locator('#clone-fixture');
    // 1. Reached.
    await expect(fixture).toBeVisible();
    // 2. Every check rendered in the fixture passes, and the accuracy is held-out against the threshold.
    const oks = await fixture.locator('[data-check]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ok')));
    expect(oks).toEqual(['true', 'true', 'true']);
    await expect(page.locator('[data-claim="atk-ntest"]')).toHaveText('10,000');
    await expect(page.locator('[data-claim="atk-ntrain"]')).toHaveText('2,000');
    expect(await pctNum(page, '[data-claim="atk-heldout"]')).toBeGreaterThanOrEqual(0.95);
    await expect(fixture.locator('.verdict-alarm')).toContainText('DEVICE GENUINE — AND ITS RESPONSES PREDICTED');
    // 3. The limitation is on screen, in that state, tied to the fixture.
    const claim = fixture.locator('[data-negative-claim="clone"]');
    await expect(claim).toBeVisible();
    await expect(claim).toContainText('This clone answers fresh challenges the way the chip does. That does not mean anyone copied the chip: nothing physical was touched — the security property that failed is unpredictability of responses, not unclonability of silicon.');
  });

  test('N = 0: the attack refuses and says so', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Modeling attack/);
    await page.locator('#atk-n').selectOption('0');
    await page.locator('#atk-run').click();
    await expect(page.locator('#atk-out .verdict-fail')).toContainText('refuses');
  });

  test('a device whose every response is 0: the clone matched the majority baseline, and the page says it did not beat it', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Collect CRPs/);
    await page.locator('#dev-kind').selectOption('flat');
    await trainClone(page, '640');
    await expect(page.locator('#atk-out')).toContainText('matched the majority-class baseline');
    await expect(page.locator('#clone-fixture')).toHaveCount(0);
  });

  test('heavy noise: the device\'s repeatability is reported first and the clone is read against it', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Collect CRPs/);
    await page.locator('#dev-noise').selectOption('5');
    await trainClone(page);
    expect(await pctNum(page, '[data-claim="atk-repeat"]')).toBeLessThan(0.95);
    await expect(page.locator('#atk-out')).toContainText('not against 100%');
  });

  test('changing N retires the clone, and the page says it did', async ({ page }) => {
    await boot(page, 'dark');
    await trainClone(page);
    await expect(page.locator('[data-claim="atk-heldout"]')).toHaveCount(1);
    await page.locator('#atk-n').selectOption('640');
    await expect(page.locator('[data-claim="atk-heldout"]')).toHaveCount(0);
    await expect(page.locator('#atk-out .evidence-retired')).toContainText('different number of CRPs');
  });

  test('changing the device retires the clone, and the page says it did', async ({ page }) => {
    await boot(page, 'dark');
    await trainClone(page);
    await openTab(page, /Collect CRPs/);
    await page.locator('#dev-kind').selectOption('random');
    await openTab(page, /Modeling attack/);
    await expect(page.locator('#clone-fixture')).toHaveCount(0);
    await expect(page.locator('#atk-out .evidence-retired')).toContainText('different chip');
  });

  test('a noiseless device repeats itself 100% of the time; the CRP table shows 12 rows', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Collect CRPs/);
    await page.locator('#crp-collect').click();
    await expect(page.locator('.crp-table tbody tr')).toHaveCount(12);
    await page.locator('#crp-measure').click();
    await expect(page.locator('[data-claim="reliability"]')).toHaveText('100.0%');
    await expect(page.locator('#crp-measure-out')).toContainText('all 28 pairs of the 8 devices');
  });

  test('XOR: the linear learner on a 2-XOR device is named the wrong tool, not evidence of security', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /XOR hardening/);
    await page.locator('#xor-run').click();
    await expect(page.locator('#xor-status')).toHaveText('Done.', { timeout: 30_000 });
    await expect(page.locator('#xor-out')).toContainText('wrong tool, not evidence of security');
  });
});
