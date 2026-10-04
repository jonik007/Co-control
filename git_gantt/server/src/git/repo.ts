import { GitError, runGitText } from './exec.js';

export interface RepoInfo {
  root: string;
  gitDir: string;
  bare: boolean;
  /** null for a freshly initialised repository with no commits yet. */
  head: string | null;
  branch: string | null;
  detached: boolean;
  commitCount: number;
}

export async function inspectRepo(dir: string, signal?: AbortSignal): Promise<RepoInfo> {
  // `.git` may be a file (worktrees, submodules), so ask git instead of the FS.
  const base = await runGitText(['rev-parse', '--absolute-git-dir', '--is-bare-repository'], {
    cwd: dir,
    signal,
  });
  const [gitDirLine = '', bareLine = ''] = base.split('\n');
  const bare = bareLine.trim() === 'true';

  let root = dir;
  if (!bare) {
    root = (await runGitText(['rev-parse', '--show-toplevel'], { cwd: dir, signal })).trim() || dir;
  }

  let head: string | null = null;
  let branch: string | null = null;
  let detached = false;
  let commitCount = 0;

  try {
    head = (await runGitText(['rev-parse', 'HEAD'], { cwd: root, signal })).trim();
  } catch (err) {
    // An empty repository has no resolvable HEAD; that is not a failure.
    if (!(err instanceof GitError)) throw err;
    head = null;
  }

  if (head) {
    const symbolic = (await runGitText(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, signal })).trim();
    detached = symbolic === 'HEAD';
    branch = detached ? null : symbolic;
    commitCount = Number((await runGitText(['rev-list', '--count', 'HEAD'], { cwd: root, signal })).trim()) || 0;
  }

  return { root, gitDir: gitDirLine.trim(), bare, head, branch, detached, commitCount };
}

export interface ChangeDetail {
  sha: string;
  path: string;
  status: string;
  added: number | null;
  deleted: number | null;
  binary: boolean;
  subject: string;
  authorName: string;
  authorEmail: string;
  authorDate: number;
  commitDate: number;
  body: string;
  diff: string;
  diffTruncated: boolean;
}

const DIFF_LIMIT = 200 * 1024;

export interface ChangeTarget {
  path: Buffer;
  /** Present for renames and copies; both sides must be in the pathspec. */
  from?: Buffer;
  isMerge: boolean;
}

export async function readChangeDetail(
  repoRoot: string,
  sha: string,
  target: ChangeTarget,
  signal?: AbortSignal,
): Promise<ChangeDetail> {
  if (!/^[0-9a-f]{7,64}$/.test(sha)) {
    throw new GitError('Некорректный идентификатор коммита', { kind: 'failed' });
  }
  const filePath = target.path.toString('utf8');
  // Restricting the diff to the new path alone would make a rename look like a
  // freshly added file, so both sides go into the pathspec.
  const pathspec = target.from ? [target.from.toString('utf8'), filePath] : [filePath];
  // A merge shows nothing by default; follow the first parent so a cell the
  // user can actually see is never backed by an empty diff.
  const mergeArgs = target.isMerge ? ['-m', '--first-parent'] : [];

  const meta = await runGitText(
    ['show', '--no-patch', '--pretty=format:%an%x1f%ae%x1f%at%x1f%ct%x1f%s%x1f%b', sha],
    { cwd: repoRoot, signal },
  );
  const [authorName = '', authorEmail = '', at = '0', ct = '0', subject = '', ...bodyParts] =
    meta.split('\x1f');

  const numstat = await runGitText(
    ['show', '--numstat', '--format=', '--find-renames', ...mergeArgs, sha, '--', ...pathspec],
    { cwd: repoRoot, signal },
  );
  let added: number | null = null;
  let deleted: number | null = null;
  let binary = false;
  const firstLine = numstat.split('\n').find((line) => line.trim().length > 0);
  if (firstLine) {
    const [a = '', d = ''] = firstLine.split('\t');
    // git prints `-` for binary files rather than a line count.
    binary = a === '-' || d === '-';
    added = binary ? null : Number(a) || 0;
    deleted = binary ? null : Number(d) || 0;
  }

  const nameStatus = await runGitText(
    ['show', '--name-status', '--format=', '--find-renames', ...mergeArgs, sha, '--', ...pathspec],
    { cwd: repoRoot, signal },
  );
  const status = (nameStatus.trim().split('\t')[0] ?? '').slice(0, 1) || 'M';

  let diff = '';
  let diffTruncated = false;
  if (!binary) {
    diff = await runGitText(
      [
        'show',
        '--format=',
        '--find-renames',
        '--unified=3',
        ...mergeArgs,
        sha,
        '--',
        ...pathspec,
      ],
      { cwd: repoRoot, signal },
    );
    if (diff.length > DIFF_LIMIT) {
      diff = diff.slice(0, DIFF_LIMIT);
      diffTruncated = true;
    }
  }

  return {
    sha,
    path: filePath,
    status,
    added,
    deleted,
    binary,
    subject,
    authorName,
    authorEmail,
    authorDate: Number(at) || 0,
    commitDate: Number(ct) || 0,
    body: bodyParts.join('\x1f').trim(),
    diff,
    diffTruncated,
  };
}
