import { promises as fs } from 'fs';
import { join } from 'path';
import { app } from 'electron';

interface Settings {
  recentVaults: Array<{ path: string; name: string; lastOpened: string }>;
}

const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json');

async function load(): Promise<Settings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf-8');
    return JSON.parse(raw) as Settings;
  } catch {
    return { recentVaults: [] };
  }
}

async function save(settings: Settings): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
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
