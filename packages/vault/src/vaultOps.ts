import {
  parseFrontmatter,
  serializeFrontmatter,
  replaceWikiLinkTarget,
  posixJoin,
  posixBasename,
  posixDirname,
} from '@notes-app/common';
import type { Frontmatter, NoteRecord, ConflictRecord } from '@notes-app/common';
import { isConflictFile, primaryPathForConflict, makeConflictFilename } from '@notes-app/sync';
import type { VaultFS } from './VaultFS.js';
import type { VaultIndex } from './VaultIndex.js';
import { atomicWrite } from './atomicWrite.js';
import { mergeForSave } from './saveNote.js';

export interface VaultOpsContext {
  vaultFS: VaultFS;
  index: VaultIndex;
  generateId: () => string;
}

export async function writeNote(
  ctx: VaultOpsContext,
  relativePath: string,
  body: string,
): Promise<void> {
  const { vaultFS, index, generateId } = ctx;
  let rawExisting: string | null = null;
  try {
    rawExisting = await vaultFS.readFile(relativePath);
  } catch {
    // New file — mergeForSave handles null gracefully.
  }
  const inMemoryId = index.getNoteByPath(relativePath)?.id ?? generateId();
  const merged = mergeForSave(rawExisting, body, { id: inMemoryId });
  await atomicWrite(vaultFS, relativePath, merged);
  await index.addOrRefresh(vaultFS, relativePath);
}

export async function createNote(ctx: VaultOpsContext, title: string): Promise<NoteRecord> {
  const { vaultFS, index, generateId } = ctx;
  const fileName = `${title.replace(/[/\\:*?"<>|]/g, '-')}.md`;
  const now = new Date().toISOString();
  const fm: Frontmatter = { id: generateId(), tags: [], created: now, modified: now };
  const content = serializeFrontmatter(fm, `# ${title}\n\n`);
  await atomicWrite(vaultFS, fileName, content);
  return index.addOrRefresh(vaultFS, fileName);
}

export async function renameNote(
  ctx: VaultOpsContext,
  relativePath: string,
  newTitle: string,
): Promise<{ renamed: NoteRecord; propagated: NoteRecord[] }> {
  const { vaultFS, index } = ctx;
  const oldTitle = posixBasename(relativePath, '.md');
  const dir = posixDirname(relativePath);
  const newFileName = `${newTitle.replace(/[/\\:*?"<>|]/g, '-')}.md`;
  const newRelPath = dir === '.' ? newFileName : posixJoin(dir, newFileName);
  await vaultFS.renameFile(relativePath, newRelPath);
  index.removeByPath(relativePath);
  const renamed = await index.addOrRefresh(vaultFS, newRelPath);
  const propagated = await propagateRename(ctx, oldTitle, newTitle);
  return { renamed, propagated };
}

export async function propagateRename(
  ctx: VaultOpsContext,
  oldTitle: string,
  newTitle: string,
): Promise<NoteRecord[]> {
  const { vaultFS, index } = ctx;
  const notesWithLink = index
    .getAllNotes()
    .filter((n) => n.outlinks.some((l) => l.targetTitle.toLowerCase() === oldTitle.toLowerCase()));

  const updated = await Promise.all(
    notesWithLink.map(async (note) => {
      try {
        const content = await vaultFS.readFile(note.path);
        const replaced = replaceWikiLinkTarget(content, oldTitle, newTitle);
        if (replaced !== content) {
          await atomicWrite(vaultFS, note.path, replaced);
          return index.addOrRefresh(vaultFS, note.path);
        }
      } catch {
        // File may have been deleted concurrently — skip
      }
      return null;
    })
  );

  return updated.filter((r): r is NoteRecord => r !== null);
}

