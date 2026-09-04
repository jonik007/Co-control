import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';

export class PathRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathRejected';
  }
}

function allowedRoots(): string[] {
  const raw = process.env.GITGANTT_ALLOWED_ROOTS;
  if (!raw) return [];
  return raw
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Turns a user-supplied directory into an absolute, symlink-resolved path we
 * are willing to run git in. Everything reaching git as a path goes through here.
 */
export async function resolveRepoPath(input: unknown): Promise<string> {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new PathRejected('Не указан путь к репозиторию');
  }
  let candidate = input.trim();
  if (candidate.includes('\0')) {
    throw new PathRejected('Путь содержит недопустимый символ');
  }
  // Users on Windows paste `C:\Users\me\proj`; git and our tree always use `/`.
  // Only rewrite there: on POSIX a backslash is a legal filename character.
  if (process.platform === 'win32') {
    candidate = candidate.replace(/\\/g, '/');
  }
  // Strip surrounding quotes that come along when a path is copied from Explorer.
  candidate = candidate.replace(/^"(.*)"$/, '$1');

  if (candidate.startsWith('-')) {
    throw new PathRejected('Путь не может начинаться с "-"');
  }

  const absolute = path.resolve(candidate);

  let resolved: string;
  try {
    resolved = await realpath(absolute);
  } catch {
    throw new PathRejected(`Каталог не найден: ${absolute}`);
  }

  const info = await stat(resolved);
  if (!info.isDirectory()) {
    throw new PathRejected('Указанный путь не является каталогом');
  }

  const roots = allowedRoots();
  if (roots.length > 0 && !roots.some((root) => isInside(root, resolved))) {
    throw new PathRejected('Путь вне разрешённых каталогов (GITGANTT_ALLOWED_ROOTS)');
  }

  return resolved;
}
