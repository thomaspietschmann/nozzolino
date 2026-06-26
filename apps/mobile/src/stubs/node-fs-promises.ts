// Browser stub for Node's 'node:fs/promises' module.
// DirImportSource (@notes-app/import) imports these named exports but is never
// called in the mobile bundle (mobile import uses ZipImportSource). Rollup still
// resolves the named imports at parse time, so provide compatible signatures.
const unavailable = (): never => {
  throw new Error('fs/promises unavailable in browser');
};
export const readFile = unavailable;
export const readdir = unavailable;
export const writeFile = unavailable;
export const rename = unavailable;
export const unlink = unavailable;
export const mkdir = unavailable;
export const access = unavailable;
export const stat = unavailable;
export default { readFile, readdir, writeFile, rename, unlink, mkdir, access, stat };
