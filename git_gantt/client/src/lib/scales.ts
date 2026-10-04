import type { Commit, DateMode, XScaleMode } from '../types';

export interface XAxis {
  mode: XScaleMode;
  /** Content-space centre of every commit column. */
  commitX: Float64Array;
  totalWidth: number;
  pxPerCommit: number;
  /**
   * Commit indices sorted by x. Needed because commit dates are not monotonic
   * with topological order (rebase, cherry-pick, wrong clocks), so binary
   * search over commitX itself would be invalid in time mode.
   */
  order: Uint32Array;
  tMin: number;
  tMax: number;
  padding: number;
}

export function commitTime(commit: Commit, mode: DateMode): number {
  return mode === 'author' ? commit.authorDate : commit.commitDate;
}

export function buildXAxis(
  commits: readonly Commit[],
  mode: XScaleMode,
  dateMode: DateMode,
  pxPerCommit: number,
): XAxis {
  const n = commits.length;
  const commitX = new Float64Array(n);
  const padding = Math.max(pxPerCommit, 12);
  const totalWidth = Math.max(n * pxPerCommit + padding * 2, 1);

  let tMin = Number.POSITIVE_INFINITY;
  let tMax = Number.NEGATIVE_INFINITY;
  for (const commit of commits) {
    const t = commitTime(commit, dateMode);
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
  }

  if (mode === 'time' && tMax > tMin) {
    const span = totalWidth - padding * 2;
    for (let i = 0; i < n; i += 1) {
      const t = commitTime(commits[i]!, dateMode);
      commitX[i] = padding + ((t - tMin) / (tMax - tMin)) * span;
    }
  } else {
    for (let i = 0; i < n; i += 1) {
      commitX[i] = padding + (i + 0.5) * pxPerCommit;
    }
  }

  const order = new Uint32Array(n);
  for (let i = 0; i < n; i += 1) order[i] = i;
  const sorted = Array.from(order).sort((a, b) => commitX[a]! - commitX[b]!);
  order.set(sorted);

  return { mode, commitX, totalWidth, pxPerCommit, order, tMin, tMax, padding };
}

/** First position in `order` whose x is >= target. */
function lowerBound(axis: XAxis, target: number): number {
  let lo = 0;
  let hi = axis.order.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (axis.commitX[axis.order[mid]!]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Commit indices whose column falls inside [from, to] in content space. */
export function commitsInRange(axis: XAxis, from: number, to: number): Uint32Array {
  const start = lowerBound(axis, from);
  const end = lowerBound(axis, to);
  return axis.order.subarray(start, end);
}

export function nearestCommit(axis: XAxis, x: number, tolerance: number): number {
  if (axis.order.length === 0) return -1;
  const at = lowerBound(axis, x);
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let k = at - 1; k <= at + 1; k += 1) {
    if (k < 0 || k >= axis.order.length) continue;
    const index = axis.order[k]!;
    const dist = Math.abs(axis.commitX[index]! - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  }
  return bestDist <= tolerance ? best : -1;
}

export function timeAtX(axis: XAxis, x: number): number | null {
  if (axis.mode !== 'time' || axis.tMax <= axis.tMin) return null;
  const span = axis.totalWidth - axis.padding * 2;
  if (span <= 0) return null;
  return axis.tMin + ((x - axis.padding) / span) * (axis.tMax - axis.tMin);
}

export function formatDate(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return '—';
  return new Date(unixSeconds * 1000).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDateTime(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return '—';
  return new Date(unixSeconds * 1000).toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
