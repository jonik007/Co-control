import { streamGit, type RunOptions } from './exec.js';
import { GitLogParser, PRETTY_FORMAT, type RawCommit } from './logParser.js';

export type MergeDiffMode = 'none' | 'first-parent';

export interface CommitDto {
  sha: string;
  short: string;
  parents: string[];
  isMerge: boolean;
  authorName: string;
  authorEmail: string;
  authorDate: number;
  commitDate: number;
  subject: string;
}

export interface FileDto {
  id: number;
  path: string;
  ext: string;
  aliases: string[];
  /** [firstCommitIdx, lastCommitIdx]; -1 as the end means "still alive". */
  spans: Array<[number, number]>;
  /**
   * True when the file was already in the tree before the requested window,
   * so its real creation commit is outside the diagram.
   */
  bornBeforeWindow: boolean;
}

export interface ChangeDto {
  c: number;
  f: number;
  s: string;
  score?: number;
  from?: string;
}

export interface HistoryPayload {
  key: string;
  repo: { root: string; head: string; branch: string | null };
  meta: {
    commitCount: number;
    fileCount: number;
    changeCount: number;
    truncated: boolean;
    limit: number;
    mergeDiff: MergeDiffMode;
    parseMs: number;
  };
  commits: CommitDto[];
  files: FileDto[];
  changes: ChangeDto[];
}

/**
 * Raw path bytes per change: git paths are not guaranteed to be UTF-8, so a
 * decoded string cannot be fed back to `git show`. Renames keep both sides
 * because limiting a diff to the new path alone hides the rename from git.
 */
export interface ChangePaths {
  path: Buffer;
  from?: Buffer;
}

export interface History {
  payload: HistoryPayload;
  changePaths: ChangePaths[];
}

