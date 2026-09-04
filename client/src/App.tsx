import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, fetchHistory } from './api';
import { Diagram, type CellSelection } from './components/Diagram';
import { DetailsPanel } from './components/DetailsPanel';
import { Legend } from './components/Legend';
import { Toolbar, type Options } from './components/Toolbar';
import { buildXAxis } from './lib/scales';
import { buildTree, defaultExpanded, layoutRows } from './lib/tree';
import type { HistoryPayload } from './types';

const STORAGE_KEY = 'git-gantt:repo-path';

const DEFAULT_OPTIONS: Options = {
  limit: 2000,
  mergeDiff: 'none',
  dateMode: 'author',
  xScale: 'ordinal',
  rowH: 20,
};

export function App() {
  const [repoPath, setRepoPath] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '');
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<CellSelection | null>(null);
  const [pxPerCommit, setPxPerCommit] = useState(10);

  const load = useCallback(
    (path: string, opts: Options) => {
      if (path === '') return;
      setLoading(true);
      setError(null);
      setSelected(null);
      fetchHistory(path, { limit: opts.limit, mergeDiff: opts.mergeDiff })
        .then((payload) => {
          setHistory(payload);
          localStorage.setItem(STORAGE_KEY, path);
          const tree = buildTree(payload.files);
          setExpanded(defaultExpanded(tree, 400));
        })
        .catch((err: unknown) => {
          setHistory(null);
          setError(err instanceof ApiError ? err.message : String(err));
        })
        .finally(() => setLoading(false));
    },
    [],
  );

  const onLoad = useCallback(
    (path: string) => {
      setRepoPath(path);
      load(path, options);
    },
    [load, options],
  );

  const onOptions = useCallback(
    (patch: Partial<Options>) => {
      setOptions((prev) => {
        const next = { ...prev, ...patch };
        // Merge handling changes what the server computes. The commit limit does
        // too, but it is typed digit by digit, so it waits for an explicit
        // "Построить" instead of firing a request per keystroke.
        if (history && repoPath && next.mergeDiff !== prev.mergeDiff) {
          load(repoPath, next);
        }
        return next;
      });
    },
    [history, load, repoPath],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tree = useMemo(() => (history ? buildTree(history.files) : null), [history]);

  const layout = useMemo(() => {
    if (!tree || !history) return null;
    const maxId = history.files.reduce((max, file) => Math.max(max, file.id), -1);
    return layoutRows(tree, expanded, maxId + 1);
  }, [expanded, history, tree]);

  const axis = useMemo(
    () =>
      history
        ? buildXAxis(history.commits, options.xScale, options.dateMode, pxPerCommit)
        : null,
    [history, options.dateMode, options.xScale, pxPerCommit],
  );

  const onToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    setSelected(null);
  }, []);

  return (
    <div className="app">
      <Toolbar
        repoPath={repoPath}
        loading={loading}
        options={options}
        history={history}
        onLoad={onLoad}
        onOptions={onOptions}
      />

      {error && <div className="banner error">{error}</div>}

      {!history && !error && (
        <div className="empty">
          <h1>Временная диаграмма изменений git</h1>
          <p>
            Укажите каталог с git-репозиторием. По горизонтали — коммиты, по вертикали — дерево
            файлов и папок. Точка на пересечении означает, что коммит затронул файл; полоса —
            время его жизни в репозитории.
          </p>
          <p className="muted">
            Сервер читает историю локально через git и слушает только 127.0.0.1.
          </p>
        </div>
      )}

      {history && layout && axis && (
        <main className="workspace">
          <Diagram
            history={history}
            rows={layout.rows}
            rowForFile={layout.rowForFile}
            axis={axis}
            rowH={options.rowH}
            dateMode={options.dateMode}
            expanded={expanded}
            selected={selected}
            onToggle={onToggle}
            onSelect={setSelected}
            onPxPerCommitChange={setPxPerCommit}
          />
          {selected && (
            <DetailsPanel history={history} selection={selected} onClose={() => setSelected(null)} />
          )}
        </main>
      )}

      {history && <Legend />}
    </div>
  );
}
