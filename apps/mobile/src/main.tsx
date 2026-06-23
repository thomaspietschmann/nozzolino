import { installBridge } from './bridge/bridge.js';

// Install window.electronAPI before any UI code imports or runs.
// On native: wires CapacitorVaultFS (SAF). On web: wires WebVaultFS (IndexedDB).
installBridge();

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@notes-app/ui';
import '@notes-app/ui/styles';

const el = document.getElementById('root');
if (!el) throw new Error('Root element not found');

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
