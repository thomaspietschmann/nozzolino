// Browser stub for chokidar.
// VaultWatcher is tree-shaken out, but Rollup resolves imports at parse time.
const unavailable = (): never => { throw new Error('chokidar unavailable in browser'); };
export const watch = unavailable;
export default { watch };
