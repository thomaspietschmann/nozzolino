import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { mkdtemp, writeFile, mkdir, rm, utimes } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

/** Extract the ISO date string from a frontmatter `modified:` field, if present. */
function frontmatterModified(content: string): Date | null {
  const m = /^modified:\s*(\S+)/m.exec(content);
  if (!m) return null;
  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? null : d;
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN = resolve(__dirname, '../dist/main/index.js');

export interface TestCtx {
  app: ElectronApplication;
  page: Page;
  vaultDir: string;
  userDataDir: string;
}

export interface LaunchOptions {
  /** Extra environment variables passed to the Electron process (e.g. E2E_IMPORT_ZIP). */
  env?: Record<string, string>;
}

/**
 * Launches the Electron app with a fresh temp vault pre-populated with the
 * given files (vault-relative paths → content). Waits for the sidebar to load.
 * Persisted config is isolated to a per-launch temp userData dir.
 */
export async function launch(
  files: Record<string, string>,
  opts: LaunchOptions = {},
): Promise<TestCtx> {
  const vaultDir = await mkdtemp(join(tmpdir(), 'notes-e2e-'));
  const userDataDir = await mkdtemp(join(tmpdir(), 'notes-e2e-ud-'));

  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(vaultDir, relPath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content);
    // Sync file mtime with frontmatter `modified` so NoteParser reflects the
    // intended date (NoteParser uses stat().mtime, not the frontmatter field).
    const modified = frontmatterModified(content);
    if (modified) await utimes(abs, modified, modified);
  }

  const app = await electron.launch({
    args: [MAIN],
    env: {
      ...process.env,
      E2E_VAULT_PATH: vaultDir,
      E2E_USER_DATA: userDataDir,
      ...opts.env,
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  // Wait until at least one note is visible in the sidebar
  const firstTitle = Object.keys(files)
    .find((p) => !p.includes('/') && p.endsWith('.md'))
    ?.replace(/\.md$/, '');
  if (firstTitle) {
    await page.waitForSelector(`aside >> text=${firstTitle}`, { timeout: 10_000 });
  }

  return { app, page, vaultDir, userDataDir };
}

export async function cleanup({ app, vaultDir, userDataDir }: TestCtx): Promise<void> {
  try {
    await app.close();
  } catch {
    // App may already be closed (e.g. a relaunch test) — ignore.
  }
  await rm(vaultDir, { recursive: true, force: true });
  await rm(userDataDir, { recursive: true, force: true });
}

/** Sidebar locator — scope all note-list assertions to it. */
export const sidebar = (page: Page) => page.locator('aside');
