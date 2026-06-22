import { contextBridge, ipcRenderer } from 'electron';
import type { IpcChannel } from '@notes-app/common';

contextBridge.exposeInMainWorld('electronAPI', {
  invoke<T = unknown>(channel: IpcChannel, ...args: unknown[]): Promise<T> {
    return ipcRenderer.invoke(channel, ...args) as Promise<T>;
  },

  on(channel: IpcChannel, handler: (...args: unknown[]) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      handler(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.off(channel, listener);
  },
});
