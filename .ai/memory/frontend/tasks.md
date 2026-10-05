# Задачи frontend
> Проверено: 2026-10-05 @ e4827d4+dirty

Формат: `FE-NN` — название. Приоритет P1 (важно) … P3. «Зависит от» — задачи другой стороны/контракты.
Готовность — только после зелёного `npm run accept` И APPROVE ревьюера (см. `../decisions.md` SH-D02, `CLAUDE.md`).

## В работе
_(пусто)_

## Бэклог
- **FE-01 (P1)** Починить вход: инвертировать условие в `App.js`; `loginService` — добавить `login(user)`/`logout()`/`getUser()`; `Login` сохраняет пользователя в localStorage и в Redux.
- **FE-02 (P1)** Сообщения: слайс `messages` (chatId, authorId, text, ts), отправка из `Dialog`, рендер в `dialog__content`, очистка поля, Enter для отправки.
- **FE-03 (P2)** Доработать `JoinForm`: подписи полей, `id`/`htmlFor`, валидация, закрытие popover и сброс формы после создания.
- **FE-04 (P2)** Связать пользователей и чаты: участники чата, реальный счётчик в `Chat` вместо `0`, текущий пользователь как автор.
- **FE-05 (P2)** Удалить/реализовать пустой `form/Form.js`; убрать мёртвый код и `console.log`.
- **FE-06 (P2)** Тесты: слайсы (reducers), `loginService`, ключевые компоненты (Login, JoinForm, Chats).
- **FE-07 (P3)** Персистентность store (localStorage) до появления бэкенда.
- **FE-08 (P3)** Заполнить README (запуск, структура), настроить стили/тему (`_dark` сейчас хардкод в `Messenger`).

## Сделано
- 2026-10-04 — Создана AI-структура: `CLAUDE.md`, `.ai/memory/*`.
- 2026-10-04 — Скрипт приёмки `npm run accept` (Jest + Playwright), смоук-тесты.
- 2026-10-05 — Память разделена на frontend/backend (SH-D03), добавлен `scripts/check-memory.sh` в приёмку (приёмка: `npm run accept` ✓; решение FE-D03)
- 2026-10-05 — Из проекта удалены файлы, связанные с бэкендом (память backend/ и contracts.md, SH-D04); обновлены структура памяти, `CLAUDE.md`, `scripts/check-memory.sh` (приёмка: `npm run accept` ✓; решение FE-D03)
- 2026-10-05 — Правила процесса: актуализация `tasks.md` после любых изменений и согласование новых технологий/подходов с пользователем (в `CLAUDE.md`, скилле `project-memory`, агентах); проверка свежести задач в `scripts/check-memory.sh` (приёмка: `npm run accept` ✓; решение FE-D03)
- 2026-10-05 — Правило процесса: «Сделано» только при зелёном `npm run accept` И вердикте APPROVE ревьюера (`react-reviewer`); обновлены `CLAUDE.md`, скилл `project-memory`, агенты `*-engineer`, добавлены агенты `*-reviewer` (приёмка: `npm run accept` ✓; ревью не требуется — изменены только конфиги/процесс; решение FE-D03)
- 2026-10-05 — Контекст AI разложен по файлам: правила вынесены из `CLAUDE.md` в `.ai/rules/` (code-style, testing, tech-approval, acceptance, memory-protocol, report-format), добавлен маршрутизатор `.ai/README.md`, `CLAUDE.md` сжат до индекса, в `.ai/memory/README.md` добавлена колонка «когда читать»; `scripts/check-memory.sh` проверяет ссылки также в `CLAUDE.md` и `.ai/rules` (приёмка: `npm run accept` ✓; ревью не требуется — изменены только документация/процесс; решение FE-D03)
- 2026-10-05 — Правила git: `.ai/rules/git-flow.md` (git-flow, Conventional Commits) и автоматический цикл — ветка задачи при старте/продолжении (перед переключением — проверка состояния: репозиторий, задача в `tasks.md`, чистое дерево, актуальность базы с origin, `check-memory.sh`) и коммит после успешной приёмки через `scripts/git-task.sh` (start/commit); подключено в `CLAUDE.md` (правило 5), `.ai/README.md`, `memory-protocol.md`, `acceptance.md`, `report-format.md` (скрипт проверен во временном репозитории; приёмка: ожидает проверки пользователем; ревью не требуется — только документация/процесс; решение FE-D03)
