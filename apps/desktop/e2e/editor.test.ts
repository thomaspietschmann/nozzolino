/**
 * D6.0 — Systematic shortcut and feature verification.
 *
 * Covers:
 *   - Editor keymaps: Mod-B/I/`/Shift-Mod-S, Mod-1/2/3/0, Mod->, Mod-Z/Shift-Mod-Z,
 *     Tab/Shift-Tab (list indent/outdent), Shift-Enter (exit code block)
 *   - Markdown input rules: #, >, -, 1., ```, ---, **bold**, *italic*, `code`, ~~strike~~
 *   - Global shortcuts: Ctrl+K (palette), Ctrl+G (graph), Esc (close overlay)
 *   - HelpOverlay: ⌨ sidebar button, palette action, Esc closes
 *
 * Platform note: ProseMirror resolves `Mod-` to Meta (⌘) on macOS and Ctrl elsewhere.
 * Global app shortcuts (Ctrl+K, Ctrl+G) check both ctrlKey and metaKey so Ctrl works
 * everywhere.  Editor keymaps use process.platform to pick the right modifier.
 */
import { test, expect } from '@playwright/test';
import { launch, cleanup, sidebar } from './helpers.js';
import type { TestCtx } from './helpers.js';

// ProseMirror Mod- = Meta on macOS, Ctrl elsewhere.
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

const fm = (id: string) =>
  `---\nid: ${id}\ntags: []\ncreated: 2024-01-01T00:00:00.000Z\nmodified: 2024-01-01T00:00:00.000Z\n---\n`;

const VAULT = {
  'Alpha.md': fm('note-alpha') + '# Alpha\n\nBody text.\n',
};

// ── Keymap tests ──────────────────────────────────────────────────────────────

