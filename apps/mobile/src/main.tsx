import { installMockBridge } from './bridge/mockBridge.js';

// Install the mock window.electronAPI before any UI code imports or runs.
// This ensures ipc.ts finds window.electronAPI when the app mounts.
installMockBridge();

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
