import type { Change, Commit, DateMode, FileEntry } from '../types';
import { extStyle } from './ext';
import { commitsInRange, commitTime, formatDate, type XAxis } from './scales';
import type { TreeNode } from './tree';

export interface RowChange {
  c: number;
  idx: number;
}

export interface Cell {
  row: number;
  commit: number;
  changeIndex: number;
}

export const THEME = {
  bg: '#0d1117',
  rowEven: '#0d1117',
  rowOdd: '#11161d',
  rowHover: '#1b222c',
  grid: '#1c2230',
  gridStrong: '#2a3243',
  folderBar: '#3a4457',
  folderMarker: '#8b98ab',
  axisText: '#8b949e',
  mergeTick: '#d29922',
  highlight: '#58a6ff',
};

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  scrollLeft: number;
  scrollTop: number;
  rowH: number;
  rows: readonly TreeNode[];
  axis: XAxis;
  commits: readonly Commit[];
  files: readonly FileEntry[];
  fileById: ReadonlyMap<number, FileEntry>;
  rowChanges: readonly RowChange[][];
  changes: readonly Change[];
  hover: Cell | null;
  selected: Cell | null;
  hoverRow: number;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && color.length === 7) {
    const value = Number.parseInt(color.slice(1), 16);
    const r = (value >> 16) & 0xff;
    const g = (value >> 8) & 0xff;
    const b = value & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (color.startsWith('hsl(')) return color.replace('hsl(', 'hsla(').replace(')', ` / ${alpha})`);
  return color;
}