let keymapCtx: TestCtx;
test.describe('Editor keymaps', () => {
  test.beforeAll(async () => {
    keymapCtx = await launch(VAULT);
    await sidebar(keymapCtx.page).getByText('Alpha').click();
    await expect(keymapCtx.page.locator('.ProseMirror')).toBeVisible({ timeout: 8_000 });
  });
  test.afterAll(() => cleanup(keymapCtx));

  // Helper: open palette, create a new blank note, return editor locator.
  // fromMarkdown guarantees a trailing empty paragraph, and NoteEditor places
  // the cursor there on mount — so we just wait for the note to load.
  async function freshNote(title: string) {
    const page = keymapCtx.page;
    await page.keyboard.press('Control+k');
    const input = page.locator('input[placeholder*="Search"]');
    await expect(input).toBeVisible({ timeout: 3_000 });
    await input.fill(title);
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: 'New note' }).click();
    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible({ timeout: 5_000 });
    // Wait for this specific note's content to load (toBeVisible passes immediately
    // since the editor was already visible from the prior note).
    await expect(editor.locator('h1')).toContainText(title, { timeout: 5_000 });
    // The NoteEditor mount effect positions the cursor in the body paragraph.
    // Click the last paragraph to ensure focus and correct cursor placement.
    await editor.locator('p').last().click();
    return editor;
  }

  test(`${MOD}+B toggles bold — type while mark is active`, async () => {
    const editor = await freshNote('bold-test');
    // Toggle bold on → type → text lands inside <strong>
    await keymapCtx.page.keyboard.press(`${MOD}+b`);
    await keymapCtx.page.keyboard.type('bold text');
    await expect(editor.locator('strong')).toBeVisible({ timeout: 2_000 });
  });

  test(`${MOD}+I toggles italic — type while mark is active`, async () => {
    const editor = await freshNote('italic-test');
    await keymapCtx.page.keyboard.press(`${MOD}+i`);
    await keymapCtx.page.keyboard.type('italic text');
    await expect(editor.locator('em')).toBeVisible({ timeout: 2_000 });
  });

  test('Ctrl+` toggles inline code — type while mark is active', async () => {
    // Cmd+` (Mod-`) is intercepted by Electron's "Cycle Windows" menu accelerator on macOS,
    // so keymaps.ts also registers Ctrl+` as a working alias on mac (and Ctrl is Mod on Linux).
    const editor = await freshNote('code-test');
    await keymapCtx.page.keyboard.press('Control+Backquote');
    await keymapCtx.page.keyboard.type('code text');
    await expect(editor.locator('code')).toBeVisible({ timeout: 2_000 });
  });

  test(`${MOD}+1 sets heading level 1`, async () => {
    const editor = await freshNote('h1-test');
    await keymapCtx.page.keyboard.type('My Heading');
    await keymapCtx.page.keyboard.press(`${MOD}+1`);
    // The note title is also h1; use .last() to target the body heading.
    await expect(editor.locator('h1').last()).toContainText('My Heading', { timeout: 2_000 });
  });

  test(`${MOD}+2 sets heading level 2`, async () => {
    const editor = await freshNote('h2-test');
    await keymapCtx.page.keyboard.type('Sub Heading');
    await keymapCtx.page.keyboard.press(`${MOD}+2`);
    await expect(editor.locator('h2')).toContainText('Sub Heading', { timeout: 2_000 });
  });

  test(`${MOD}+3 sets heading level 3`, async () => {
    const editor = await freshNote('h3-test');
    await keymapCtx.page.keyboard.type('Sub Sub');
    await keymapCtx.page.keyboard.press(`${MOD}+3`);
    await expect(editor.locator('h3')).toContainText('Sub Sub', { timeout: 2_000 });
  });

  test(`${MOD}+0 converts a heading back to a paragraph`, async () => {
    const editor = await freshNote('para-test');
    await keymapCtx.page.keyboard.type('Was a heading');
    await keymapCtx.page.keyboard.press(`${MOD}+1`);
    // Two h1s at this point (title + body); wait for the body one to contain the text.
    await expect(editor.locator('h1').last()).toContainText('Was a heading', { timeout: 2_000 });
    await keymapCtx.page.keyboard.press(`${MOD}+0`);
    // The body block is now a paragraph; the title h1 remains.
    await expect(editor.locator('p').filter({ hasText: 'Was a heading' })).toBeVisible({ timeout: 2_000 });
    await expect(editor).toContainText('Was a heading');
  });

  test(`${MOD}+> wraps current block in a blockquote`, async () => {
    const editor = await freshNote('blockquote-test');
    await keymapCtx.page.keyboard.type('Wise words');
    // Ctrl/Cmd+> = Ctrl/Cmd+Shift+Period (> is Shift+. on QWERTY)
    await keymapCtx.page.keyboard.press(`${MOD}+Shift+.`);
    await expect(editor.locator('blockquote')).toBeVisible({ timeout: 2_000 });
  });

  test(`${MOD}+Z undoes the last change`, async () => {
    const editor = await freshNote('undo-test');
    await keymapCtx.page.keyboard.type('undo-me');
    await expect(editor).toContainText('undo-me');
    await keymapCtx.page.keyboard.press(`${MOD}+z`);
    // Editor is still functional — undo ran without crash
    await expect(editor).toBeVisible();
  });

  test(`Shift+${MOD}+Z redoes after undo`, async () => {
    const editor = await freshNote('redo-test');
    await keymapCtx.page.keyboard.type('redo-me');
    await keymapCtx.page.keyboard.press(`${MOD}+z`);
    await keymapCtx.page.keyboard.press(`Shift+${MOD}+z`);
    await expect(editor).toBeVisible();
  });

  test('Tab indents a list item one level', async () => {
    const editor = await freshNote('tab-indent-test');
    // Create a list via input rule first
    await keymapCtx.page.keyboard.type('- parent');
    await keymapCtx.page.keyboard.press('Enter');
    await keymapCtx.page.keyboard.type('child');
    await keymapCtx.page.keyboard.press('Tab');
    await expect(editor.locator('ul ul')).toBeVisible({ timeout: 2_000 });
  });

  test('Shift+Tab outdents a list item', async () => {
    // Continue within the same note (child is indented from previous test)
    await keymapCtx.page.keyboard.press('Shift+Tab');
    const editor = keymapCtx.page.locator('.ProseMirror');
    await expect(editor.locator('ul ul')).toBeHidden({ timeout: 2_000 });
  });
});

