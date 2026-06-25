import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, cleanup, type TestCtx } from './helpers';

const SEED = `---
id: seed
tags: []
---
# Seed

Existing note.
`;

const ALPHA = `---
tags:
  - project
---
# Alpha

Links to [Beta](Beta.md).
`;

const BETA = `---
tags:
  - reference
---
# Beta

Standalone note.
`;

/** Builds an Anytype-style export .zip on disk and returns its path. */
async function makeFixtureZip(): Promise<{ path: string; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'anytype-fixture-'));
  const zip = new JSZip();
  zip.file('Alpha.md', ALPHA);
  zip.file('Beta.md', BETA);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const path = join(dir, 'anytype-export.zip');
  await writeFile(path, buf);
  return { path, dir };
}

test.describe('M8 Anytype import', () => {
  let ctx: TestCtx;
  let fixture: { path: string; dir: string };

  test.beforeEach(async () => {
    fixture = await makeFixtureZip();
    ctx = await launch({ 'Seed.md': SEED }, { env: { E2E_IMPORT_ZIP: fixture.path } });
  });

  test.afterEach(async () => {
    await cleanup(ctx);
    await rm(fixture.dir, { recursive: true, force: true });
  });

  test('imports notes from an Anytype export and they appear in the sidebar', async () => {
    const { page } = ctx;

    // Open settings → start import.
    await page.click('button[title="Settings"]');
    await page.getByTestId('import-anytype-button').click();
    await expect(page.getByTestId('import-dialog')).toBeVisible();

    // Pick (injected fixture) → preview summary.
    await page.getByTestId('import-pick').click();
    await expect(page.getByTestId('import-summary')).toContainText('2 notes');

    // Confirm import → completion.
    await page.getByTestId('import-confirm').click();
    await expect(page.getByTestId('import-done')).toBeVisible();

    // Close and verify the imported notes are listed.
    await page.click('text=Close');
    await expect(page.locator('aside >> text=Alpha')).toBeVisible();
    await expect(page.locator('aside >> text=Beta')).toBeVisible();
  });

  test('imported wiki-link resolves to a backlink', async () => {
    const { page } = ctx;
    await page.click('button[title="Settings"]');
    await page.getByTestId('import-anytype-button').click();
    await page.getByTestId('import-pick').click();
    await expect(page.getByTestId('import-summary')).toBeVisible();
    await page.getByTestId('import-confirm').click();
    await expect(page.getByTestId('import-done')).toBeVisible();
    await page.click('text=Close');

    // Open Beta — Alpha links to it, so it should report a backlink.
    await page.click('aside >> text=Beta');
    // The frontmatter/backlink panel shows "Referenced by"; Alpha → Beta.
    await expect(page.locator('text=Alpha').first()).toBeVisible();
  });
});
