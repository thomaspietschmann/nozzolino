import { buildApp } from './app';
import { loadConfig } from './config';
import { getVersion } from './version';

const config = loadConfig();
const app = buildApp({ vaultDir: config.vaultDir, syncToken: config.syncToken });

app.listen(config.port, () => {
  console.log(
    `notes-app sync server v${getVersion()} listening on :${config.port} (vault: ${config.vaultDir})`,
  );
});