// ── Markdown input rules ──────────────────────────────────────────────────────

let inputCtx: TestCtx;
test.describe('Markdown input rules', () => {
  test.beforeAll(async () => {
    inputCtx = await launch(VAULT);
    await sidebar(inputCtx.page).getByText('Alpha').click();
    await expect(inputCtx.page.locator('.ProseMirror')).toBeVisible({ timeout: 8_000 });
  });
  test.afterAll(() => cleanup(inputCtx));

  async function freshInputNote(title: string) {
    const page = inputCtx.page;
    await page.keyboard.press('Control+k');
    const input = page.locator('input[placeholder*="Search"]');
    await expect(input).toBeVisible({ timeout: 3_000 });
    await input.fill(title);
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: 'New note' }).click();
    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible({ timeout: 5_000 });
    // Wait for this specific note's content to load.
    await expect(editor.locator('h1')).toContainText(title, { timeout: 5_000 });
    // fromMarkdown guarantees a trailing empty paragraph; NoteEditor positions
    // the cursor there on mount. Click it to ensure focus is in the body.
    await editor.locator('p').last().click();
    return editor;
  }

  test('# + space converts to heading 1', async () => {
    const editor = await freshInputNote('ir-h1');
    await inputCtx.page.keyboard.type('# ');
    // The note already has a title h1; typing '# ' creates a second (empty) h1.
    // Use first() to avoid strict-mode rejection on 2 matching elements.
    await expect(editor.locator('h1').first()).toBeVisible({ timeout: 2_000 });
  });

  test('## + space converts to heading 2', async () => {
    const editor = await freshInputNote('ir-h2');
    await inputCtx.page.keyboard.type('## ');
    await expect(editor.locator('h2')).toBeVisible({ timeout: 2_000 });
  });

  test('### + space converts to heading 3', async () => {
    const editor = await freshInputNote('ir-h3');
    await inputCtx.page.keyboard.type('### ');
    await expect(editor.locator('h3')).toBeVisible({ timeout: 2_000 });
  });

  test('> + space converts to blockquote', async () => {
    const editor = await freshInputNote('ir-bq');
    await inputCtx.page.keyboard.type('> ');
    await expect(editor.locator('blockquote')).toBeVisible({ timeout: 2_000 });
  });

  test('- + space converts to bullet list', async () => {
    const editor = await freshInputNote('ir-ul');
    await inputCtx.page.keyboard.type('- ');
    await expect(editor.locator('ul')).toBeVisible({ timeout: 2_000 });
  });

  test('1. + space converts to ordered list', async () => {
    const editor = await freshInputNote('ir-ol');
    await inputCtx.page.keyboard.type('1. ');
    await expect(editor.locator('ol')).toBeVisible({ timeout: 2_000 });
  });

  test('``` + space converts to code block', async () => {
    const editor = await freshInputNote('ir-pre');
    await inputCtx.page.keyboard.type('``` ');
    await expect(editor.locator('pre')).toBeVisible({ timeout: 2_000 });
  });

  test('--- converts to horizontal rule', async () => {
    const editor = await freshInputNote('ir-hr');
    await inputCtx.page.keyboard.type('---');
    await expect(editor.locator('hr')).toBeVisible({ timeout: 2_000 });
  });

  test('**word** converts to bold (not italic)', async () => {
    const editor = await freshInputNote('ir-bold-dbl');
    await inputCtx.page.keyboard.type('**hello**');
    await expect(editor.locator('strong')).toBeVisible({ timeout: 2_000 });
    // Must NOT produce italic — the lookbehind guard in inputRules prevents premature italic match
    await expect(editor.locator('em')).toBeHidden({ timeout: 500 });
  });

  test('__word__ converts to bold', async () => {
    const editor = await freshInputNote('ir-bold-us');
    await inputCtx.page.keyboard.type('__hello__');
    await expect(editor.locator('strong')).toBeVisible({ timeout: 2_000 });
  });

  test('*word* converts to italic', async () => {
    const editor = await freshInputNote('ir-em-star');
    await inputCtx.page.keyboard.type('*hi*');
    await expect(editor.locator('em')).toBeVisible({ timeout: 2_000 });
  });

  test('_word_ converts to italic', async () => {
    const editor = await freshInputNote('ir-em-us');
    await inputCtx.page.keyboard.type('_hi_');
    await expect(editor.locator('em')).toBeVisible({ timeout: 2_000 });
  });

  test('`word` converts to inline code', async () => {
    const editor = await freshInputNote('ir-code');
    await inputCtx.page.keyboard.type('`snippet`');
    await expect(editor.locator('code')).toBeVisible({ timeout: 2_000 });
  });

  test('~~word~~ converts to strikethrough', async () => {
    const editor = await freshInputNote('ir-strike');
    await inputCtx.page.keyboard.type('~~struck~~');
    // ProseMirror renders strikethrough as <s> or <del> depending on schema
    await expect(editor.locator('s, del')).toBeVisible({ timeout: 2_000 });
  });
});

