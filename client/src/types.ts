/** Mirrors server/src/git/history.ts. Kept as a separate copy so the two
 * packages stay independently buildable; the shapes must move together. */

export type MergeDiffMode = 'none' | 'first-parent';

export interface Commit {
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

export interface FileEntry {
  id: number;
  path: string;
  ext: string;
  aliases: string[];
  spans: Array<[number, number]>;
  bornBeforeWindow: boolean;
}

export interface Change {
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
  commits: Commit[];
  files: FileEntry[];
  changes: Change[];
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
  change: Change;
  fileId: number;
}

export type DateMode = 'author' | 'commit';
export type XScaleMode = 'ordinal' | 'time';
