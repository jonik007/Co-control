# Архитектура

Решения приняты по итогам анализа в `docs/PITFALLS.md`.

```
┌─────────────────────────┐        HTTP (127.0.0.1)        ┌──────────────────────────┐
│  client/  React + Vite  │ ─────────────────────────────► │  server/  Node + Fastify │
│                         │                                │                          │
│  • дерево (DOM, вирт.)  │  GET /api/repo?path=…          │  • валидация пути        │
│  • канва (Canvas 2D)    │  GET /api/history?path=…       │  • spawn git (без shell) │
│  • панель деталей       │  GET /api/change?…             │  • стриминговый парсер   │
└─────────────────────────┘                                │  • склейка переименований│
                                                            │  • LRU-кеш по HEAD sha   │
                                                            └────────────┬─────────────┘
                                                                         │ spawn
                                                                    ┌────▼─────┐
                                                                    │ git CLI  │
                                                                    └──────────┘
```

## Почему так

| Решение | Причина |
|---|---|
| git через CLI + свой парсер | `nodegit` — нативная сборка (боль на Windows), `isomorphic-git` — медленный на больших историях |
| Один вызов `git log` на весь запрос | вызов git на каждый коммит превращает 5 000 коммитов в минуты ожидания |
| Canvas 2D для маркеров | ~40 000 маркеров в SVG/DOM — неработающий интерфейс |
| DOM для дерева файлов | нужны разворачивание, скролл, доступность; строк после свёртки немного |
| Разреженный список изменений в API | полная матрица — 15 млн ячеек на среднем репозитории |
| Байты пути хранятся на сервере | пути в git не гарантированно UTF-8; декодирование необратимо |

## Модель данных

Ключевая идея: **файл ≠ путь**. Файл — это идентичность со стабильным `id`,
набором путей за время жизни (`aliases`) и списком **отрезков жизни** (`spans`),
потому что файл может быть удалён и создан заново.

```ts
type Commit = {
  sha: string; short: string; parents: string[]; isMerge: boolean;
  authorName: string; authorEmail: string;
  authorDate: number;   // unix seconds
  commitDate: number;
  subject: string;
};

type FileEntry = {
  id: number;
  path: string;          // актуальный путь (последний известный)
  ext: string;           // '' для Makefile / LICENSE / dotfiles
  aliases: string[];     // прежние пути после переименований
  spans: Array<[number, number]>;  // [firstCommitIdx, lastCommitIdx], -1 = жив до конца
};

type Change = {
  c: number;             // индекс коммита в commits[]
  f: number;             // FileEntry.id
  s: 'A' | 'M' | 'D' | 'R' | 'C' | 'T';
  score?: number;        // схожесть для R/C
  from?: string;         // прежний путь для R/C
};
```

`commits` упорядочены от старых к новым, индекс в массиве = позиция по оси X.
`changes` — плоский разреженный список, только реальные пересечения.

## API

| Метод | Назначение |
|---|---|
| `GET /api/repo?path=…` | валидация: репозиторий ли это, HEAD, ветка, число коммитов |
| `GET /api/history?path=…&limit=…&mergeDiff=none\|first-parent` | коммиты + файлы + изменения |
| `GET /api/change?path=…&sha=…&fileId=…` | детали пересечения (numstat, diff), ленивая загрузка |

Детали по клику **не** входят в основной ответ: 40 000 дифов — это гигабайты.

## Безопасность

Реализовано в `server/src/git/exec.ts` и `server/src/security.ts`:

- `spawn` с массивом аргументов, `shell: false`, никогда не строка;
- `--` перед путями, отказ на пути, начинающиеся с `-`;
- bind только на `127.0.0.1`;
- allowlist корней через `GITGANTT_ALLOWED_ROOTS` (по умолчанию — без ограничений,
  так как сервер локальный; для сетевого развёртывания задать обязательно);
- подавление опасной конфигурации недоверенного репозитория:
  `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, `-c core.fsmonitor=`,
  `-c core.pager=cat`, `-c diff.external=`, `--no-optional-locks`;
- таймаут и `kill` дочернего процесса, лимит размера вывода.

## Структура

```
server/src/
  index.ts            запуск, bind на loopback
  routes.ts           HTTP-эндпоинты
  security.ts         валидация пути, allowlist
  git/exec.ts         безопасный spawn git
  git/repo.ts         rev-parse, обнаружение краевых случаев
  git/logParser.ts    стриминговый парсер `git log -z --name-status`
  git/history.ts      склейка переименований, отрезки жизни, кеш
client/src/
  lib/tree.ts         построение дерева, свёртка, агрегация по папкам
  lib/ext.ts          цвет и бейдж по расширению
  lib/scales.ts       шкалы ordinal / time
  components/         дерево, канва, оси, панель деталей
```