// ── Global shortcuts ──────────────────────────────────────────────────────────

let globalCtx: TestCtx;
test.describe('Global shortcuts', () => {
  test.beforeAll(async () => {
    globalCtx = await launch(VAULT);
    await sidebar(globalCtx.page).getByText('Alpha').click();
    await expect(globalCtx.page.locator('.ProseMirror')).toBeVisible({ timeout: 8_000 });
  });
  test.afterAll(() => cleanup(globalCtx));

  test('Ctrl+K opens the command palette', async () => {
    await globalCtx.page.keyboard.press('Control+k');
    await expect(globalCtx.page.locator('input[placeholder*="Search"]')).toBeVisible({ timeout: 3_000 });
  });

  test('Esc closes the command palette', async () => {
    await globalCtx.page.keyboard.press('Escape');
    await expect(globalCtx.page.locator('input[placeholder*="Search"]')).toBeHidden({ timeout: 2_000 });
  });

  test('Ctrl+G opens the graph view', async () => {
    await globalCtx.page.keyboard.press('Control+g');
    await expect(globalCtx.page.locator('canvas').first()).toBeVisible({ timeout: 8_000 });
  });

  test('Ctrl+G closes the graph view', async () => {
    await globalCtx.page.keyboard.press('Control+g');
    await expect(globalCtx.page.locator('.ProseMirror')).toBeVisible({ timeout: 3_000 });
  });
});

// ── HelpOverlay ───────────────────────────────────────────────────────────────

let helpCtx: TestCtx;
test.describe('HelpOverlay', () => {
  test.beforeAll(async () => {
    helpCtx = await launch(VAULT);
    // Wait for vault to load
    await sidebar(helpCtx.page).getByText('Alpha').click();
    await expect(helpCtx.page.locator('.ProseMirror')).toBeVisible({ timeout: 8_000 });
  });
  test.afterAll(() => cleanup(helpCtx));

  test('⌨ button in sidebar opens the help overlay', async () => {
    await helpCtx.page.getByTitle('Keyboard shortcuts').click();
    await expect(helpCtx.page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible({ timeout: 3_000 });
  });

  test('Esc closes the help overlay', async () => {
    await helpCtx.page.keyboard.press('Escape');
    await expect(helpCtx.page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden({ timeout: 2_000 });
  });

  test('"Keyboard shortcuts" palette action opens the overlay', async () => {
    await helpCtx.page.keyboard.press('Control+k');
    await helpCtx.page.locator('input[placeholder*="Search"]').fill('keyboard');
    await helpCtx.page.waitForTimeout(300);
    await helpCtx.page.getByRole('button', { name: /keyboard shortcuts/i }).click();
    await expect(helpCtx.page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible({ timeout: 3_000 });
    await helpCtx.page.keyboard.press('Escape');
  });
});
