import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // Each test launches its own Electron instance; some specs share an app across
  // tests within a file, so run serially to avoid cross-test DOM races and
  // resource contention between parallel Electron processes.
  workers: 1,
  fullyParallel: false,
  // One retry on CI absorbs rare Electron launch-timing flakiness without hiding
  // real failures locally.
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
});
