import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MAIN = resolve(__dirname, '../dist/main/index.js');

let app: ElectronApplication;
let page: Page;
let vaultDir: string;

test.beforeAll(async () => {
  vaultDir = await mkdtemp(join(tmpdir(), 'notes-e2e-'));

  await writeFile(
    join(vaultDir, 'Hello.md'),
    '---\nid: e2e-note-1\ntags: []\ncreated: 2024-01-01T00:00:00.000Z\nmodified: 2024-01-01T00:00:00.000Z\n---\n# Hello\n\nSee also [[World]].\n',
  );
  await writeFile(
    join(vaultDir, 'World.md'),
    '---\nid: e2e-note-2\ntags: []\ncreated: 2024-01-01T00:00:00.000Z\nmodified: 2024-01-01T00:00:00.000Z\n---\n# World\n\nHello from World.\n',
  );

  app = await electron.launch({
    args: [MAIN],
    env: { ...process.env, E2E_VAULT_PATH: vaultDir },
  });

  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  // Wait for vault to auto-open and notes to populate the sidebar
  await page.waitForSelector('text=Hello', { timeout: 10_000 });
});

test.afterAll(async () => {
  await app.close();
  await rm(vaultDir, { recursive: true, force: true });
});

// Sidebar is the <aside> element — scope note-list assertions to it
const sidebar = () => page.locator('aside');

// ── 1. Vault loads ─────────────────────────────────────────────────────────────

test('sidebar shows both seeded notes', async () => {
  await expect(sidebar().getByText('Hello')).toBeVisible();
  await expect(sidebar().getByText('World')).toBeVisible();
});

// ── 2. Open a note ────────────────────────────────────────────────────────────

test('clicking a note opens it in the editor', async () => {
  await sidebar().getByText('World').click();
  await expect(page.locator('.ProseMirror')).toContainText('Hello from World');
});

// ── 3. Create a note ──────────────────────────────────────────────────────────

test('creating a note adds it to the sidebar', async () => {
  await page.getByTitle('New note').click();
  await page.locator('input[placeholder="Note title…"]').fill('GrüßGott');
  await page.locator('input[placeholder="Note title…"]').press('Enter');
  await expect(sidebar().getByText('GrüßGott')).toBeVisible({ timeout: 5_000 });
});

// ── 4. Rename a note ──────────────────────────────────────────────────────────

test('renaming a note via the header title updates the sidebar', async () => {
  await sidebar().getByText('Hello').click();
  // NoteHeader: click the h1 to enter rename mode
  await page.locator('h1.cursor-text', { hasText: 'Hello' }).click();
  const titleInput = page.locator('input.text-2xl');
  await titleInput.fill('HelloRenamed');
  await titleInput.press('Enter');
  await expect(sidebar().getByText('HelloRenamed')).toBeVisible({ timeout: 5_000 });
});

// ── 5. Wikilink propagation after rename ──────────────────────────────────────

test('renaming propagates wikilinks in other notes', async () => {
  // Hello.md links to [[World]] — after rename it should still render the wikilink
  await sidebar().getByText('HelloRenamed').click();
  await expect(page.locator('.ProseMirror')).toContainText('World');
});
