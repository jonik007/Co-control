import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LruCache } from './cache.js';
import { GitError } from './git/exec.js';
import { buildHistory, type History, type MergeDiffMode } from './git/history.js';
import { inspectRepo, readChangeDetail } from './git/repo.js';
import { PathRejected, resolveRepoPath } from './security.js';

const MAX_LIMIT = Number(process.env.GITGANTT_MAX_COMMITS ?? 20_000);
const DEFAULT_LIMIT = Number(process.env.GITGANTT_DEFAULT_COMMITS ?? 2_000);

const historyCache = new LruCache<History>(4);

function clampLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function mergeMode(value: unknown): MergeDiffMode {
  return value === 'first-parent' ? 'first-parent' : 'none';
}

function fail(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof PathRejected) {
    return reply.code(400).send({ error: err.message, kind: 'path' });
  }
  if (err instanceof GitError) {
    const status = err.kind === 'not-a-repo' ? 400 : err.kind === 'timeout' ? 504 : 500;
    return reply.code(status).send({ error: err.message, kind: err.kind });
  }
  const message = err instanceof Error ? err.message : String(err);
  return reply.code(500).send({ error: message, kind: 'unknown' });
}

/** Lets an aborted HTTP request kill the git child process instead of leaking it. */
function requestSignal(request: FastifyRequest): AbortSignal {
  const controller = new AbortController();
  request.raw.on('close', () => {
    if (!request.raw.readableEnded) controller.abort();
  });
  return controller.signal;
}

export function registerRoutes(app: FastifyInstance): void {
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/repo', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    try {
      const dir = await resolveRepoPath(query.path);
      const info = await inspectRepo(dir, requestSignal(request));
      if (info.head === null) {
        return reply.code(400).send({
          error: 'В репозитории пока нет коммитов — рисовать нечего',
          kind: 'empty-repo',
        });
      }
      return info;
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get('/api/history', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    try {
      const dir = await resolveRepoPath(query.path);
      const signal = requestSignal(request);
      const info = await inspectRepo(dir, signal);
      if (info.head === null) {
        return reply.code(400).send({ error: 'В репозитории пока нет коммитов', kind: 'empty-repo' });
      }

      const limit = clampLimit(query.limit);
      const mergeDiff = mergeMode(query.mergeDiff);
      const key = `${info.root}\u0000${info.head}\u0000${limit}\u0000${mergeDiff}`;

      const cached = historyCache.get(key);
      if (cached) return cached.payload;

      const history = await buildHistory(info.root, info.head, info.branch, {
        limit,
        mergeDiff,
        signal,
      });
      historyCache.set(key, history);
      return history.payload;
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get('/api/change', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    try {
      const key = typeof query.key === 'string' ? query.key : '';
      const changeIndex = Number(query.changeIndex);
      const history = historyCache.get(key);
      if (!history) {
        return reply.code(409).send({
          error: 'История больше не в кеше сервера, перезагрузите диаграмму',
          kind: 'stale-key',
        });
      }
      const change = history.payload.changes[changeIndex];
      const paths = history.changePaths[changeIndex];
      if (!change || !paths) {
        return reply.code(404).send({ error: 'Изменение не найдено', kind: 'not-found' });
      }
      const commit = history.payload.commits[change.c];
      if (!commit) {
        return reply.code(404).send({ error: 'Коммит не найден', kind: 'not-found' });
      }
      const detail = await readChangeDetail(
        history.payload.repo.root,
        commit.sha,
        { ...paths, isMerge: commit.isMerge },
        requestSignal(request),
      );
      return { ...detail, change, fileId: change.f };
    } catch (err) {
      return fail(reply, err);
    }
  });
}