export async function updateFrontmatter(
  ctx: VaultOpsContext,
  relativePath: string,
  patch: Partial<{ tags: string[]; emoji: string | null }>,
): Promise<NoteRecord> {
  const { vaultFS, index } = ctx;
  const raw = await vaultFS.readFile(relativePath);
  const { frontmatter, body } = parseFrontmatter(raw);

  const merged = { ...frontmatter };
  if (patch.tags !== undefined) merged.tags = [...new Set(patch.tags)];
  if (patch.emoji !== undefined) merged.emoji = patch.emoji ?? undefined;
  merged.modified = new Date().toISOString();

  await atomicWrite(vaultFS, relativePath, serializeFrontmatter(merged, body));
  return index.addOrRefresh(vaultFS, relativePath);
}

export async function deleteNote(ctx: VaultOpsContext, relativePath: string): Promise<void> {
  const { vaultFS, index } = ctx;
  await vaultFS.deleteFile(relativePath);
  index.removeByPath(relativePath);
}

export async function saveImage(
  ctx: VaultOpsContext,
  base64: string,
  ext: string,
  activeRelativePath: string,
): Promise<string> {
  const { vaultFS, generateId } = ctx;
  const noteStem = posixBasename(activeRelativePath, '.md');
  const noteDir = posixDirname(activeRelativePath);
  const siblingDir = noteDir === '.' ? noteStem : posixJoin(noteDir, noteStem);
  await vaultFS.mkdir(siblingDir);
  const fileName = `${generateId()}.${ext}`;
  const relPath = posixJoin(siblingDir, fileName);
  await vaultFS.writeBinaryFile(relPath, base64);
  return relPath;
}

export async function resolveConflict(
  ctx: VaultOpsContext,
  notePath: string,
  conflictFilePath: string,
  mergedContent: string,
): Promise<NoteRecord> {
  const { vaultFS, index } = ctx;
  await atomicWrite(vaultFS, notePath, mergedContent);
  const record = await index.addOrRefresh(vaultFS, notePath);
  await vaultFS.deleteFile(conflictFilePath);
  return record;
}

export async function createConflictFromExternal(
  ctx: VaultOpsContext,
  notePath: string,
  timestamp: string,
): Promise<ConflictRecord> {
  const { vaultFS, index } = ctx;
  const primaryStem = posixBasename(notePath, '.md');
  const noteDir = posixDirname(notePath);
  const conflictFilename = makeConflictFilename(primaryStem, timestamp);
  const conflictRelPath = noteDir === '.' ? conflictFilename : posixJoin(noteDir, conflictFilename);
  const externalContent = await vaultFS.readFile(notePath);
  await atomicWrite(vaultFS, conflictRelPath, externalContent);
  const note = index.getNoteByPath(notePath);
  return {
    noteId: note?.id ?? '',
    notePath,
    conflictFilePath: conflictRelPath,
    detectedAt: new Date(),
  };
}

export interface ConflictScanEntry {
  conflictRelPath: string;
  record: ConflictRecord;
}

export async function scanExistingConflicts(ctx: VaultOpsContext): Promise<ConflictScanEntry[]> {
  const { vaultFS, index } = ctx;
  const results: ConflictScanEntry[] = [];
  await walkForConflicts(vaultFS, '', index, results);
  return results;
}

async function walkForConflicts(
  vaultFS: VaultFS,
  dir: string,
  index: VaultIndex,
  results: ConflictScanEntry[],
): Promise<void> {
  let entries;
  try {
    entries = await vaultFS.listDirectory(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory) {
      await walkForConflicts(vaultFS, entry.path, index, results);
    } else if (entry.name.endsWith('.md') && isConflictFile(entry.name)) {
      const primaryRelPath = primaryPathForConflict(entry.path) ?? entry.path;
      const note = index.getNoteByPath(primaryRelPath);
      results.push({
        conflictRelPath: entry.path,
        record: {
          noteId: note?.id ?? '',
          notePath: primaryRelPath,
          conflictFilePath: entry.path,
          detectedAt: new Date(),
        },
      });
    }
  }
}
