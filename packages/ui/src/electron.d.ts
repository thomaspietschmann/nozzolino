import type { IpcChannel } from '@notes-app/common';

declare global {
  interface Window {
    electronAPI: {
      invoke: <T = unknown>(channel: IpcChannel, ...args: unknown[]) => Promise<T>;
      on: (channel: IpcChannel, handler: (...args: unknown[]) => void) => () => void;
    };
  }
}

export {};
