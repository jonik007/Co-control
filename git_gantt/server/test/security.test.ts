import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PathRejected, resolveRepoPath } from '../src/security.js';

let dir: string | null = null;

afterEach(() => {
  delete process.env.GITGANTT_ALLOWED_ROOTS;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('resolveRepoPath', () => {
  it('rejects empty, non-string and NUL-bearing input', async () => {
    await expect(resolveRepoPath('')).rejects.toBeInstanceOf(PathRejected);
    await expect(resolveRepoPath(undefined)).rejects.toBeInstanceOf(PathRejected);
    await expect(resolveRepoPath(42)).rejects.toBeInstanceOf(PathRejected);
    await expect(resolveRepoPath('/tmp/x\0y')).rejects.toBeInstanceOf(PathRejected);
  });

  it('rejects paths that would be read as git options', async () => {
    await expect(resolveRepoPath('--upload-pack=calc')).rejects.toBeInstanceOf(PathRejected);
  });

  it('rejects files and missing directories', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'gitgantt-sec-'));
    const file = path.join(dir, 'a.txt');
    writeFileSync(file, 'x');
    await expect(resolveRepoPath(file)).rejects.toBeInstanceOf(PathRejected);
    await expect(resolveRepoPath(path.join(dir, 'nope'))).rejects.toBeInstanceOf(PathRejected);
  });

  it('resolves an existing directory to an absolute path', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'gitgantt-sec-'));
    await expect(resolveRepoPath(dir)).resolves.toBe(await realish(dir));
  });

  it('enforces the allowlist when one is configured', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'gitgantt-sec-'));
    process.env.GITGANTT_ALLOWED_ROOTS = path.join(dir, 'allowed');
    await expect(resolveRepoPath(dir)).rejects.toBeInstanceOf(PathRejected);
  });
});

async function realish(p: string): Promise<string> {
  const { realpath } = await import('node:fs/promises');
  return realpath(p);
}
