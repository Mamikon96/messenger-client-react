# messenger-client-react

Клиент мессенджера на React (Create React App). Бэкенд — отдельный проект `messenger-server`; контракт API — `docs/client-integration.md` (локальная копия, в `.gitignore`, FE-D12). Состояние живёт в Redux в памяти браузера.

## Стек
React 18, react-scripts 5 (CRA), JavaScript (без TypeScript), Redux Toolkit 2 + react-redux 9, Jest + Testing Library (unit), Playwright (e2e, `e2e/`), обычный CSS.

## Команды
- `npm start` — dev-сервер · `npm run build` — сборка · `npm test` — unit (watch)
- `bash scripts/check-fast.sh` — лёгкие проверки цикла разработки (только затронутые изменениями) · `npm run accept` — приёмка: память + кейсы/API/код + ESLint + unit + e2e (`scripts/accept.sh`) · `bash scripts/check-state.sh` — проверка состояния (быстро)

## Структура
`src/app/` — `store.js`, `reducers/` (слайсы), `services/`, `modules/<module>/` (компонент + css). Подробнее: `.ai/memory/architecture.md` (роутер по темам в `architecture/`).

## Контекст для AI: читай только нужное
Правила и память разложены по файлам в `.ai/` (структура — `.ai/README.md`). **Не читай всё подряд** — открывай файлы по этой таблице (единственный маршрутизатор):

| Задача | Файлы |
|---|---|
| Старт любой задачи разработки | `.ai/rules/memory-protocol.md`, `.ai/memory/tasks.md`, `.ai/rules/task-contract.md` |
| Компоненты, слайсы, стили | `.ai/rules/code-style.md` |
| Архитектура, паттерны, ревью кода | `.ai/rules/patterns.md` (+ скилл `react-patterns`, `.ai/memory/architecture.md` — роутер, открывать нужный файл из `architecture/`; решения — роутер `decisions.md` → файл из `decisions/`) |
| Тесты / новое поведение, user-кейсы | `.ai/rules/testing.md` |
| Баги, текущее состояние | `.ai/memory/state.md` |
| Новая библиотека/подход | `.ai/rules/tech-approval.md`, роутер `.ai/memory/decisions.md` → нужный файл из `decisions/` |
| Закрытие задачи (приёмка, ревью, проход qa-tester) | `.ai/rules/acceptance.md` (+ `.ai/memory/failures.md` при REJECT/FAIL) |
| Любая git-операция (коммит, ветка, слияние, push, PR) | `.ai/rules/git-flow.md` |
| Финальный отчёт | `.ai/rules/report-format.md` |
| Сомнение / не хватает данных (любая задача) | `.ai/rules/ask-user.md` |
| История закрытых задач | `.ai/memory/done.md` — роутер (таблица по ID) → файл из `done/` |
| Взять задачу из бэклога / заменённые решения | .ai/memory/backlog/FE-NN.md · `.ai/memory/queue.md` (только при пополнении бэклога) · `.ai/memory/decisions-archive.md` (поиском по ID) |
| Правка структуры памяти | `.ai/memory/README.md`, `scripts/check-memory.sh` |

## Неснимаемые правила (детали — в файлах по ссылкам)
1. **Память:** после ЛЮБЫХ изменений, до ответа пользователю: `tasks.md` (+ `state.md`, штамп) и `bash scripts/check-memory.sh` = 0. `.ai/rules/memory-protocol.md`.
2. **Новые технологии/подходы** — только после опроса пользователя (`AskUserQuestion`); выбор сразу пишется в `decisions/<тема>.md` + строка в роутер `decisions.md`. `.ai/rules/tech-approval.md`.
3. **Приёмка** (от дешёвого к дорогому): `check-fast.sh` в цикле → `npm run accept` = 0 → APPROVE `react-reviewer` → при изменении `src/`/`mock-bff/` PASS `qa-tester`; агентов запускает основная сессия. `.ai/rules/acceptance.md`.
4. **Контракт задачи** — в «В работе» `tasks.md` до тестов и кода; проверяет `scripts/check-contract.sh`. Ревью/QA по одной причине дважды или >2 раундов — стоп, `failures.md`, вопрос пользователю. `.ai/rules/task-contract.md`.
5. **Тесты вперёд:** новое поведение — unit и/или e2e в той же задаче, до реализации. `.ai/rules/testing.md`.
6. **Git:** перед любой git-операцией — `.ai/rules/git-flow.md`; старт задачи — `bash scripts/git-task.sh start …`, закрытие — `git-task.sh commit …`, затем push и `gh pr create` (без «Generated with Claude Code»). Слияние, теги — по просьбе.
7. **Не придумывать — спрашивать:** при сомнении агент спрашивает пользователя (`AskUserQuestion`); агент без такой возможности возвращает вопросы вызывающему. `.ai/rules/ask-user.md`.
8. **User-кейсы:** набор user-кейсов (индекс `docs/user-cases.md` + файлы `docs/user-cases/*.md`) менять только с явного разрешения пользователя; утверждает он (`! bash scripts/approve-usecases.sh`), агент скрипт не запускает и `.ai/user-cases.sha256` не правит. Каждый `active`-кейс покрыт e2e с тегом `[UC-…]` (`bash scripts/check-state.sh`). `.ai/rules/testing.md`.
9. **Сессия:** одна задача — одна сессия, `/clear` между задачами; при ≥90K (Sonnet/Haiku) / ≥150K (Opus) токенов контекста (hook `Stop`; в субагентах — `PostToolUse`) — сохранить «Осталось» и закрыть сессию; код задачи пишет `react-engineer`, основная сессия ведёт контракт, гейты и git. `.ai/rules/memory-protocol.md`, FE-D41.
