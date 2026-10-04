import { spawn } from 'node:child_process';

/**
 * On Windows git is frequently not on PATH; let the operator point at it.
 */
export const GIT_BIN = process.env.GITGANTT_GIT_PATH?.trim() || 'git';

export const DEFAULT_TIMEOUT_MS = Number(process.env.GITGANTT_GIT_TIMEOUT_MS ?? 60_000);
export const DEFAULT_MAX_BYTES = Number(process.env.GITGANTT_GIT_MAX_BYTES ?? 256 * 1024 * 1024);

/**
 * A repository we did not write is untrusted input: its config can point
 * core.fsmonitor / core.pager / diff.external / textconv at an arbitrary
 * executable which git would then run for us. Neutralise those before every
 * invocation.
 */
const HARDENING: readonly string[] = [
  '--no-optional-locks',
  '-c',
  'core.fsmonitor=',
  '-c',
  'core.hooksPath=',
  '-c',
  'core.pager=cat',
  '-c',
  'core.quotePath=false',
  '-c',
  'diff.external=',
  '-c',
  'diff.noprefix=false',
];

function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // An inherited GIT_DIR/GIT_WORK_TREE would silently redirect every call.
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY']) {
    delete env[key];
  }
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_TERMINAL_PROMPT = '0';
  env.GIT_PAGER = 'cat';
  env.GIT_OPTIONAL_LOCKS = '0';
  // Keep git's own messages parseable regardless of the operator's locale.
  env.LC_ALL = 'C';
  return env;
}

export class GitError extends Error {
  readonly code: number | null;
  readonly stderr: string;
  readonly kind: 'not-a-repo' | 'dubious-ownership' | 'git-missing' | 'timeout' | 'too-large' | 'failed';

  constructor(message: string, opts: { code?: number | null; stderr?: string; kind?: GitError['kind'] }) {
    super(message);
    this.name = 'GitError';
    this.code = opts.code ?? null;
    this.stderr = opts.stderr ?? '';
    this.kind = opts.kind ?? 'failed';
  }
}

function classify(stderr: string, code: number | null): GitError {
  const text = stderr.trim();
  if (/not a git repository/i.test(text)) {
    return new GitError('Каталог не является git-репозиторием', { code, stderr: text, kind: 'not-a-repo' });
  }
  if (/dubious ownership/i.test(text)) {
    return new GitError(
      'Git отказался работать с каталогом: он принадлежит другому пользователю. ' +
        'Добавьте его в safe.directory: git config --global --add safe.directory <путь>',
      { code, stderr: text, kind: 'dubious-ownership' },
    );
  }
  return new GitError(text || `git завершился с кодом ${code}`, { code, stderr: text, kind: 'failed' });
}

export interface RunOptions {
  cwd: string;
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
}

/**
 * Streams git's stdout as raw chunks. Paths in git output are bytes, not
 * necessarily valid UTF-8, so callers get Buffers and decide how to decode.
 */
export function streamGit(
  args: readonly string[],
  opts: RunOptions,
  onChunk: (chunk: Buffer) => void,
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  return new Promise<void>((resolve, reject) => {
    const child = spawn(GIT_BIN, [...HARDENING, ...args], {
      cwd: opts.cwd,
      env: childEnv(),
      // Never true: a path like `C:\repo & calc.exe` would otherwise execute.
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let bytes = 0;
    let settled = false;

    const finish = (err: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (err) {
        child.kill('SIGKILL');
        reject(err);
      } else {
        resolve();
      }
    };

    const timer = setTimeout(() => {
      finish(new GitError(`git не ответил за ${timeoutMs} мс`, { kind: 'timeout' }));
    }, timeoutMs);

    const onAbort = () => finish(new GitError('Запрос отменён клиентом', { kind: 'failed' }));
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        finish(new GitError('Вывод git превысил допустимый размер', { kind: 'too-large' }));
        return;
      }
      try {
        onChunk(chunk);
      } catch (err) {
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 16_384) stderr += chunk.toString('utf8');
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        finish(
          new GitError(
            `Не найден исполняемый файл git ("${GIT_BIN}"). Укажите путь через GITGANTT_GIT_PATH.`,
            { kind: 'git-missing' },
          ),
        );
      } else {
        finish(err);
      }
    });

    child.on('close', (code) => {
      if (code === 0) finish(null);
      else finish(classify(stderr, code));
    });
  });
}

export async function runGit(args: readonly string[], opts: RunOptions): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await streamGit(args, opts, (chunk) => chunks.push(chunk));
  return Buffer.concat(chunks);
}

export async function runGitText(args: readonly string[], opts: RunOptions): Promise<string> {
  return (await runGit(args, opts)).toString('utf8');
}