function markerShape(
  ctx: CanvasRenderingContext2D,
  status: string,
  cx: number,
  cy: number,
  size: number,
): void {
  const half = size / 2;
  switch (status) {
    case 'A':
      ctx.beginPath();
      ctx.rect(cx - half, cy - half, size, size);
      ctx.fill();
      break;
    case 'D':
      ctx.beginPath();
      ctx.moveTo(cx - half, cy - half);
      ctx.lineTo(cx + half, cy + half);
      ctx.moveTo(cx + half, cy - half);
      ctx.lineTo(cx - half, cy + half);
      ctx.lineWidth = Math.max(1.2, size / 4);
      ctx.stroke();
      break;
    case 'R':
      ctx.beginPath();
      ctx.moveTo(cx, cy - half);
      ctx.lineTo(cx + half, cy);
      ctx.lineTo(cx, cy + half);
      ctx.lineTo(cx - half, cy);
      ctx.closePath();
      ctx.fill();
      break;
    case 'C':
      ctx.beginPath();
      ctx.moveTo(cx, cy - half);
      ctx.lineTo(cx + half, cy + half);
      ctx.lineTo(cx - half, cy + half);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      ctx.beginPath();
      ctx.arc(cx, cy, half, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

export function renderDiagram(input: RenderInput): void {
  const { ctx, width, height, scrollLeft, scrollTop, rowH, rows, axis } = input;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, width, height);

  const firstRow = Math.max(0, Math.floor(scrollTop / rowH));
  const lastRow = Math.min(rows.length - 1, Math.ceil((scrollTop + height) / rowH));
  const contentFrom = scrollLeft - 16;
  const contentTo = scrollLeft + width + 16;
  const visibleCommits = commitsInRange(axis, contentFrom, contentTo);

  // Row stripes.
  for (let row = firstRow; row <= lastRow; row += 1) {
    const y = row * rowH - scrollTop;
    ctx.fillStyle = row === input.hoverRow ? THEME.rowHover : row % 2 === 0 ? THEME.rowEven : THEME.rowOdd;
    ctx.fillRect(0, y, width, rowH);
  }

  // Commit grid. Drawing every column becomes noise once they are dense.
  if (axis.pxPerCommit >= 6) {
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const index of visibleCommits) {
      const x = Math.round(axis.commitX[index]! - scrollLeft) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    ctx.stroke();
  }

  // Hovered / selected commit column.
  for (const cell of [input.hover, input.selected]) {
    if (!cell) continue;
    const x = axis.commitX[cell.commit];
    if (x === undefined) continue;
    ctx.fillStyle = withAlpha(THEME.highlight, cell === input.selected ? 0.18 : 0.1);
    const w = Math.max(2, axis.pxPerCommit);
    ctx.fillRect(x - scrollLeft - w / 2, 0, w, height);
  }

  const barH = Math.max(4, rowH - 9);
  const markerSize = Math.min(rowH - 6, Math.max(3.5, axis.pxPerCommit - 1.5));
  const dense = axis.pxPerCommit < 2.5;

  for (let row = firstRow; row <= lastRow; row += 1) {
    const node = rows[row];
    if (!node) continue;
    const y = row * rowH - scrollTop;
    const barY = y + (rowH - barH) / 2;

    if (node.isDir) {
      drawBar(ctx, axis, scrollLeft, node.firstCommit, node.lastCommit, barY, barH, THEME.folderBar, 0.55, false);
    } else {
      const file = input.fileById.get(node.fileId);
      const style = extStyle(node.ext);
      if (file) {
        for (const [start, end] of file.spans) {
          drawBar(ctx, axis, scrollLeft, start, end, barY, barH, style.color, 0.3, file.bornBeforeWindow);
        }
      }
    }

    const rowMarkers = input.rowChanges[row];
    if (!rowMarkers || rowMarkers.length === 0) continue;
    const cy = y + rowH / 2;
    const color = node.isDir ? THEME.folderMarker : extStyle(node.ext).color;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    for (const marker of rowMarkers) {
      const x = axis.commitX[marker.c];
      if (x === undefined || x < contentFrom || x > contentTo) continue;
      const sx = x - scrollLeft;
      if (dense) {
        ctx.fillRect(sx - 0.5, cy - markerSize / 2, 1.4, markerSize);
        continue;
      }
      const status = node.isDir ? 'M' : input.changes[marker.idx]?.s ?? 'M';
      markerShape(ctx, status, sx, cy, markerSize);
    }
  }

  // Rings for hover and selection are drawn last so nothing covers them.
  for (const cell of [input.hover, input.selected]) {
    if (!cell) continue;
    const x = axis.commitX[cell.commit];
    if (x === undefined) continue;
    const cy = cell.row * rowH + rowH / 2 - scrollTop;
    ctx.strokeStyle = THEME.highlight;
    ctx.lineWidth = cell === input.selected ? 2 : 1.2;
    ctx.beginPath();
    ctx.arc(x - scrollLeft, cy, Math.max(5, markerSize * 0.85), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  axis: XAxis,
  scrollLeft: number,
  startIdx: number,
  endIdx: number,
  y: number,
  h: number,
  color: string,
  alpha: number,
  openLeft: boolean,
): void {
  const a = axis.commitX[startIdx];
  const b = axis.commitX[endIdx];
  if (a === undefined || b === undefined) return;
  // Commit dates are not monotonic with topological index, so in time mode the
  // span end can sit left of its start.
  const left = Math.min(a, b) - scrollLeft;
  const right = Math.max(a, b) - scrollLeft;
  const w = Math.max(right - left, 2);

  ctx.fillStyle = withAlpha(color, alpha);
  roundRect(ctx, left, y, w, h, 3);
  ctx.fill();
  ctx.strokeStyle = withAlpha(color, Math.min(1, alpha + 0.35));
  ctx.lineWidth = 1;
  ctx.stroke();

  if (openLeft) {
    ctx.strokeStyle = withAlpha(color, 0.9);
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left, y + h);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export interface AxisRenderInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  scrollLeft: number;
  axis: XAxis;
  commits: readonly Commit[];
  dateMode: DateMode;
  hoverCommit: number;
  selectedCommit: number;
}

export function renderAxis(input: AxisRenderInput): void {
  const { ctx, width, height, scrollLeft, axis, commits } = input;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0a0e14';
  ctx.fillRect(0, 0, width, height);

  const contentFrom = scrollLeft - 16;
  const contentTo = scrollLeft + width + 16;
  const visible = commitsInRange(axis, contentFrom, contentTo);

  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'alphabetic';

  // Date labels roughly every 120 px, taken from the commit nearest that spot.
  const step = 120;
  let lastLabel = '';
  ctx.fillStyle = THEME.axisText;
  for (let x = Math.floor(contentFrom / step) * step; x < contentTo; x += step) {
    let best = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const index of visible) {
      const dist = Math.abs(axis.commitX[index]! - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    }
    if (best < 0 || bestDist > step) continue;
    const commit = commits[best];
    if (!commit) continue;
    const label = formatDate(commitTime(commit, input.dateMode));
    if (label === lastLabel) continue;
    lastLabel = label;
    const sx = axis.commitX[best]! - scrollLeft;
    ctx.strokeStyle = THEME.gridStrong;
    ctx.beginPath();
    ctx.moveTo(Math.round(sx) + 0.5, height - 14);
    ctx.lineTo(Math.round(sx) + 0.5, height);
    ctx.stroke();
    ctx.fillText(label, sx + 3, 14);
  }

  // Per-commit ticks; merges get a taller, warmer tick because they carry no
  // file changes in the default mode and would otherwise look like empty gaps.
  for (const index of visible) {
    const commit = commits[index];
    if (!commit) continue;
    const sx = Math.round(axis.commitX[index]! - scrollLeft) + 0.5;
    const isMerge = commit.isMerge;
    const tickH = isMerge ? 14 : 8;
    ctx.strokeStyle = isMerge ? THEME.mergeTick : THEME.axisText;
    ctx.lineWidth = Math.min(2, Math.max(1, axis.pxPerCommit - 2));
    ctx.beginPath();
    ctx.moveTo(sx, height - tickH);
    ctx.lineTo(sx, height - 1);
    ctx.stroke();
  }

  for (const [index, weight] of [
    [input.selectedCommit, 2],
    [input.hoverCommit, 1.2],
  ] as const) {
    if (index < 0) continue;
    const x = axis.commitX[index];
    if (x === undefined) continue;
    ctx.strokeStyle = THEME.highlight;
    ctx.lineWidth = weight;
    ctx.beginPath();
    ctx.moveTo(x - scrollLeft, 0);
    ctx.lineTo(x - scrollLeft, height);
    ctx.stroke();
  }

  ctx.strokeStyle = THEME.gridStrong;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - 0.5);
  ctx.lineTo(width, height - 0.5);
  ctx.stroke();
}
