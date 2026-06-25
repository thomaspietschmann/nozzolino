import { promises as fs } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import type { SyncSettings } from '@notes-app/common';

interface Settings {
  recentVaults: Array<{ path: string; name: string; lastOpened: string }>;
  sync?: SyncSettings;
}

const DEFAULT_SYNC: SyncSettings = { syncMode: 'syncthing' };

// Resolve lazily: index.ts may override userData (E2E isolation) AFTER this module
// is imported, so reading the path at module load would capture the wrong directory.
function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

async function load(): Promise<Settings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8');
    return JSON.parse(raw) as Settings;
  } catch {
    return { recentVaults: [] };
  }
}

async function save(settings: Settings): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
}

export async function getRecentVaults() {
  const s = await load();
  return s.recentVaults;
}

export async function addRecentVault(vaultPath: string) {
  const s = await load();
  const name = vaultPath.split('/').pop() ?? vaultPath;
  s.recentVaults = [
    { path: vaultPath, name, lastOpened: new Date().toISOString() },
    ...s.recentVaults.filter((v) => v.path !== vaultPath),
  ].slice(0, 10);
  await save(s);
}

export async function getSyncConfig(): Promise<SyncSettings> {
  const s = await load();
  return s.sync ?? DEFAULT_SYNC;
}

export async function setSyncConfig(config: SyncSettings): Promise<void> {
  const s = await load();
  s.sync = config;
  await save(s);
}
