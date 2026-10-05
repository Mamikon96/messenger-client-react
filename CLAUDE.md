# messenger-client-react

Клиент мессенджера на React (Create React App). Бэкенда нет — всё состояние живёт в Redux в памяти браузера.

## Стек
React 18, react-scripts 5 (CRA), JavaScript (без TypeScript), Redux Toolkit 2 + react-redux 9, Jest + Testing Library (unit), Playwright (e2e, `e2e/`), обычный CSS.

## Команды
- `npm start` — dev-сервер · `npm run build` — сборка · `npm test` — unit (watch)
- `npm run accept` — приёмка: проверка памяти + unit + e2e (`scripts/accept.sh`)

## Структура
`src/app/` — `store.js`, `reducers/` (слайсы), `services/`, `modules/<module>/` (компонент + css). Подробнее: `.ai/memory/architecture.md`.

## Контекст для AI: читай только нужное
Правила и память разложены по файлам в `.ai/`. **Не читай всё подряд** — открывай файлы по маршрутизатору `.ai/README.md`:

| Задача | Файлы |
|---|---|
| Старт любой задачи разработки | `.ai/rules/memory-protocol.md`, `.ai/memory/tasks.md` |
| Компоненты, слайсы, стили | `.ai/rules/code-style.md` |
| Тесты / новое поведение | `.ai/rules/testing.md` |
| Баги, текущее состояние | `.ai/memory/state.md` |
| Новая библиотека/подход | `.ai/rules/tech-approval.md` |
| Закрытие задачи | `.ai/rules/acceptance.md` |
| Любая git-операция (коммит, ветка, слияние, push, PR) | `.ai/rules/git-flow.md` |
| Финальный отчёт | `.ai/rules/report-format.md` |
| Сомнение / не хватает данных (любая задача) | `.ai/rules/ask-user.md` |

## Неснимаемые правила (детали — в файлах выше)
1. **Память:** после ЛЮБЫХ изменений, до ответа пользователю, актуализируй `tasks.md` (+ `state.md`, штамп) и запусти `bash scripts/check-memory.sh`. Протокол — `.ai/rules/memory-protocol.md`.
2. **Новые технологии/подходы** — только после опроса пользователя (`AskUserQuestion`); сразу после его выбора решение (что, почему, альтернативы) записывается в `decisions.md` — для вариантов от `solution-architect` это делает он; агенты читают `decisions.md`, а не изобретают заново. См. `.ai/rules/tech-approval.md`.
3. **Приёмка:** «Сделано» только при `npm run accept` = 0 **и** APPROVE от `react-reviewer`; ревью запускает основная сессия. См. `.ai/rules/acceptance.md`.
4. Для нового поведения — unit и/или e2e-тест в рамках той же задачи, тесты пишутся до реализации. См. `.ai/rules/testing.md`.
5. **Git:** перед любой git-операцией читай `.ai/rules/git-flow.md`. Автоматически: старт/продолжение задачи → `bash scripts/git-task.sh start …` (сначала проверка состояния, потом ветка; ошибку не обходить), успешное закрытие по п. 3 → `bash scripts/git-task.sh commit …`, затем push ветки и `gh pr create` (без строки «Generated with Claude Code»). Слияние, теги — только по просьбе.
6. **Не придумывать — спрашивать:** любой агент при сомнении или нехватке данных спрашивает пользователя (`AskUserQuestion`); догадки и собственные допущения запрещены. Агент без возможности спросить возвращает вопросы вызывающему, а тот переадресует их пользователю. См. `.ai/rules/ask-user.md`.
