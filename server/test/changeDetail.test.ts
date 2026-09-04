import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildHistory, type History } from '../src/git/history.js';
import { inspectRepo, readChangeDetail } from '../src/git/repo.js';

const scriptPath = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../scripts/make-fixture-repo.sh',
);

let repoDir: string;
let history: History;

function detailFor(predicate: (change: History['payload']['changes'][number]) => boolean) {
  const index = history.payload.changes.findIndex(predicate);
  if (index < 0) throw new Error('no matching change');
  const change = history.payload.changes[index]!;
  const commit = history.payload.commits[change.c]!;
  return readChangeDetail(history.payload.repo.root, commit.sha, {
    ...history.changePaths[index]!,
    isMerge: commit.isMerge,
  });
}

beforeAll(async () => {
  repoDir = mkdtempSync(path.join(tmpdir(), 'gitgantt-detail-'));
  execFileSync('bash', [scriptPath, repoDir], { stdio: 'pipe' });
  const info = await inspectRepo(repoDir);
  history = await buildHistory(info.root, info.head!, info.branch, {
    limit: 1000,
    mergeDiff: 'none',
  });
}, 60_000);

afterAll(() => {
  if (repoDir) rmSync(repoDir, { recursive: true, force: true });
});

describe('readChangeDetail', () => {
  it('reports a rename as a rename, not as a new file', async () => {
    const detail = await detailFor((c) => c.s === 'R' && c.from === 'src/core/app.py');
    expect(detail.status).toBe('R');
    expect(detail.diff).not.toContain('new file mode');
  });

  it('marks a binary file and leaves line counts unset', async () => {
    const detail = await detailFor((c) => c.s === 'A' && c.f === findFileId('assets.bin'));
    expect(detail.binary).toBe(true);
    expect(detail.added).toBeNull();
    expect(detail.deleted).toBeNull();
    expect(detail.diff).toBe('');
  });

  it('counts lines for a text modification', async () => {
    const detail = await detailFor((c) => c.s === 'M' && c.f === findFileId('src/interface/index.ts'));
    expect(detail.added).toBe(1);
    expect(detail.deleted).toBe(0);
    expect(detail.diff).toContain('+export const y = 2');
  });

  it('keeps a path with a space intact through the pathspec', async () => {
    const detail = await detailFor((c) => c.f === findFileId('src/interface/space in name.ts'));
    expect(detail.path).toContain('space in name.ts');
    expect(detail.added).toBe(1);
  });

  it('rejects a malformed commit id instead of passing it to git', async () => {
    await expect(
      readChangeDetail(repoDir, '--upload-pack=calc', { path: Buffer.from('a'), isMerge: false }),
    ).rejects.toThrow();
  });
});

function findFileId(filePath: string): number {
  const file = history.payload.files.find((f) => f.path === filePath);
  if (!file) throw new Error(`no file ${filePath}`);
  return file.id;
}
