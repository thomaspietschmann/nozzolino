export interface DirEntry {
  name: string;
  /** Vault-relative POSIX path. */
  path: string;
  isDirectory: boolean;
}

export interface VaultFS {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  renameFile(from: string, to: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  listDirectory(path: string): Promise<DirEntry[]>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  stat(path: string): Promise<{ mtime: Date }>;
  writeBinaryFile(path: string, base64: string): Promise<void>;
}
