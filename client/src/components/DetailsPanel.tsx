import { useEffect, useState } from 'react';
import { ApiError, fetchChangeDetail } from '../api';
import { STATUS_LABEL } from '../lib/ext';
import { formatDateTime } from '../lib/scales';
import type { ChangeDetail, HistoryPayload } from '../types';
import type { CellSelection } from './Diagram';

interface DetailsPanelProps {
  history: HistoryPayload;
  selection: CellSelection | null;
  onClose: () => void;
}

export function DetailsPanel({ history, selection, onClose }: DetailsPanelProps) {
  const [detail, setDetail] = useState<ChangeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const changeIndex = selection?.changeIndex ?? -1;

  useEffect(() => {
    if (changeIndex < 0) {
      setDetail(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchChangeDetail(history.key, changeIndex, controller.signal)
      .then((result) => setDetail(result))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setDetail(null);
        setError(err instanceof ApiError ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [changeIndex, history.key]);

  if (!selection) return null;

  const commit = history.commits[selection.commit];
  const change = history.changes[selection.changeIndex];
  const file = change ? history.files.find((f) => f.id === change.f) : undefined;
  const siblings = selection.changeIndices.slice(1);

  return (
    <aside className="details">
      <div className="details-head">
        <strong>Изменение</strong>
        <button type="button" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
      </div>

      {commit && (
        <dl className="details-list">
          <dt>Коммит</dt>
          <dd>
            <code>{commit.sha}</code>
          </dd>
          <dt>Сообщение</dt>
          <dd>{commit.subject}</dd>
          <dt>Автор</dt>
          <dd>
            {commit.authorName} &lt;{commit.authorEmail}&gt;
          </dd>
          <dt>Дата автора</dt>
          <dd>{formatDateTime(commit.authorDate)}</dd>
          <dt>Дата коммита</dt>
          <dd>
            {formatDateTime(commit.commitDate)}
            {commit.commitDate !== commit.authorDate && (
              <span className="warn" title="Обычно следствие rebase или cherry-pick">
                {' '}
                расходится с датой автора
              </span>
            )}
          </dd>
          {commit.isMerge && (
            <>
              <dt>Мерж</dt>
              <dd>{commit.parents.length} родителя</dd>
            </>
          )}
        </dl>
      )}

      {file && (
        <dl className="details-list">
          <dt>Файл</dt>
          <dd>
            <code>{file.path}</code>
          </dd>
          <dt>Статус</dt>
          <dd>
            {STATUS_LABEL[change?.s ?? ''] ?? change?.s}
            {change?.score !== undefined && <span className="muted"> · схожесть {change.score}%</span>}
          </dd>
          {change?.from && (
            <>
              <dt>Прежний путь</dt>
              <dd>
                <code>{change.from}</code>
              </dd>
            </>
          )}
          {file.aliases.length > 0 && (
            <>
              <dt>История путей</dt>
              <dd>
                {file.aliases.map((alias) => (
                  <code key={alias} className="alias">
                    {alias}
                  </code>
                ))}
              </dd>
            </>
          )}
          {file.bornBeforeWindow && (
            <>
              <dt>Внимание</dt>
              <dd className="warn">Файл создан раньше показанного окна истории</dd>
            </>
          )}
        </dl>
      )}

      {loading && <p className="muted">Загружаю diff…</p>}
      {error && <p className="error-text">{error}</p>}

      {detail && (
        <>
          <dl className="details-list">
            <dt>Строк</dt>
            <dd>
              {detail.binary ? (
                'бинарный файл'
              ) : (
                <>
                  <span className="added">+{detail.added ?? 0}</span>{' '}
                  <span className="deleted">−{detail.deleted ?? 0}</span>
                </>
              )}
            </dd>
          </dl>
          {detail.body && <pre className="details-body">{detail.body}</pre>}
          {detail.diff && (
            <pre className="details-diff">
              {detail.diff}
              {detail.diffTruncated && '\n… diff обрезан'}
            </pre>
          )}
        </>
      )}

      {siblings.length > 0 && (
        <div className="details-siblings">
          <strong>Ещё файлов в этой папке за этот коммит: {siblings.length}</strong>
          <ul>
            {siblings.slice(0, 50).map((index) => {
              const sibling = history.changes[index];
              const siblingFile = sibling ? history.files.find((f) => f.id === sibling.f) : undefined;
              return (
                <li key={index}>
                  <code>{siblingFile?.path ?? '?'}</code>{' '}
                  <span className="muted">{STATUS_LABEL[sibling?.s ?? ''] ?? sibling?.s}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}
