import { join, relative, basename, dirname } from 'path';
import { promises as fs } from 'fs';
import type { BrowserWindow } from 'electron';
import { IPC } from '@notes-app/common';
import { buildVaultIndex, watchVault, atomicWrite } from '@notes-app/vault';
import type { VaultIndex, VaultWatcher } from '@notes-app/vault';

let currentVaultRoot: string | null = null;
let vaultIndex: VaultIndex | null = null;
let watcher: VaultWatcher | null = null;

export function getVaultRoot() {
  return currentVaultRoot;
}

export function getIndex() {
  return vaultIndex;
}

export async function openVault(vaultPath: string, win: BrowserWindow) {
  // Close previous watcher
  await watcher?.close();

  currentVaultRoot = vaultPath;
  vaultIndex = await buildVaultIndex(vaultPath);

  watcher = watchVault(vaultPath, async (event, absolutePath) => {
    if (!vaultIndex) return;
    const relativePath = relative(vaultPath, absolutePath);

    if (event === 'unlink') {
      vaultIndex.removeByPath(relativePath);
      win.webContents.send(IPC.VAULT_FILE_CHANGED, {
        event: 'unlink',
        relativePath,
      });
      return;
    }

    try {
      const record = await vaultIndex.addOrRefresh(absolutePath);
      win.webContents.send(IPC.VAULT_FILE_CHANGED, {
        event,
        relativePath,
        record,
      });
    } catch {
      // File may have been deleted immediately after event
    }
  });

  return vaultIndex.getAllNotes();
}

export async function readFile(relativePath: string): Promise<string> {
  if (!currentVaultRoot) throw new Error('No vault open');
  return fs.readFile(join(currentVaultRoot, relativePath), 'utf-8');
}

export async function writeFile(relativePath: string, content: string): Promise<void> {
  if (!currentVaultRoot) throw new Error('No vault open');
  const absPath = join(currentVaultRoot, relativePath);
  await atomicWrite(absPath, content);
  if (vaultIndex) {
    await vaultIndex.addOrRefresh(absPath);
  }
}

export async function createFile(title: string) {
  if (!currentVaultRoot || !vaultIndex) throw new Error('No vault open');
  const fileName = `${title.replace(/[/\\:*?"<>|]/g, '-')}.md`;
  const absPath = join(currentVaultRoot, fileName);
  const content = `# ${title}\n\n`;
  await atomicWrite(absPath, content);
  return vaultIndex.addOrRefresh(absPath);
}

export async function renameFile(relativePath: string, newTitle: string) {
  if (!currentVaultRoot || !vaultIndex) throw new Error('No vault open');
  const oldAbs = join(currentVaultRoot, relativePath);
  const newFileName = `${newTitle.replace(/[/\\:*?"<>|]/g, '-')}.md`;
  const newAbs = join(dirname(oldAbs), newFileName);

  await fs.rename(oldAbs, newAbs);
  vaultIndex.removeByPath(relativePath);
  return vaultIndex.addOrRefresh(newAbs);
}

export async function deleteFile(relativePath: string): Promise<void> {
  if (!currentVaultRoot || !vaultIndex) throw new Error('No vault open');
  const absPath = join(currentVaultRoot, relativePath);
  await fs.unlink(absPath);
  vaultIndex.removeByPath(relativePath);
}

export async function saveImage(
  base64: string,
  ext: string,
  activeRelativePath: string
): Promise<string> {
  if (!currentVaultRoot) throw new Error('No vault open');

  // Sibling folder convention (ADR-0005): <note-stem>/<uuid>.<ext>
  const noteStem = basename(activeRelativePath, '.md');
  const noteDir = dirname(join(currentVaultRoot, activeRelativePath));
  const siblingDir = join(noteDir, noteStem);

  await fs.mkdir(siblingDir, { recursive: true });
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const absPath = join(siblingDir, fileName);
  await fs.writeFile(absPath, Buffer.from(base64, 'base64'));

  // Return path relative to vault root for use in Markdown
  return relative(currentVaultRoot, absPath);
}

export async function closeVault() {
  await watcher?.close();
  watcher = null;
  vaultIndex = null;
  currentVaultRoot = null;
}
