import { registerPlugin } from '@capacitor/core';
import type { VaultFS, DirEntry } from '@notes-app/vault';

// ---------------------------------------------------------------------------
// Native plugin proxy type — mirrors VaultPlugin.kt @PluginMethod signatures
// ---------------------------------------------------------------------------

interface VaultPluginProxy {
  // Lifecycle
  pickFolder(): Promise<{ uri: string }>;
  getSavedFolder(): Promise<{ uri: string | null }>;
  setRoot(options: { uri: string }): Promise<void>;
  // VaultFS methods
  readFile(options: { path: string }): Promise<{ content: string }>;
  writeFile(options: { path: string; content: string }): Promise<void>;
  renameFile(options: { from: string; to: string }): Promise<void>;
  deleteFile(options: { path: string }): Promise<void>;
  listDirectory(options: { path: string }): Promise<{ entries: DirEntry[] }>;
  exists(options: { path: string }): Promise<{ exists: boolean }>;
  mkdir(options: { path: string }): Promise<void>;
  stat(options: { path: string }): Promise<{ mtime: number }>;
  writeBinaryFile(options: { path: string; base64: string }): Promise<void>;
}

export const NativeVaultPlugin = registerPlugin<VaultPluginProxy>('VaultPlugin');

// ---------------------------------------------------------------------------
// CapacitorVaultFS — implements VaultFS by proxying to the native plugin
// ---------------------------------------------------------------------------

/**
 * VaultFS implementation backed by the Android SAF (Storage Access Framework)
 * via the native VaultPlugin Capacitor plugin.
 *
 * All paths are vault-relative POSIX strings (no leading slash).
 * Mirrors the NodeVaultFS + MemoryVaultFS contract precisely.
 */
export class CapacitorVaultFS implements VaultFS {
  private savedUri: string | null = null;

  /**
   * Activate the saved vault URI (if any). Call before vault:open on returning users.
   * If no saved URI exists, the vault remains un-opened and the SAF picker must be used.
   */
  async open(): Promise<void> {
    const { uri } = await NativeVaultPlugin.getSavedFolder();
    if (uri) {
      await NativeVaultPlugin.setRoot({ uri });
      this.savedUri = uri;
    }
  }

  /**
   * Launch the SAF folder picker. Persists the chosen URI and activates it as the root.
   * Returns the URI string on success, or null if cancelled.
   */
  async pickFolder(): Promise<string | null> {
    try {
      const { uri } = await NativeVaultPlugin.pickFolder();
      this.savedUri = uri;
      return uri;
    } catch {
      return null;
    }
  }

  /** The URI of the currently active vault folder, or null if none opened. */
  getSavedUri(): string | null {
    return this.savedUri;
  }

  /**
   * Whether a vault has been saved (from a previous pickFolder call).
   * Does NOT require open() to have been called.
   */
  async hasSavedVault(): Promise<boolean> {
    const { uri } = await NativeVaultPlugin.getSavedFolder();
    return uri !== null;
  }

  /**
   * Native vaults are never seeded with demo content.
   * Always returns false — callers should not seed real user folders.
   */
   
  async isEmpty(): Promise<boolean> {
    return false;
  }

  // ── VaultFS interface ──────────────────────────────────────────────────────

  async readFile(path: string): Promise<string> {
    const { content } = await NativeVaultPlugin.readFile({ path });
    return content;
  }

  writeFile(path: string, content: string): Promise<void> {
    return NativeVaultPlugin.writeFile({ path, content });
  }

  renameFile(from: string, to: string): Promise<void> {
    return NativeVaultPlugin.renameFile({ from, to });
  }

  deleteFile(path: string): Promise<void> {
    return NativeVaultPlugin.deleteFile({ path });
  }

  async listDirectory(path: string): Promise<DirEntry[]> {
    const { entries } = await NativeVaultPlugin.listDirectory({ path });
    return entries;
  }

  async exists(path: string): Promise<boolean> {
    const { exists } = await NativeVaultPlugin.exists({ path });
    return exists;
  }

  mkdir(path: string): Promise<void> {
    return NativeVaultPlugin.mkdir({ path });
  }

  async stat(path: string): Promise<{ mtime: Date }> {
    const { mtime } = await NativeVaultPlugin.stat({ path });
    return { mtime: new Date(mtime) };
  }

  writeBinaryFile(path: string, base64: string): Promise<void> {
    return NativeVaultPlugin.writeBinaryFile({ path, base64 });
  }
}
