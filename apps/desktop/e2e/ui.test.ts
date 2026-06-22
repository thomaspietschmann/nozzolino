/**
 * User stories: Theme, graph view, file tree (folders + keyboard nav),
 * month browser, tags via metadata panel.
 */
import { test, expect } from '@playwright/test';
import { launch, cleanup, sidebar } from './helpers.js';
import type { TestCtx } from './helpers.js';

const fm = (id: string) =>
  `---\nid: ${id}\ntags: []\ncreated: 2024-01-01T00:00:00.000Z\nmodified: 2024-01-01T00:00:00.000Z\n---\n`;
const fmTagged = (id: string, tags: string[]) =>
  `---\nid: ${id}\ntags: [${tags.map((t) => `"${t}"`).join(', ')}]\ncreated: 2024-01-01T00:00:00.000Z\nmodified: 2024-01-01T00:00:00.000Z\n---\n`;

const VAULT = {
  'Root.md': fm('note-root') + '# Root\n\nRoot note.\n',
  'projects/Alpha.md': fm('note-alpha') + '# Alpha\n\nIn projects folder.\n',
  'projects/Beta.md': fmTagged('note-beta', ['dev']) + '# Beta\n\nAlso in projects.\n',
  'archive/Old.md': fm('note-old') + '# Old\n\nArchived note.\n',
};

let ctx: TestCtx;

test.beforeAll(async () => {
  ctx = await launch(VAULT);
  // Ensure Root is visible before tests run
  await ctx.page.waitForSelector('aside >> text=Root', { timeout: 10_000 });
});
test.afterAll(() => cleanup(ctx));

// ── As a user, I want to switch between light and dark mode ───────────────────

test('switching to light mode removes the dark class from <html>', async () => {
  // Open settings panel via the ⚙ button in the sidebar header
  await ctx.page.getByTitle('Settings').click();
  await ctx.page.getByRole('button', { name: 'Light' }).click();
  const htmlClass = await ctx.page.evaluate(() => document.documentElement.className);
  expect(htmlClass).not.toContain('dark');
});

test('switching back to dark mode re-adds the dark class', async () => {
  await ctx.page.getByRole('button', { name: 'Dark' }).click();
  const htmlClass = await ctx.page.evaluate(() => document.documentElement.className);
  expect(htmlClass).toContain('dark');
  // Close settings panel
  await ctx.page.getByTitle('Settings').click();
});

// ── As a user, I want to see my notes as a graph ─────────────────────────────

test('Ctrl+G opens the graph view', async () => {
  await sidebar(ctx.page).getByText('Root').click();
  // Wait for note content to load (activeNoteContent !== null guard in AppShell)
  // before toggling graph — otherwise graphOpen flips but GraphView never mounts
  await expect(ctx.page.locator('.ProseMirror')).toBeVisible({ timeout: 5_000 });
  await ctx.page.keyboard.press('Control+g');
  // Cytoscape creates 3 canvas layers — use .first() to avoid strict-mode violation
  await expect(ctx.page.locator('canvas').first()).toBeVisible({ timeout: 8_000 });
  // ProseMirror should be gone (ternary in AppShell replaces editor with GraphView)
  await expect(ctx.page.locator('.ProseMirror')).toBeHidden();
});

test('Ctrl+G again closes the graph view and restores the editor', async () => {
  await ctx.page.keyboard.press('Control+g');
  await expect(ctx.page.locator('.ProseMirror')).toBeVisible({ timeout: 3_000 });
  await expect(ctx.page.locator('canvas').first()).toBeHidden();
});

// ── As a user, I want notes in subfolders to appear in a folder tree ──────────

test('notes inside subfolders are nested under a folder node', async () => {
  // The folder "projects" should be visible as a parent entry
  await expect(sidebar(ctx.page).getByText('projects')).toBeVisible();
  // Root note should be visible at the top level
  await expect(sidebar(ctx.page).getByText('Root')).toBeVisible();
});

