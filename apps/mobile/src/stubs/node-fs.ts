// Browser stub for Node's 'fs' module.
// NodeVaultFS is tree-shaken out, but Rollup resolves imports at parse time.
const unavailable = (): never => { throw new Error('fs unavailable in browser'); };
export const promises = {
  readFile: unavailable,
  writeFile: unavailable,
  rename: unavailable,
  unlink: unavailable,
  readdir: unavailable,
  mkdir: unavailable,
  access: unavailable,
  stat: unavailable,
};
export default { promises };
