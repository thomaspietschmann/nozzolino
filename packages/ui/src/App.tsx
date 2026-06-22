import React, { useEffect } from 'react';
import { ACCENT_PRESETS } from '@notes-app/common';
import { useStore } from './store.js';
import { VaultOpenScreen } from './components/VaultOpenScreen.js';
import { AppShell } from './components/AppShell.js';

export function App() {
  const { vaultRoot, theme, accent, openVault } = useStore();

  // Auto-open vault when running under Playwright E2E (E2E_VAULT_PATH env var)
  useEffect(() => {
    const e2ePath = window.electronAPI?.e2eVaultPath;
    if (e2ePath && !vaultRoot) void openVault(e2ePath);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const preset = ACCENT_PRESETS.find((p) => p.key === accent);
    if (preset) {
      const hex = preset.value;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      document.documentElement.style.setProperty('--accent', `${r} ${g} ${b}`);
    }
  }, [accent]);

  if (!vaultRoot) {
    return <VaultOpenScreen />;
  }

  return <AppShell />;
}
