import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildHistory, extensionOf, type HistoryPayload } from '../src/git/history.js';
import { inspectRepo } from '../src/git/repo.js';

const scriptPath = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../scripts/make-fixture-repo.sh',
);

let repoDir: string;
let payload: HistoryPayload;

function fileByPath(target: string) {
  const found = payload.files.find((f) => f.path === target);
  if (!found) throw new Error(`no file ${target} in ${payload.files.map((f) => f.path).join(', ')}`);
  return found;
}

function changesFor(fileId: number) {
  return payload.changes.filter((c) => c.f === fileId);
}

beforeAll(async () => {
  repoDir = mkdtempSync(path.join(tmpdir(), 'gitgantt-fixture-'));
  execFileSync('bash', [scriptPath, repoDir], { stdio: 'pipe' });
  const info = await inspectRepo(repoDir);
  const history = await buildHistory(info.root, info.head!, info.branch, {
    limit: 1000,
    mergeDiff: 'none',
  });
  payload = history.payload;
}, 60_000);

afterAll(() => {
  if (repoDir) rmSync(repoDir, { recursive: true, force: true });
});

describe('extensionOf', () => {
  it('treats dotfiles and extensionless names as having no extension', () => {
    expect(extensionOf('src/a.ts')).toBe('ts');
    expect(extensionOf('src/a.TSX')).toBe('tsx');
    expect(extensionOf('Makefile')).toBe('');
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('dir.with.dot/LICENSE')).toBe('');
  });
});

describe('buildHistory on the fixture repository', () => {
  it('orders commits oldest first', () => {
    expect(payload.commits[0]!.subject).toBe('initial layout');
    expect(payload.commits.at(-1)!.subject).toBe('move directory src/ui -> src/interface');
  });

  it('reports the merge commit but attributes no changes to it', () => {
    const merge = payload.commits.find((c) => c.isMerge)!;
    expect(merge.parents).toHaveLength(2);
    const mergeIdx = payload.commits.indexOf(merge);
    expect(payload.changes.filter((c) => c.c === mergeIdx)).toEqual([]);
  });

  it('follows a rename into a single file identity instead of two', () => {
    const file = fileByPath('src/core/application.py');
    expect(file.aliases).toContain('src/core/app.py');
    expect(payload.files.some((f) => f.path === 'src/core/app.py')).toBe(false);
    // Created, modified, then renamed: all three land on one identity.
    expect(changesFor(file.id).map((c) => c.s)).toEqual(['A', 'M', 'R']);
    expect(file.spans).toHaveLength(1);
    expect(file.spans[0]![0]).toBe(0);
  });

  it('follows a whole directory move', () => {
    const file = fileByPath('src/interface/index.ts');
    expect(file.aliases).toContain('src/ui/index.ts');
    expect(file.spans[0]![0]).toBe(0);
  });

  it('gives a deleted-and-recreated file two spans with a gap', () => {
    const file = fileByPath('docs/readme.md');
    expect(file.spans).toHaveLength(2);
    const [first, second] = file.spans;
    expect(first![1]).toBeLessThan(second![0]);
    expect(changesFor(file.id).map((c) => c.s)).toEqual(['A', 'D', 'A']);
  });

  it('keeps non-ASCII and awkward paths intact', () => {
    const paths = payload.files.map((f) => f.path);
    expect(paths).toContain('src/interface/компоненты/кнопка.tsx');
    expect(paths).toContain('src/interface/space in name.ts');
    expect(paths).toContain('src/interface/quote".ts');
  });

  it('keeps every span inside the commit range', () => {
    const last = payload.commits.length - 1;
    for (const file of payload.files) {
      for (const [start, end] of file.spans) {
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeLessThanOrEqual(last);
        expect(start).toBeLessThanOrEqual(end);
      }
    }
  });

  it('marks files as older than the window when history is truncated', async () => {
    const info = await inspectRepo(repoDir);
    const { payload: windowed } = await buildHistory(info.root, info.head!, info.branch, {
      limit: 2,
      mergeDiff: 'none',
    });
    expect(windowed.meta.truncated).toBe(true);
    expect(windowed.commits).toHaveLength(2);
    expect(windowed.files.some((f) => f.bornBeforeWindow)).toBe(true);
  });

  it('attributes merged-in changes to the merge commit in first-parent mode', async () => {
    const info = await inspectRepo(repoDir);
    const { payload: fp } = await buildHistory(info.root, info.head!, info.branch, {
      limit: 1000,
      mergeDiff: 'first-parent',
    });
    const merge = fp.commits.find((c) => c.isMerge)!;
    const mergeIdx = fp.commits.indexOf(merge);
    expect(fp.changes.filter((c) => c.c === mergeIdx).length).toBeGreaterThan(0);
  });
});
