import type { ChangeDetail, HistoryPayload, MergeDiffMode } from './types';

export class ApiError extends Error {
  constructor(message: string, readonly kind: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(`Сервер вернул не-JSON (${response.status})`, 'bad-response');
  }
  if (!response.ok) {
    const body = parsed as { error?: string; kind?: string } | null;
    throw new ApiError(body?.error ?? `Ошибка ${response.status}`, body?.kind ?? 'http');
  }
  return parsed as T;
}

export function fetchHistory(
  repoPath: string,
  opts: { limit: number; mergeDiff: MergeDiffMode },
  signal?: AbortSignal,
): Promise<HistoryPayload> {
  const params = new URLSearchParams({
    path: repoPath,
    limit: String(opts.limit),
    mergeDiff: opts.mergeDiff,
  });
  return get<HistoryPayload>(`/api/history?${params.toString()}`, signal);
}

export function fetchChangeDetail(
  key: string,
  changeIndex: number,
  signal?: AbortSignal,
): Promise<ChangeDetail> {
  const params = new URLSearchParams({ key, changeIndex: String(changeIndex) });
  return get<ChangeDetail>(`/api/change?${params.toString()}`, signal);
}
