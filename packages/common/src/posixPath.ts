export function posixJoin(...parts: string[]): string {
  const joined = parts.filter((p) => p !== '').join('/').replace(/\/+/g, '/');
  return joined || '.';
}

export function posixDirname(path: string): string {
  if (!path || path === '.' || path === '/') return '.';
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  const i = trimmed.lastIndexOf('/');
  if (i < 0) return '.';
  if (i === 0) return '/';
  return trimmed.slice(0, i);
}

export function posixBasename(path: string, ext?: string): string {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  const name = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  if (ext && name.endsWith(ext)) return name.slice(0, -ext.length);
  return name;
}
