/**
 * Parser for `git log -z --name-status` with a custom --pretty header.
 *
 * Wire format, verified against a real repository (scripts/make-fixture-repo.sh):
 *
 *   \x01 <hdr fields joined by \x1f> \n  ( <status> \0 <path> \0 [<path2> \0] )*  \0
 *   \x01 <hdr> \0                                       <- commit with no entries (a merge)
 *
 * The parser walks strictly forward instead of splitting on the sentinels,
 * because a commit subject may legally contain \x01 or \x1f. Header bytes are
 * read up to the first \n or \0, neither of which %s can produce.
 */

export const RECORD_SEP = 0x01;
export const FIELD_SEP = 0x1f;

export interface RawEntry {
  status: string;
  /** Similarity percentage that git appends to R/C, e.g. R100. */
  score?: number;
  /** Raw bytes: git paths are not guaranteed to be UTF-8. */
  path: Buffer;
  newPath?: Buffer;
}

export interface RawCommit {
  sha: string;
  short: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorDate: number;
  commitDate: number;
  subject: string;
  entries: RawEntry[];
}

export const PRETTY_FORMAT = '%x01%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%ct%x1f%s';

const SHA_RE = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;

type State = 'seek-record' | 'header' | 'entry-status' | 'entry-path' | 'entry-path2';

export class GitLogParser {
  private buf: Buffer = Buffer.alloc(0);
  private state: State = 'seek-record';
  private current: RawCommit | null = null;
  private pendingStatus = '';
  private pendingScore: number | undefined;
  private pendingPath: Buffer | null = null;

  constructor(private readonly onCommit: (commit: RawCommit) => void) {}

  push(chunk: Buffer): void {
    this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
    this.drain(false);
  }

  end(): void {
    this.drain(true);
    if (this.current) {
      this.onCommit(this.current);
      this.current = null;
    }
    this.buf = Buffer.alloc(0);
  }

  private drain(atEof: boolean): void {
    let pos = 0;
    for (;;) {
      if (this.state === 'seek-record') {
        const idx = this.buf.indexOf(RECORD_SEP, pos);
        if (idx === -1) {
          pos = this.buf.length;
          break;
        }
        if (this.current) {
          this.onCommit(this.current);
          this.current = null;
        }
        pos = idx + 1;
        this.state = 'header';
        continue;
      }

      if (this.state === 'header') {
        const end = indexOfEither(this.buf, pos, 0x0a, 0x00);
        if (end === -1) {
          if (atEof && pos < this.buf.length) {
            this.current = parseHeader(this.buf.subarray(pos));
            pos = this.buf.length;
            this.state = 'seek-record';
            continue;
          }
          break;
        }
        this.current = parseHeader(this.buf.subarray(pos, end));
        const terminator = this.buf[end];
        pos = end + 1;
        // \0 right after the header means the commit carries no name-status
        // entries at all, which is what plain `git log` reports for merges.
        this.state = terminator === 0x00 ? 'seek-record' : 'entry-status';
        continue;
      }

      const tokenEnd = this.buf.indexOf(0x00, pos);
      if (tokenEnd === -1) break;
      const token = this.buf.subarray(pos, tokenEnd);
      pos = tokenEnd + 1;

      if (this.state === 'entry-status') {
        if (token.length === 0) {
          // Empty token closes the commit block.
          this.state = 'seek-record';
          continue;
        }
        const text = token.toString('latin1');
        const letter = text[0] ?? 'M';
        const digits = text.slice(1);
        this.pendingStatus = letter;
        this.pendingScore = digits.length > 0 && /^\d+$/.test(digits) ? Number(digits) : undefined;
        this.state = 'entry-path';
        continue;
      }

      if (this.state === 'entry-path') {
        if (this.pendingStatus === 'R' || this.pendingStatus === 'C') {
          this.pendingPath = Buffer.from(token);
          this.state = 'entry-path2';
          continue;
        }
        this.current?.entries.push({
          status: this.pendingStatus,
          score: this.pendingScore,
          path: Buffer.from(token),
        });
        this.state = 'entry-status';
        continue;
      }

      // entry-path2
      this.current?.entries.push({
        status: this.pendingStatus,
        score: this.pendingScore,
        path: this.pendingPath ?? Buffer.alloc(0),
        newPath: Buffer.from(token),
      });
      this.pendingPath = null;
      this.state = 'entry-status';
    }

    this.buf = pos === 0 ? this.buf : this.buf.subarray(pos);
  }
}

function indexOfEither(buf: Buffer, from: number, a: number, b: number): number {
  for (let i = from; i < buf.length; i += 1) {
    const byte = buf[i];
    if (byte === a || byte === b) return i;
  }
  return -1;
}

function parseHeader(bytes: Buffer): RawCommit {
  const fields = bytes.toString('utf8').split(String.fromCharCode(FIELD_SEP));
  const sha = fields[0] ?? '';
  if (!SHA_RE.test(sha)) {
    throw new Error(`Не удалось разобрать заголовок коммита: ${JSON.stringify(bytes.toString('utf8').slice(0, 120))}`);
  }
  const parentField = fields[2] ?? '';
  const parents = parentField.length > 0 ? parentField.split(' ').filter(Boolean) : [];
  return {
    sha,
    short: fields[1] ?? sha.slice(0, 7),
    parents,
    authorName: fields[3] ?? '',
    authorEmail: fields[4] ?? '',
    authorDate: Number(fields[5] ?? 0) || 0,
    commitDate: Number(fields[6] ?? 0) || 0,
    // A subject containing \x1f would split into extra fields; put it back.
    subject: fields.slice(7).join(String.fromCharCode(FIELD_SEP)),
    entries: [],
  };
}

export function parseGitLog(buffer: Buffer): RawCommit[] {
  const commits: RawCommit[] = [];
  const parser = new GitLogParser((commit) => commits.push(commit));
  parser.push(buffer);
  parser.end();
  return commits;
}
