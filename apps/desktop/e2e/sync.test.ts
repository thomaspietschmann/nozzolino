import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { launch, cleanup, MAIN, type TestCtx } from './helpers';

const NOTE = `---
id: n1
tags: []
---
# Note One

Body.
`;

/** Minimal stand-in for the sync server: only /api/health is needed here. */
function startStubServer(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, version: 'e2e' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

test.describe('M7 sync settings', () => {
  let ctx: TestCtx;
  let stub: { server: Server; url: string };

  test.beforeEach(async () => {
    stub = await startStubServer();
    ctx = await launch({ 'Note One.md': NOTE });
  });

  test.afterEach(async () => {
    await cleanup(ctx);
    await new Promise<void>((r) => stub.server.close(() => r()));
  });

  test('server mode reveals config and test-connection succeeds', async () => {
    const { page } = ctx;

    // Open settings panel.
    await page.click('button[title="Settings"]');
    await expect(page.getByTestId('sync-settings')).toBeVisible();

    // Server inputs are hidden until server mode is selected.
    await expect(page.getByTestId('sync-server-url')).toHaveCount(0);

    await page.getByTestId('sync-mode-server').click();
    await expect(page.getByTestId('sync-server-url')).toBeVisible();

    // Fill connection details and test against the stub server.
    await page.getByTestId('sync-server-url').fill(stub.url);
    await page.getByTestId('sync-server-token').fill('tok');
    await page.getByTestId('sync-test-connection').click();

    await expect(page.getByTestId('sync-test-result')).toContainText('Connected (ve2e)');
  });

  test('test-connection reports failure for an unreachable server', async () => {
    const { page } = ctx;
    await page.click('button[title="Settings"]');
    await page.getByTestId('sync-mode-server').click();
    await page.getByTestId('sync-server-url').fill('http://127.0.0.1:1'); // nothing listening
    await page.getByTestId('sync-server-token').fill('tok');
    await page.getByTestId('sync-test-connection').click();
    await expect(page.getByTestId('sync-test-result')).toContainText('Failed');
  });

  test('selected mode persists across a relaunch', async () => {
    const { page } = ctx;
    await page.click('button[title="Settings"]');
    await page.getByTestId('sync-mode-server').click();
    await page.getByTestId('sync-server-url').fill(stub.url);
    await page.getByTestId('sync-server-token').fill('tok');
    await page.getByTestId('sync-save').click();
    await expect(page.locator('text=Saved.')).toBeVisible();

    // Relaunch reusing the SAME userData dir → config must survive.
    await ctx.app.close();
    const app2 = await electron.launch({
      args: [MAIN],
      env: { ...process.env, E2E_VAULT_PATH: ctx.vaultDir, E2E_USER_DATA: ctx.userDataDir },
    });
    const page2 = await app2.firstWindow();
    await page2.waitForLoadState('domcontentloaded');
    await page2.click('button[title="Settings"]');
    // Server mode still active → its inputs are shown with the saved URL.
    await expect(page2.getByTestId('sync-server-url')).toHaveValue(stub.url);
    // Hand app2 to afterEach for cleanup (cleanup is double-close safe).
    ctx = { ...ctx, app: app2, page: page2 };
  });
});