/** `.gitignore` has no extension; `Makefile` has none either. */
export function extensionOf(filePath: string): string {
  const slash = filePath.lastIndexOf('/');
  const base = slash === -1 ? filePath : filePath.slice(slash + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

interface Identity {
  id: number;
  path: string;
  aliases: string[];
  spans: Array<[number, number]>;
  bornBeforeWindow: boolean;
}

class IdentityTable {
  private readonly identities: Identity[] = [];
  private readonly live = new Map<string, Identity>();
  /** Most recent identity that died at a given path, so A after D resurrects it. */
  private readonly dead = new Map<string, Identity>();

  create(path: string, commitIdx: number, bornBeforeWindow: boolean): Identity {
    const identity: Identity = {
      id: this.identities.length,
      path,
      aliases: [],
      spans: [[commitIdx, -1]],
      bornBeforeWindow,
    };
    this.identities.push(identity);
    this.live.set(path, identity);
    return identity;
  }

  /**
   * Resolves the identity for a path that must already exist. When the history
   * window is truncated we legitimately see M/D/R for files created earlier, so
   * synthesise an identity and mark it as older than the window.
   */
  resolve(path: string, commitIdx: number): Identity {
    const existing = this.live.get(path);
    if (existing) return existing;
    return this.create(path, commitIdx, true);
  }

  add(path: string, commitIdx: number): Identity {
    const resurrected = this.dead.get(path);
    if (resurrected) {
      this.dead.delete(path);
      resurrected.spans.push([commitIdx, -1]);
      this.live.set(path, resurrected);
      return resurrected;
    }
    const alreadyLive = this.live.get(path);
    if (alreadyLive) return alreadyLive;
    return this.create(path, commitIdx, false);
  }

  remove(path: string, commitIdx: number): Identity {
    const identity = this.resolve(path, commitIdx);
    const lastSpan = identity.spans[identity.spans.length - 1];
    if (lastSpan && lastSpan[1] === -1) lastSpan[1] = commitIdx;
    this.live.delete(path);
    this.dead.set(path, identity);
    return identity;
  }

  rename(from: string, to: string, commitIdx: number): Identity {
    const identity = this.resolve(from, commitIdx);
    this.live.delete(from);
    if (identity.path !== to && !identity.aliases.includes(identity.path)) {
      identity.aliases.push(identity.path);
    }
    identity.path = to;
    this.live.set(to, identity);
    return identity;
  }

  all(): Identity[] {
    return this.identities;
  }
}

function logArgs(limit: number, mergeDiff: MergeDiffMode): string[] {
  const args = [
    'log',
    // Topological order guarantees ancestors before descendants once reversed,
    // which the identity replay depends on. Commit dates do not guarantee it.
    '--topo-order',
    '-z',
    '--name-status',
    '--find-renames',
    '--find-copies',
    '--no-color',
    '--root',
    `--pretty=format:${PRETTY_FORMAT}`,
    `-n${limit}`,
  ];
  if (mergeDiff === 'first-parent') {
    args.push('-m', '--first-parent');
  }
  args.push('HEAD');
  return args;
}

export async function buildHistory(
  repoRoot: string,
  head: string,
  branch: string | null,
  opts: { limit: number; mergeDiff: MergeDiffMode } & Pick<RunOptions, 'signal' | 'timeoutMs'>,
): Promise<History> {
  const startedAt = Date.now();
  const raw: RawCommit[] = [];
  const parser = new GitLogParser((commit) => raw.push(commit));

  await streamGit(logArgs(opts.limit, opts.mergeDiff), {
    cwd: repoRoot,
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
  }, (chunk) => parser.push(chunk));
  parser.end();

  // git log emits newest first; the replay needs oldest first.
  raw.reverse();

  const table = new IdentityTable();
  const commits: CommitDto[] = [];
  const changes: ChangeDto[] = [];
  const changePaths: ChangePaths[] = [];

  raw.forEach((commit, index) => {
    commits.push({
      sha: commit.sha,
      short: commit.short,
      parents: commit.parents,
      isMerge: commit.parents.length > 1,
      authorName: commit.authorName,
      authorEmail: commit.authorEmail,
      authorDate: commit.authorDate,
      commitDate: commit.commitDate,
      subject: commit.subject,
    });

    for (const entry of commit.entries) {
      const oldPath = entry.path.toString('utf8');
      const newPath = entry.newPath?.toString('utf8');
      let identity: Identity;
      let from: string | undefined;

      switch (entry.status) {
        case 'A':
          identity = table.add(oldPath, index);
          break;
        case 'D':
          identity = table.remove(oldPath, index);
          break;
        case 'R':
          identity = table.rename(oldPath, newPath ?? oldPath, index);
          from = oldPath;
          break;
        case 'C':
          identity = table.add(newPath ?? oldPath, index);
          from = oldPath;
          break;
        default:
          identity = table.resolve(oldPath, index);
          break;
      }

      changes.push({
        c: index,
        f: identity.id,
        s: entry.status,
        ...(entry.score !== undefined ? { score: entry.score } : {}),
        ...(from !== undefined ? { from } : {}),
      });
      changePaths.push({
        path: entry.newPath ?? entry.path,
        ...(entry.newPath ? { from: entry.path } : {}),
      });
    }
  });

  const lastIdx = commits.length - 1;
  const files: FileDto[] = table.all().map((identity) => ({
    id: identity.id,
    path: identity.path,
    ext: extensionOf(identity.path),
    aliases: identity.aliases,
    spans: identity.spans.map(([start, end]) => [start, end === -1 ? lastIdx : end] as [number, number]),
    bornBeforeWindow: identity.bornBeforeWindow,
  }));

  const key = `${repoRoot}\u0000${head}\u0000${opts.limit}\u0000${opts.mergeDiff}`;

  return {
    payload: {
      key,
      repo: { root: repoRoot, head, branch },
      meta: {
        commitCount: commits.length,
        fileCount: files.length,
        changeCount: changes.length,
        truncated: commits.length >= opts.limit,
        limit: opts.limit,
        mergeDiff: opts.mergeDiff,
        parseMs: Date.now() - startedAt,
      },
      commits,
      files,
      changes,
    },
    changePaths,
  };
}
