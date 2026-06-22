/**
 * Regression tests for self-conflict suppression (D5 fix).
 *
 * On a single device, the app's own autosave writes must never produce a
 * conflict dialog.  A genuine out-of-band write (simulating Syncthing) must
 * still produce one.
 */
import { test, expect } from '@playwright/test';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { launch, cleanup, sidebar } from './helpers.js';
import type { TestCtx } from './helpers.js';

const fm = (id: string) =>
  `---\nid: ${id}\ntags: []\ncreated: 2024-01-01T00:00:00.000Z\nmodified: 2024-01-01T00:00:00.000Z\n---\n`;

const VAULT = {
  'Alpha.md': fm('note-alpha') + '# Alpha\n\nSome content here.\n',
  'Beta.md': fm('note-beta') + '# Beta\n\nAnother note.\n',
};

let ctx: TestCtx;

test.beforeAll(async () => {
  ctx = await launch(VAULT);
});
test.afterAll(() => cleanup(ctx));

// ── No self-conflicts while typing ────────────────────────────────────────────

test('typing in the editor does not open a conflict dialog', async () => {
  await sidebar(ctx.page).getByText('Alpha').click();
  await expect(ctx.page.locator('.ProseMirror')).toBeVisible({ timeout: 5_000 });

  const editor = ctx.page.locator('.ProseMirror');
  await editor.click();
  await ctx.page.keyboard.press('End');

  // Type several wikilinks — the exact pattern that triggered the false conflict.
  await ctx.page.keyboard.type('\n[[fewew]]\n[[ewffe]]');

  // Wait well past the 1 s autosave debounce + 300 ms chokidar stabilityThreshold.
  await ctx.page.waitForTimeout(2_000);

  // The conflict banner must NOT appear ("Review versions" button absent).
  await expect(ctx.page.locator('button', { hasText: 'Review versions' })).toBeHidden({ timeout: 500 });

  // Verify no .sync-conflict- file was created in the vault directory.
  const { execSync } = await import('child_process');
  const conflictFiles = execSync(`find "${ctx.vaultDir}" -name "*.sync-conflict-*"`, { encoding: 'utf8' }).trim();
  expect(conflictFiles).toBe('');
});

test('continuing to type multiple autosave cycles never produces a conflict', async () => {
  // Alpha is already open from the previous test; keep typing to trigger
  // several more autosave cycles.
  const editor = ctx.page.locator('.ProseMirror');
  await editor.click();

  for (let i = 0; i < 3; i++) {
    await ctx.page.keyboard.type(`\nLine ${i}`);
    await ctx.page.waitForTimeout(1_500); // let one debounce+watcher cycle complete
  }

  await expect(ctx.page.locator('button', { hasText: 'Review versions' })).toBeHidden({ timeout: 500 });

  const { execSync } = await import('child_process');
  const conflictFiles = execSync(`find "${ctx.vaultDir}" -name "*.sync-conflict-*"`, { encoding: 'utf8' }).trim();
  expect(conflictFiles).toBe('');
});

// ── A genuine out-of-band write still creates a conflict ──────────────────────

test('an external write to the open note while dirty shows the conflict banner', async () => {
  // Open Beta and make it dirty without saving (type without waiting).
  await sidebar(ctx.page).getByText('Beta').click();
  await expect(ctx.page.locator('.ProseMirror')).toBeVisible({ timeout: 5_000 });

  // Type something to set isDirty but immediately write externally before the
  // 1 s autosave fires — simulating Syncthing writing a different version.
  await ctx.page.locator('.ProseMirror').click();
  await ctx.page.keyboard.press('End');
  await ctx.page.keyboard.type('\nlocal unsaved edit');

  // Overwrite the file externally with *different* content (different hash).
  const betaPath = join(ctx.vaultDir, 'Beta.md');
  const externalContent =
    fm('note-beta') + '# Beta\n\nSyncthing wrote this — completely different.\n';
  await writeFile(betaPath, externalContent, 'utf8');

  // The ConflictBanner appears (external hash ≠ last self-write hash → real conflict).
  // The user then clicks "Review versions" to open the full resolver.
  await expect(ctx.page.locator('button', { hasText: 'Review versions' })).toBeVisible({ timeout: 5_000 });
});
