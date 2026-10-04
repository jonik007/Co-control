import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { extStyle } from '../lib/ext';
import { renderAxis, renderDiagram, type Cell, type RowChange } from '../lib/render';
import { nearestCommit, type XAxis } from '../lib/scales';
import type { TreeNode } from '../lib/tree';
import type { DateMode, HistoryPayload } from '../types';

const TREE_WIDTH = 340;
const AXIS_HEIGHT = 34;

export interface CellSelection extends Cell {
  /** Every change in the cell; a collapsed folder cell holds many. */
  changeIndices: number[];
}

interface DiagramProps {
  history: HistoryPayload;
  rows: readonly TreeNode[];
  rowForFile: Int32Array;
  axis: XAxis;
  rowH: number;
  dateMode: DateMode;
  expanded: ReadonlySet<string>;
  selected: CellSelection | null;
  onToggle: (path: string) => void;
  onSelect: (cell: CellSelection | null) => void;
  onPxPerCommitChange: (next: number) => void;
}

export function Diagram({
  history,
  rows,
  rowForFile,
  axis,
  rowH,
  dateMode,
  expanded,
  selected,
  onToggle,
  onSelect,
  onPxPerCommitChange,
}: DiagramProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const axisCanvasRef = useRef<HTMLCanvasElement>(null);
  const zoomAnchor = useRef<{ contentX: number; offsetX: number } | null>(null);

  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [size, setSize] = useState({ width: 800, height: 500 });
  const [hover, setHover] = useState<CellSelection | null>(null);
  const [hoverRow, setHoverRow] = useState(-1);

  const fileById = useMemo(() => new Map(history.files.map((file) => [file.id, file])), [history.files]);

  /**
   * Changes bucketed by visible row and sorted by commit. Rebuilt only when the
   * row layout changes, which keeps both drawing and hit-testing proportional
   * to what is on screen instead of to the whole history.
   */
  const rowChanges = useMemo<RowChange[][]>(() => {
    const buckets: RowChange[][] = Array.from({ length: rows.length }, () => []);
    history.changes.forEach((change, idx) => {
      const row = rowForFile[change.f] ?? -1;
      if (row < 0 || row >= buckets.length) return;
      buckets[row]!.push({ c: change.c, idx });
    });
    for (const bucket of buckets) bucket.sort((a, b) => a.c - b.c || a.idx - b.idx);
    return buckets;
  }, [history.changes, rowForFile, rows.length]);

  useLayoutEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  // Keep the commit under the cursor put while zooming the time axis.
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    const element = scrollerRef.current;
    if (!anchor || !element) return;
    zoomAnchor.current = null;
    element.scrollLeft = Math.max(0, anchor.contentX - anchor.offsetX);
    setScroll({ left: element.scrollLeft, top: element.scrollTop });
  }, [axis]);

  const onScroll = useCallback(() => {
    const element = scrollerRef.current;
    if (!element) return;
    setScroll({ left: element.scrollLeft, top: element.scrollTop });
  }, []);

  const canvasWidth = Math.max(0, size.width - TREE_WIDTH);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasWidth <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderDiagram({
      ctx,
      width: canvasWidth,
      height: size.height,
      scrollLeft: scroll.left,
      scrollTop: scroll.top,
      rowH,
      rows,
      axis,
      commits: history.commits,
      files: history.files,
      fileById,
      rowChanges,
      changes: history.changes,
      hover,
      selected,
      hoverRow,
    });
  }, [
    axis,
    canvasWidth,
    fileById,
    history.changes,
    history.commits,
    history.files,
    hover,
    hoverRow,
    rowChanges,
    rowH,
    rows,
    scroll.left,
    scroll.top,
    selected,
    size.height,
  ]);

  useEffect(() => {
    const canvas = axisCanvasRef.current;
    if (!canvas || canvasWidth <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(AXIS_HEIGHT * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderAxis({
      ctx,
      width: canvasWidth,
      height: AXIS_HEIGHT,
      scrollLeft: scroll.left,
      axis,
      commits: history.commits,
      dateMode,
      hoverCommit: hover?.commit ?? -1,
      selectedCommit: selected?.commit ?? -1,
    });
  }, [axis, canvasWidth, dateMode, history.commits, hover, scroll.left, selected]);

  const cellAt = useCallback(
    (clientX: number, clientY: number): CellSelection | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const contentX = clientX - rect.left + scroll.left;
      const row = Math.floor((clientY - rect.top + scroll.top) / rowH);
      if (row < 0 || row >= rows.length) return null;
      const tolerance = Math.max(4, axis.pxPerCommit / 2 + 2);
      const commit = nearestCommit(axis, contentX, tolerance);
      if (commit < 0) return null;

      const bucket = rowChanges[row];
      if (!bucket || bucket.length === 0) return null;
      let lo = 0;
      let hi = bucket.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (bucket[mid]!.c < commit) lo = mid + 1;
        else hi = mid;
      }
      if (lo >= bucket.length || bucket[lo]!.c !== commit) return null;
      const changeIndices: number[] = [];
      for (let k = lo; k < bucket.length && bucket[k]!.c === commit; k += 1) {
        changeIndices.push(bucket[k]!.idx);
      }
      return { row, commit, changeIndex: changeIndices[0]!, changeIndices };
    },
    [axis, rowChanges, rowH, rows.length, scroll.left, scroll.top],
  );

  const onCanvasMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setHoverRow(Math.floor((event.clientY - rect.top + scroll.top) / rowH));
      }
      setHover(cellAt(event.clientX, event.clientY));
    },
    [cellAt, rowH, scroll.top],
  );

  const onCanvasLeave = useCallback(() => {
    setHover(null);
    setHoverRow(-1);
  }, []);

  const onCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      onSelect(cellAt(event.clientX, event.clientY));
    },
    [cellAt, onSelect],
  );

  const onWheelZoom = useCallback(
    (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const factor = event.deltaY < 0 ? 1.25 : 0.8;
      const next = Math.min(60, Math.max(0.6, axis.pxPerCommit * factor));
      if (next === axis.pxPerCommit) return;
      const contentX = offsetX + scroll.left;
      zoomAnchor.current = { contentX: (contentX / axis.pxPerCommit) * next, offsetX };
      onPxPerCommitChange(next);
    },
    [axis.pxPerCommit, onPxPerCommitChange, scroll.left],
  );

  const zoomRef = useRef(onWheelZoom);
  useEffect(() => {
    zoomRef.current = onWheelZoom;
  }, [onWheelZoom]);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    // React registers wheel handlers as passive, which makes preventDefault() a
    // no-op there, so Ctrl+wheel would zoom the whole page instead of the axis.
    const listener = (event: WheelEvent) => zoomRef.current(event);
    element.addEventListener('wheel', listener, { passive: false });
    return () => element.removeEventListener('wheel', listener);
  }, []);

  const firstRow = Math.max(0, Math.floor(scroll.top / rowH) - 2);
  const lastRow = Math.min(rows.length - 1, Math.ceil((scroll.top + size.height) / rowH) + 2);
  const visibleRows: TreeNode[] = [];
  for (let i = firstRow; i <= lastRow; i += 1) {
    const node = rows[i];
    if (node) visibleRows.push(node);
  }

  const hoveredPath = hover ? rows[hover.row]?.path : undefined;

  return (
    <div className="diagram">
      <div className="diagram-head">
        <div className="diagram-head-tree" style={{ width: TREE_WIDTH }}>
          <span>
            {rows.length} строк · {history.meta.fileCount} файлов
          </span>
        </div>
        <canvas
          ref={axisCanvasRef}
          className="axis-canvas"
          style={{ width: canvasWidth, height: AXIS_HEIGHT }}
        />
      </div>

      <div className="scroller" ref={scrollerRef} onScroll={onScroll}>
        <div
          className="scroll-content"
          style={{ width: TREE_WIDTH + axis.totalWidth, height: rows.length * rowH }}
        >
          <div className="sticky-viewport" style={{ width: size.width, height: size.height }}>
            <canvas
              ref={canvasRef}
              className="grid-canvas"
              style={{ left: TREE_WIDTH, width: canvasWidth, height: size.height }}
              onMouseMove={onCanvasMove}
              onMouseLeave={onCanvasLeave}
              onClick={onCanvasClick}
            />
            <div className="tree-col" style={{ width: TREE_WIDTH, height: size.height }}>
              {visibleRows.map((node, i) => {
                const row = firstRow + i;
                const style = extStyle(node.ext);
                return (
                  <div
                    key={node.path}
                    className={
                      'tree-row' +
                      (row === hoverRow ? ' is-hover' : '') +
                      (selected?.row === row ? ' is-selected' : '')
                    }
                    style={{ top: row * rowH - scroll.top, height: rowH }}
                    onMouseEnter={() => setHoverRow(row)}
                    title={node.path}
                  >
                    <span className="tree-indent" style={{ width: node.depth * 12 }} />
                    {node.isDir ? (
                      <button
                        type="button"
                        className="tree-chevron"
                        onClick={() => onToggle(node.path)}
                        aria-expanded={expanded.has(node.path)}
                      >
                        {expanded.has(node.path) ? '▾' : '▸'}
                      </button>
                    ) : (
                      <span className="tree-badge" style={{ color: style.color, borderColor: style.color }}>
                        {style.badge}
                      </span>
                    )}
                    <span className={node.isDir ? 'tree-name is-dir' : 'tree-name'}>{node.name}</span>
                    {node.isDir && <span className="tree-count">{node.fileCount}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="diagram-status">
        {hover ? (
          <>
            <code>{history.commits[hover.commit]?.short}</code>
            <span>{history.commits[hover.commit]?.subject}</span>
            <span className="muted">{hoveredPath}</span>
            {hover.changeIndices?.length > 1 && (
              <span className="muted">+{hover.changeIndices.length - 1} файлов в папке</span>
            )}
          </>
        ) : (
          <span className="muted">
            Ctrl + колесо — масштаб по времени. Наведите на точку пересечения, кликните для деталей.
          </span>
        )}
      </div>
    </div>
  );
}
