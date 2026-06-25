export interface ServerConfig {
  vaultDir: string;
  syncToken: string;
  port: number;
}

/** Parses runtime config from environment variables (ADR-0009). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const vaultDir = env.VAULT_DIR ?? '/data';
  const syncToken = env.SYNC_TOKEN ?? 'changeme';
  const port = Number.parseInt(env.PORT ?? '8080', 10);
  return { vaultDir, syncToken, port: Number.isNaN(port) ? 8080 : port };
}
