import { defineConfig, configDefaults } from 'vitest/config';

// base must match the GitHub Pages project subpath: https://<user>.github.io/crypto-lab-puf-gate/
export default defineConfig({
  base: '/crypto-lab-puf-gate/',
  test: {
    // Colocated unit tests only; keep Playwright specs in e2e/ out of the Vitest run.
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
