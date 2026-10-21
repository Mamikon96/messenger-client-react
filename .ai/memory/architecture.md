# Архитектура frontend (роутер)
> Проверено: 2026-10-17 @ f5bc883+dirty

Это только указатель: открывай файл из таблицы, а не всю папку `.ai/memory/architecture/`. Новый файл папки обязан попасть в таблицу (проверяет `scripts/check-memory.sh`).

| Что делаешь | Файл |
|---|---|
| Как стартует приложение, гейт `App` по `auth.status`, 401 | `architecture/data-flow.md` |
| Слайсы, селекторы, thunk-и, `rootReducer`, события `messageAdded` | `architecture/store.md` |
| Дерево компонентов, `Header`, `Messenger`, `Login` | `architecture/components.md` |
| `Button`, `Input`, `Avatar`, `IconButton`, `Dialog` | `architecture/ui-primitives.md` |
| Токены, светлая/тёмная тема, `useTheme` | `architecture/styles-theme.md` |
| `apiClient`, `authApi`, `chatsApi`, ошибки и валидация форм | `architecture/services.md` |
| mock-BFF, прокси dev-сервера, Playwright | `architecture/mock-bff.md` |

## Внешние данные
Бэкенд `messenger-server` — отдельный проект (SH-D04); контракт — `docs/client-integration.md` (FE-D12), REST под `/api`, WebSocket `/ws`. Сейчас в клиенте подключены auth, список чатов, карточка чата и история сообщений; отправка и локальные чаты пока в Redux, нормализованный стор и сетевой слой — FE-35…FE-42 (`tasks.md`). Состояние в памяти браузера, персистентности нет (FE-D04, FE-D15).

## AI-контекст
Правила работы — `.ai/rules/`, память — `.ai/memory/`, маршрутизатор «задача → файлы» — `.ai/README.md`; `CLAUDE.md` — только индекс.