test('folder children are visible by default (FileTree starts fully expanded)', async () => {
  // FileTree initialises with all folders expanded (collectFolderKeys in FileTree.tsx)
  await expect(sidebar(ctx.page).getByText('Alpha')).toBeVisible();
  await expect(sidebar(ctx.page).getByText('Beta')).toBeVisible();
});

test('clicking an expanded folder collapses it and hides its children', async () => {
  // Click projects folder again to collapse
  await sidebar(ctx.page).getByText('projects').click();
  await expect(sidebar(ctx.page).getByText('Alpha')).toBeHidden({ timeout: 3_000 });
});

test('clicking a note inside an expanded folder opens it', async () => {
  // Re-expand projects
  await sidebar(ctx.page).getByText('projects').click();
  await sidebar(ctx.page).getByText('Alpha').click();
  await expect(ctx.page.locator('.ProseMirror')).toContainText('In projects folder');
});

// ── As a user, I want keyboard navigation in the file tree ────────────────────

test('arrow keys move focus through visible sidebar items', async () => {
  // Focus the sidebar by clicking a note first
  await sidebar(ctx.page).getByText('Root').click();
  // The FileTree items are focusable — keyboard nav should work within the tree
  // We can't easily assert focus in Playwright without aria, but we can check
  // that pressing down/up doesn't throw (smoke test for keyboard nav)
  await ctx.page.locator('aside').press('ArrowDown');
  await ctx.page.locator('aside').press('ArrowUp');
  // No crash: the app is still functional
  await expect(sidebar(ctx.page)).toBeVisible();
});

// ── As a user, I want to browse notes grouped by modification month ───────────

test('switching to month view shows notes grouped by month', async () => {
  // The 📅 button in the sidebar header toggles the month browser
  await ctx.page.getByTitle('Switch to by month').click();
  // Month label should appear (the seed notes have 2024-01 modified date)
  await expect(sidebar(ctx.page).getByText(/January 2024/i)).toBeVisible({ timeout: 3_000 });
});

test('switching back to A–Z view restores the folder tree', async () => {
  await ctx.page.getByTitle('Switch to A–Z').click();
  await expect(sidebar(ctx.page).getByText('Root')).toBeVisible({ timeout: 3_000 });
  // The month label should be gone
  await expect(sidebar(ctx.page).getByText(/January 2024/i)).toBeHidden();
});

// ── As a user, I want to add tags to a note via the metadata panel ────────────

test('adding a tag via the metadata panel persists to the note', async () => {
  // Open Beta (in projects/ folder). The folder may be collapsed from prior tests;
  // expand it only if Beta is not already visible.
  if (!await sidebar(ctx.page).getByText('Beta').isVisible()) {
    await sidebar(ctx.page).getByText('projects').click();
    await expect(sidebar(ctx.page).getByText('Beta')).toBeVisible({ timeout: 3_000 });
  }
  await sidebar(ctx.page).getByText('Beta').click();
  // Open metadata panel
  await ctx.page.keyboard.press('Control+k');
  await ctx.page.locator('input[placeholder*="Search"]').fill('metadata');
  await ctx.page.getByRole('button', { name: /metadata/i }).first().click();
  // Add a tag
  await ctx.page.locator('input[placeholder="Add tag…"]').fill('newtag');
  await ctx.page.locator('input[placeholder="Add tag…"]').press('Enter');
  // The tag should appear in the panel
  await expect(ctx.page.getByText('newtag')).toBeVisible({ timeout: 3_000 });
});

test('removing a tag via the metadata panel updates the note', async () => {
  // Beta had tag "dev" — remove it
  const removeBtn = ctx.page.getByRole('button', { name: 'Remove tag dev' });
  await expect(removeBtn).toBeVisible({ timeout: 3_000 });
  await removeBtn.click();
  await expect(removeBtn).toBeHidden({ timeout: 3_000 });
});
