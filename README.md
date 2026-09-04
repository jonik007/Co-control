# Co-control

Репозиторий содержит несколько локальных утилит:

| Каталог | Описание |
|---|---|
| [`git-gantt/`](git-gantt/) | Временная диаграмма изменений git-репозитория (коммиты × дерево файлов) |
| Docker Web Console | Веб-консоль управления Docker-контейнерами (в корне после слияния с `main`) |

## Git Gantt

```bash
cd git-gantt
npm install
npm run dev
```

Откройте http://127.0.0.1:5317 и укажите путь к репозиторию. Подробности — в [`git-gantt/README.md`](git-gantt/README.md) и [`git-gantt/docs/PITFALLS.md`](git-gantt/docs/PITFALLS.md).
