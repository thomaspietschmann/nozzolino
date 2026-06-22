import { relative, basename } from 'path';
import { createHash } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import { dialog } from 'electron';
import { IPC } from '@notes-app/common';
import type { NoteRecord, ConflictRecord } from '@notes-app/common';
import {
  buildVaultIndex,
  watchVault,
  NodeVaultFS,
  scanExistingConflicts,
  writeNote,
  createNote,
  renameNote,
  updateFrontmatter as updateFrontmatterOp,
  deleteNote,
  saveImage as saveImageOp,
  resolveConflict as resolveConflictOp,
  createConflictFromExternal as createConflictFromExternalOp,
  propagateRename,
} from '@notes-app/vault';
import type { VaultIndex, VaultWatcher, VaultOpsContext } from '@notes-app/vault';
import { isConflictFile, primaryPathForConflict } from '@notes-app/sync';
import archiver from 'archiver';

let currentVaultRoot: string | null = null;
let vaultFS: NodeVaultFS | null = null;
let vaultIndex: VaultIndex | null = null;
let watcher: VaultWatcher | null = null;

// Pending unlinks: id → { title, relativePath, timer } — used to correlate rename pairs
const pendingUnlinks = new Map<string, { title: string; relativePath: string; timer: ReturnType<typeof setTimeout> }>();
const RENAME_WINDOW_MS = 2000;

// Self-write attribution: tracks SHA-1 hashes of content the app last wrote per path.
// The watcher compares incoming file content against this to suppress self-write echoes.
const selfWriteHashes = new Map<string, string>();

