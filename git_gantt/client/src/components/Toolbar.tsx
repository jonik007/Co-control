import { useState } from 'react';
import type { DateMode, HistoryPayload, MergeDiffMode, XScaleMode } from '../types';

export interface Options {
  limit: number;
  mergeDiff: MergeDiffMode;
  dateMode: DateMode;
  xScale: XScaleMode;
  rowH: number;
}

interface ToolbarProps {
  repoPath: string;
  loading: boolean;
  options: Options;
  history: HistoryPayload | null;
  onLoad: (repoPath: string) => void;
  onOptions: (patch: Partial<Options>) => void;
}

export function Toolbar({ repoPath, loading, options, history, onLoad, onOptions }: ToolbarProps) {
  const [draft, setDraft] = useState(repoPath);

  return (
    <header className="toolbar">
      <form
        className="toolbar-row"
        onSubmit={(event) => {
          event.preventDefault();
          onLoad(draft.trim());
        }}
      >
        <label className="field grow">
          <span>Каталог репозитория</span>
          <input
            name="repoPath"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="C:\Users\me\projects\my-app"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="field" title="Применяется при нажатии «Построить»">
          <span>Коммитов</span>
          <input
            name="limit"
            type="number"
            min={10}
            max={20000}
            value={options.limit}
            onChange={(event) => onOptions({ limit: Number(event.target.value) || 100 })}
          />
        </label>
        <button type="submit" disabled={loading || draft.trim() === ''}>
          {loading ? 'Читаю историю…' : 'Построить'}
        </button>
      </form>

      <div className="toolbar-row secondary">
        <label className="field inline">
          <span>Ось X</span>
          <select
            name="xScale"
            value={options.xScale}
            onChange={(event) => onOptions({ xScale: event.target.value as XScaleMode })}
          >
            <option value="time">по реальному времени</option>
            <option value="ordinal">по порядку коммитов</option>
          </select>
        </label>
        <label className="field inline">
          <span>Дата</span>
          <select
            name="dateMode"
            value={options.dateMode}
            onChange={(event) => onOptions({ dateMode: event.target.value as DateMode })}
          >
            <option value="author">автора</option>
            <option value="commit">коммита</option>
          </select>
        </label>
        <label className="field inline">
          <span>Мержи</span>
          <select
            name="mergeDiff"
            value={options.mergeDiff}
            onChange={(event) => onOptions({ mergeDiff: event.target.value as MergeDiffMode })}
            title="Присваивать — мерж показывает diff относительно первого родителя (влитые изменения)"
          >
            <option value="first-parent">присваивать влитые</option>
            <option value="none">не показывать изменения</option>
          </select>
        </label>
        <label className="field inline">
          <span>Высота строки</span>
          <input
            name="rowH"
            type="range"
            min={14}
            max={34}
            value={options.rowH}
            onChange={(event) => onOptions({ rowH: Number(event.target.value) })}
          />
        </label>

        {history && (
          <div className="meta">
            <code>{history.repo.branch ?? 'detached'}</code>
            <span>{history.meta.commitCount} коммитов</span>
            <span>{history.meta.changeCount} пересечений</span>
            <span>{history.meta.parseMs} мс</span>
            {history.meta.truncated && (
              <span className="warn" title="Показаны только последние коммиты">
                история обрезана лимитом
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
