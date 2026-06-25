import JSZip from 'jszip';
import type { ImportSource } from './ImportSource.js';

/**
 * ImportSource backed by a JSZip archive.
 * Use `ZipImportSource.fromBuffer(data)` to construct an instance.
 */
export class ZipImportSource implements ImportSource {
  private readonly zip: JSZip;
  private readonly filePaths: string[];

  private constructor(zip: JSZip) {
    this.zip = zip;
    this.filePaths = Object.values(zip.files)
      .filter((f) => !f.dir)
      .map((f) => f.name);
  }

  /**
   * Loads a zip archive from a Uint8Array and returns a ready-to-use source.
   */
  static async fromBuffer(data: Uint8Array): Promise<ZipImportSource> {
    const zip = await JSZip.loadAsync(data);
    return new ZipImportSource(zip);
  }

  list(): string[] {
    return this.filePaths;
  }

  async readText(path: string): Promise<string> {
    const entry = this.zip.file(path);
    if (!entry) throw new Error(`ZipImportSource: entry not found: ${path}`);
    return entry.async('string');
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const entry = this.zip.file(path);
    if (!entry) throw new Error(`ZipImportSource: entry not found: ${path}`);
    const buf = await entry.async('uint8array');
    return buf;
  }
}
