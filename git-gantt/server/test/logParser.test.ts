import { describe, expect, it } from 'vitest';
import { GitLogParser, parseGitLog, PRETTY_FORMAT } from '../src/git/logParser.js';

const REC = '\x01';
const FS = '\x1f';
const NUL = '\x00';

function header(sha: string, parents: string, subject: string): string {
  return [sha, sha.slice(0, 7), parents, 'Ann', 'ann@e.com', '1700000000', '1700000001', subject].join(FS);
}

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

describe('PRETTY_FORMAT', () => {
  it('keeps the subject last so separators inside it cannot shift fields', () => {
    expect(PRETTY_FORMAT.endsWith('%s')).toBe(true);
  });
});

describe('GitLogParser', () => {
  it('reads a commit with plain entries', () => {
    const out = `${REC}${header(SHA_A, '', 'work')}\nM${NUL}a.ts${NUL}A${NUL}b.ts${NUL}${NUL}`;
    const commits = parseGitLog(Buffer.from(out, 'utf8'));
    expect(commits).toHaveLength(1);
    expect(commits[0]!.subject).toBe('work');
    expect(commits[0]!.entries.map((e) => [e.status, e.path.toString()])).toEqual([
      ['M', 'a.ts'],
      ['A', 'b.ts'],
    ]);
  });

  it('reads a merge commit that carries no entries at all', () => {
    const out =
      `${REC}${header(SHA_A, `${SHA_B} ${SHA_C}`, 'merge')}${NUL}` +
      `${REC}${header(SHA_B, '', 'earlier')}\nA${NUL}x.ts${NUL}${NUL}`;
    const commits = parseGitLog(Buffer.from(out, 'utf8'));
    expect(commits).toHaveLength(2);
    expect(commits[0]!.entries).toEqual([]);
    expect(commits[0]!.parents).toEqual([SHA_B, SHA_C]);
    expect(commits[1]!.entries).toHaveLength(1);
  });

  it('splits rename entries into old and new path and keeps the similarity score', () => {
    const out = `${REC}${header(SHA_A, '', 'move')}\nR100${NUL}old.ts${NUL}new.ts${NUL}${NUL}`;
    const [commit] = parseGitLog(Buffer.from(out, 'utf8'));
    const entry = commit!.entries[0]!;
    expect(entry.status).toBe('R');
    expect(entry.score).toBe(100);
    expect(entry.path.toString()).toBe('old.ts');
    expect(entry.newPath!.toString()).toBe('new.ts');
  });

  it('survives paths containing spaces, quotes and non-ASCII bytes', () => {
    const weird = 'src/ui/кнопка "v2".tsx';
    const out = `${REC}${header(SHA_A, '', 'weird')}\nA${NUL}${weird}${NUL}${NUL}`;
    const [commit] = parseGitLog(Buffer.from(out, 'utf8'));
    expect(commit!.entries[0]!.path.toString('utf8')).toBe(weird);
  });

  it('keeps a subject that itself contains the field separator', () => {
    const subject = `fix${FS}thing`;
    const out = `${REC}${header(SHA_A, '', subject)}\nM${NUL}a.ts${NUL}${NUL}`;
    const [commit] = parseGitLog(Buffer.from(out, 'utf8'));
    expect(commit!.subject).toBe(subject);
  });

  it('keeps a subject that contains the record separator', () => {
    const subject = `fix${REC}thing`;
    const out = `${REC}${header(SHA_A, '', subject)}\nM${NUL}a.ts${NUL}${NUL}`;
    const [commit] = parseGitLog(Buffer.from(out, 'utf8'));
    expect(commit!.subject).toBe(subject);
    expect(commit!.entries).toHaveLength(1);
  });

  it('produces the same result no matter where the byte stream is chopped', () => {
    const out =
      `${REC}${header(SHA_A, '', 'первый')}\nA${NUL}src/файл.ts${NUL}R087${NUL}a${NUL}b${NUL}${NUL}` +
      `${REC}${header(SHA_B, `${SHA_A} ${SHA_C}`, 'merge')}${NUL}` +
      `${REC}${header(SHA_C, '', 'третий')}\nD${NUL}gone.md${NUL}${NUL}`;
    const bytes = Buffer.from(out, 'utf8');
    const reference = JSON.stringify(parseGitLog(bytes));

    for (const size of [1, 2, 3, 5, 7, 13, 31, 64]) {
      const collected: unknown[] = [];
      const parser = new GitLogParser((c) => collected.push(c));
      for (let i = 0; i < bytes.length; i += size) {
        parser.push(bytes.subarray(i, Math.min(i + size, bytes.length)));
      }
      parser.end();
      expect(JSON.stringify(collected), `chunk size ${size}`).toBe(reference);
    }
  });
});
