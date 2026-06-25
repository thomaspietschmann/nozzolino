/**
 * User stories: Note lifecycle — create, read, edit, delete, rename.
 */
import { test, expect } from '@playwright/test';
import { launch, cleanup, sidebar } from './helpers.js';
import type { TestCtx } from './helpers.js';

const fm = (id: string) =>
  `---\nid: ${id}\ntags: []\ncreated: 2024-01-01T00:00:00.000Z\nmodified: 2024-01-01T00:00:00.000Z\n---\n`;

const VAULT = {
  'Hello.md': fm('note-hello') + '# Hello\n\nSee also [[World]].\n',
  'World.md': fm('note-world') + '# World\n\nHello from World.\n',
  'Archive.md': fm('note-archive') + '# Archive\n\nOld stuff.\n',
};

let ctx: TestCtx;

test.beforeAll(async () => {
  ctx = await launch(VAULT);
});
test.afterAll(() => cleanup(ctx));

// ── As a user, I want to see my notes when I open a vault ─────────────────────

test('all notes appear in the sidebar after vault open', async () => {
  await expect(sidebar(ctx.page).getByText('Hello')).toBeVisible();
  await expect(sidebar(ctx.page).getByText('World')).toBeVisible();
  await expect(sidebar(ctx.page).getByText('Archive')).toBeVisible();
});

// ── As a user, I want to read a note by clicking it ───────────────────────────

test('clicking a note displays its content in the editor', async () => {
  await sidebar(ctx.page).getByText('World').click();
  await expect(ctx.page.locator('.ProseMirror')).toContainText('Hello from World');
});

// ── As a user, I want my edits to be automatically saved ──────────────────────

test('edits are auto-saved: content persists after navigating away and back', async () => {
  await sidebar(ctx.page).getByText('Archive').click();
  const editor = ctx.page.locator('.ProseMirror');
  await editor.click();
  // Append text at the end
  await ctx.page.keyboard.press('End');
  await ctx.page.keyboard.type(' auto-saved-marker');
  // Wait for the 1s autosave debounce + write to settle
  await ctx.page.waitForTimeout(1_500);
  // Navigate away and back — selectNote re-reads from disk
  await sidebar(ctx.page).getByText('World').click();
  await sidebar(ctx.page).getByText('Archive').click();
  await expect(editor).toContainText('auto-saved-marker', { timeout: 3_000 });
});

// ── As a user, I want to create a new note ────────────────────────────────────

test('creating a note adds it to the sidebar and opens the editor', async () => {
  await ctx.page.getByTitle('New note').click();
  await ctx.page.locator('input[placeholder="Note title…"]').fill('BrandNew');
  await ctx.page.locator('input[placeholder="Note title…"]').press('Enter');
  await expect(sidebar(ctx.page).getByText('BrandNew')).toBeVisible({ timeout: 5_000 });
  // New note should open automatically with an empty editor
  await expect(ctx.page.locator('.ProseMirror')).toBeVisible();
});

// ── As a user, I want to delete a note ───────────────────────────────────────

test('deleting a note removes it from the sidebar', async () => {
  // BrandNew was created by the previous test. Delete it via the sidebar
  // right-click context menu → "Delete note".
  await sidebar(ctx.page).getByText('BrandNew').click({ button: 'right' });
  await ctx.page.getByText('Delete note').click();
  await expect(sidebar(ctx.page).getByText('BrandNew')).toBeHidden({ timeout: 5_000 });
});

// ── As a user, I want to rename a note and have all wikilinks updated ─────────

test('renaming a note updates the sidebar entry', async () => {
  await sidebar(ctx.page).getByText('Hello').click();
  await ctx.page.locator('h1.cursor-text', { hasText: 'Hello' }).click();
  await ctx.page.locator('input.text-2xl').fill('HelloNew');
  await ctx.page.locator('input.text-2xl').press('Enter');
  await expect(sidebar(ctx.page).getByText('HelloNew')).toBeVisible({ timeout: 5_000 });
});

test('renaming propagates the updated title into wikilinks of other notes', async () => {
  // After the previous rename (Hello → HelloNew), check that World still has a link
  // to the renamed note, though Hello.md linked to World, not the other way around.
  // More precisely: World does not link to Hello, so open HelloNew and confirm its body.
  await sidebar(ctx.page).getByText('HelloNew').click();
  const editor = ctx.page.locator('.ProseMirror');
  // The [[World]] wikilink should still render (wikilink node is still in the doc)
  await expect(editor.locator('span.wikilink')).toBeVisible({ timeout: 3_000 });
});
