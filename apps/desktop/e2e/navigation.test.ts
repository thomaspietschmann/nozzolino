/**
 * User stories: Wikilinks, autocomplete, hover peek, command palette, search, backlinks.
 */
import { test, expect } from '@playwright/test';
import { launch, cleanup, sidebar } from './helpers.js';
import type { TestCtx } from './helpers.js';

const fm = (id: string, tags: string[] = []) =>
  `---\nid: ${id}\ntags: [${tags.map((t) => `"${t}"`).join(', ')}]\ncreated: 2024-01-01T00:00:00.000Z\nmodified: 2024-01-01T00:00:00.000Z\n---\n`;

const VAULT = {
  'Alpha.md': fm('note-alpha', ['research', 'important']) + '# Alpha\n\nSee [[Beta]] for details.\n',
  'Beta.md': fm('note-beta', ['research']) + '# Beta\n\nBeta content with unique-marker-xyz.\n',
  'Gamma.md': fm('note-gamma') + '# Gamma\n\nUnrelated note.\n',
};

let ctx: TestCtx;

test.beforeAll(async () => {
  ctx = await launch(VAULT);
});
test.afterAll(() => cleanup(ctx));

// ── As a user, I want to navigate to a note by clicking a wikilink ────────────

// Resolved-wikilink click navigation: handleClickOn in wikilink.ts routes
// resolved links to onNavigate (→ store.selectNote); unresolved links create.
test('clicking a wikilink opens the linked note', async () => {
  await sidebar(ctx.page).getByText('Alpha').click();
  await expect(ctx.page.locator('.ProseMirror')).toContainText('See');
  await ctx.page.locator('span.wikilink[data-title="Beta"]').click();
  await expect(ctx.page.locator('h1.cursor-text', { hasText: 'Beta' })).toBeVisible({ timeout: 3_000 });
  await expect(ctx.page.locator('.ProseMirror')).toContainText('unique-marker-xyz');
});

// ── As a user, I want a peek preview when hovering over a wikilink ────────────

test('hovering a wikilink shows a preview popup', async () => {
  await sidebar(ctx.page).getByText('Alpha').click();
  const wikilinkSpan = ctx.page.locator('span.wikilink[data-title="Beta"]');
  await wikilinkSpan.hover();
  // WikilinkPeek renders in a fixed div with the target title as a heading
  await expect(ctx.page.locator('.fixed >> text=Beta').first()).toBeVisible({ timeout: 3_000 });
});

// ── As a user, I want autocomplete when I type [[ ─────────────────────────────

test('typing [[ in the editor shows autocomplete suggestions', async () => {
  await sidebar(ctx.page).getByText('Gamma').click();
  const editor = ctx.page.locator('.ProseMirror');
  await editor.click();
  await ctx.page.keyboard.press('End');
  await ctx.page.keyboard.type('\n[[Al');
  // The wikilink-dropdown should appear with Alpha as a suggestion
  await expect(ctx.page.locator('.wikilink-dropdown')).toBeVisible({ timeout: 3_000 });
  await expect(ctx.page.locator('.wikilink-dropdown')).toContainText('Alpha');
});

test('pressing Escape dismisses the autocomplete', async () => {
  // Continues from previous test state (dropdown is open)
  await ctx.page.keyboard.press('Escape');
  await expect(ctx.page.locator('.wikilink-dropdown')).toBeHidden({ timeout: 2_000 });
});

// ── As a user, I want to search for notes via the command palette ─────────────

test('Ctrl+K opens the command palette', async () => {
  // Close any open dropdown first
  await ctx.page.keyboard.press('Escape');
  await ctx.page.keyboard.press('Control+k');
  await expect(ctx.page.locator('input[placeholder*="Search"]')).toBeVisible({ timeout: 3_000 });
});

test('typing in the palette finds notes by body text', async () => {
  // Palette is open from previous test
  const input = ctx.page.locator('input[placeholder*="Search"]');
  await input.fill('unique-marker-xyz');
  // Beta contains the unique marker
  await expect(ctx.page.getByText('Beta').first()).toBeVisible({ timeout: 3_000 });
});

test('pressing Enter in the palette navigates to the selected note', async () => {
  const input = ctx.page.locator('input[placeholder*="Search"]');
  await input.fill('Beta');
  // Allow the 200ms debounce to flush so Beta appears as the top note result
  await ctx.page.waitForTimeout(300);
  // Press Enter on the input (not the page) to fire the palette keydown handler
  await input.press('Enter');
  await expect(ctx.page.locator('h1.cursor-text', { hasText: 'Beta' })).toBeVisible({ timeout: 3_000 });
});

test('Escape closes the command palette', async () => {
  await ctx.page.keyboard.press('Control+k');
  await expect(ctx.page.locator('input[placeholder*="Search"]')).toBeVisible({ timeout: 2_000 });
  await ctx.page.keyboard.press('Escape');
  await expect(ctx.page.locator('input[placeholder*="Search"]')).toBeHidden({ timeout: 2_000 });
});

// ── As a user, I want to filter notes by tag in the command palette ───────────

test('tag chips in the palette filter the note list', async () => {
  await ctx.page.keyboard.press('Control+k');
  // Click the "research" tag chip
  const tagChip = ctx.page.locator('button', { hasText: 'research' }).first();
  await expect(tagChip).toBeVisible({ timeout: 3_000 });
  await tagChip.click();
  // Both Alpha and Beta have the "research" tag; Gamma does not
  await expect(ctx.page.getByText('Alpha').first()).toBeVisible();
  await expect(ctx.page.getByText('Beta').first()).toBeVisible();
  await ctx.page.keyboard.press('Escape');
});

// ── As a user, I want to see which notes link to the active note ──────────────

test('metadata panel shows backlinks for the current note', async () => {
  // Reset: dismiss any open overlay from the previous test
  await ctx.page.keyboard.press('Escape');
  // Open Beta (which is linked from Alpha)
  await sidebar(ctx.page).getByText('Beta').click();
  // Wait for Beta to be loaded in the editor before toggling the panel
  await expect(ctx.page.locator('h1.cursor-text', { hasText: 'Beta' })).toBeVisible({ timeout: 3_000 });
  // Open command palette and use the exact action label
  await ctx.page.keyboard.press('Control+k');
  await expect(ctx.page.locator('input[placeholder*="Search"]')).toBeVisible({ timeout: 2_000 });
  await ctx.page.getByRole('button', { name: 'Toggle metadata panel' }).click();
  // FrontmatterPanel shows "Referenced by (1)" — Alpha contains [[Beta]]
  await expect(ctx.page.getByText(/Referenced by/)).toBeVisible({ timeout: 3_000 });
  // Use .last() since 'Alpha' also appears in the sidebar; backlink button is last in DOM order
  await expect(ctx.page.getByText('Alpha').last()).toBeVisible();
});
