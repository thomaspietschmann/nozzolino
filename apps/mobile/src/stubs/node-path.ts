// Browser stub for Node's 'path' module.
// NodeVaultFS is tree-shaken out of the mobile bundle, but Rollup still resolves
// its named imports at parse time. These stubs satisfy the resolver.
export const join = (..._parts: string[]): string => { throw new Error('path.join unavailable in browser'); };
export const dirname = (_path: string): string => { throw new Error('path.dirname unavailable in browser'); };
export const basename = (_path: string, _ext?: string): string => { throw new Error('path.basename unavailable in browser'); };
export const resolve = (..._paths: string[]): string => { throw new Error('path.resolve unavailable in browser'); };
export const relative = (_from: string, _to: string): string => { throw new Error('path.relative unavailable in browser'); };
export const sep = '/';
export const posix = { join, dirname, basename, resolve, relative, sep };
export default { join, dirname, basename, resolve, relative, sep, posix };