function sha1(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

function getCtx(): VaultOpsContext {
  if (!vaultFS || !vaultIndex) throw new Error('No vault open');
  return {
    vaultFS,
    index: vaultIndex,
    generateId: () => crypto.randomUUID(),
    onDidWrite: (relativePath, content) => selfWriteHashes.set(relativePath, sha1(content)),
  };
}

export function getVaultRoot() {
  return currentVaultRoot;
}

export function getIndex() {
  return vaultIndex;
}

export async function openVault(vaultPath: string, win: BrowserWindow) {
  await watcher?.close();

  currentVaultRoot = vaultPath;
  vaultFS = new NodeVaultFS(vaultPath);
  vaultIndex = await buildVaultIndex(vaultFS);

  watcher = watchVault(vaultPath, async (event, absolutePath) => {
    if (!vaultIndex || !vaultFS) return;
    const relativePath = relative(vaultPath, absolutePath);
    const name = basename(absolutePath);

    if (event === 'unlink') {
      if (isConflictFile(name)) {
        win.webContents.send(IPC.VAULT_CONFLICT_REMOVED, relativePath);
        return;
      }

      const existingRecord = vaultIndex.getNoteByPath(relativePath);
      if (existingRecord) {
        const id = existingRecord.id;
        const timer = setTimeout(() => {
          pendingUnlinks.delete(id);
          vaultIndex?.removeByPath(relativePath);
          win.webContents.send(IPC.VAULT_FILE_CHANGED, { event: 'unlink', relativePath });
        }, RENAME_WINDOW_MS);
        pendingUnlinks.set(id, { title: existingRecord.title, relativePath, timer });
      } else {
        vaultIndex.removeByPath(relativePath);
        win.webContents.send(IPC.VAULT_FILE_CHANGED, { event: 'unlink', relativePath });
      }
      return;
    }

    if (isConflictFile(name)) {
      const primaryRelPath = primaryPathForConflict(relativePath) ?? relativePath;
      const note = vaultIndex.getNoteByPath(primaryRelPath);
      win.webContents.send(IPC.VAULT_CONFLICT_DETECTED, {
        noteId: note?.id ?? '',
        notePath: primaryRelPath,
        conflictFilePath: relativePath,
        detectedAt: new Date(),
      } satisfies ConflictRecord);
      return;
    }

    try {
      const record = await vaultIndex.addOrRefresh(vaultFS, relativePath);
      const pending = pendingUnlinks.get(record.id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingUnlinks.delete(record.id);
        vaultIndex.removeByPath(pending.relativePath);
        const propagated = await propagateRename(getCtx(), pending.title, record.title);
        win.webContents.send(IPC.VAULT_FILE_CHANGED, { event: 'unlink', relativePath: pending.relativePath });
        win.webContents.send(IPC.VAULT_FILE_CHANGED, { event: 'add', relativePath, record });
        for (const updated of propagated) {
          win.webContents.send(IPC.VAULT_FILE_CHANGED, { event: 'change', relativePath: updated.path, record: updated });
        }
      } else {
        // Determine whether this event echoes the app's own last write.
        // If the on-disk content matches what we last wrote, this is a self-write echo
        // and should not trigger a conflict or a silent-reload in the renderer.
        let selfWrite = false;
        const knownHash = selfWriteHashes.get(relativePath);
        if (knownHash !== undefined && vaultFS) {
          try {
            const onDisk = await vaultFS.readFile(relativePath);
            selfWrite = sha1(onDisk) === knownHash;
          } catch {
            // If the file is transiently unreadable, treat as external.
          }
        }
        win.webContents.send(IPC.VAULT_FILE_CHANGED, { event, relativePath, record, selfWrite });
      }
    } catch {
      // File may have been deleted immediately after event
    }
  });

  // Surface any conflict files that already existed when the vault was opened
  const conflicts = await scanExistingConflicts(getCtx());
  for (const { record } of conflicts) {
    win.webContents.send(IPC.VAULT_CONFLICT_DETECTED, record);
  }

  return vaultIndex.getAllNotes();
}

export async function readFile(relativePath: string): Promise<string> {
  if (!vaultFS) throw new Error('No vault open');
  return vaultFS.readFile(relativePath);
}

export async function writeFile(relativePath: string, body: string): Promise<void> {
  await writeNote(getCtx(), relativePath, body);
}

export async function createFile(title: string): Promise<NoteRecord> {
  return createNote(getCtx(), title);
}

export async function renameFile(
  relativePath: string,
  newTitle: string,
): Promise<{ renamed: NoteRecord; propagated: NoteRecord[] }> {
  return renameNote(getCtx(), relativePath, newTitle);
}

export async function updateFrontmatter(
  relativePath: string,
  patch: Partial<{ tags: string[]; emoji: string | null }>,
): Promise<NoteRecord> {
  return updateFrontmatterOp(getCtx(), relativePath, patch);
}

export async function deleteFile(relativePath: string): Promise<void> {
  return deleteNote(getCtx(), relativePath);
}

export async function saveImage(
  base64: string,
  ext: string,
  activeRelativePath: string,
): Promise<string> {
  return saveImageOp(getCtx(), base64, ext, activeRelativePath);
}

export async function closeVault(): Promise<void> {
  for (const { timer } of pendingUnlinks.values()) clearTimeout(timer);
  pendingUnlinks.clear();
  selfWriteHashes.clear();
  await watcher?.close();
  watcher = null;
  vaultIndex = null;
  vaultFS = null;
  currentVaultRoot = null;
}

export async function resolveConflict(
  notePath: string,
  conflictFilePath: string,
  mergedContent: string,
): Promise<NoteRecord> {
  return resolveConflictOp(getCtx(), notePath, conflictFilePath, mergedContent);
}

export async function createConflictFromExternal(
  notePath: string,
  timestamp: string,
): Promise<ConflictRecord> {
  return createConflictFromExternalOp(getCtx(), notePath, timestamp);
}

/**
 * Opens a save dialog and exports the entire vault as a ZIP file.
 * Returns the saved path or null if the user cancelled.
 */
export async function exportZip(win: BrowserWindow): Promise<string | null> {
  if (!currentVaultRoot) throw new Error('No vault open');

  const result = await dialog.showSaveDialog(win, {
    title: 'Export vault to ZIP',
    defaultPath: 'vault.zip',
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  });
  if (result.canceled || !result.filePath) return null;

  const outputPath = result.filePath;
  await new Promise<void>((resolve, reject) => {
    const output = require('fs').createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    archive.glob('**/*', {
      cwd: currentVaultRoot!,
      ignore: ['.*', '**/*.tmp'],
      dot: false,
    });

    void archive.finalize();
  });

  return outputPath;
}
