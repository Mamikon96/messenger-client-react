# Архитектура frontend
> Проверено: 2026-10-05 @ e4827d4+dirty

## Поток данных
`src/index.js` → `<Provider store>` → `App` → если `loginService.isLoggedIn()` (читает localStorage["user"]) …(сейчас инвертировано, см. `state.md` #1) `Login` иначе `Header` + `Messenger`.

## Store (`src/app/store.js`)
| Слайс | Состояние | Actions |
|---|---|---|
| chats | `[]` чатов `{id, title, name}` | `addChat` (id = nanoid) |
| activeChat | `{}` — копия выбранного чата | `setActiveChat` (merge) |
| users | `[]` `{id, name}` | `addUser` |

Примечание: `activeChat` хранит копию чата, а не id; `Chat` сравнивает `activeChat.id === chat.id`.

## Компоненты
- `Header` → `Actions` → `Action` (кнопка + `Popover`) → контент `JoinForm` (создаёт чат)
- `Popover` = `InnerPopover` (контент) + `Overlay` (затемнение, клик закрывает)
- `Messenger` (класс `_dark`) = `Chats` (список `Chat`) + `Dialog` (заголовок, область сообщений, ввод)
- `Login` — форма с именем, диспатчит `addUser`

## Сервисы
- `LoginService` (singleton, `src/app/services/loginService.js`) — ключ localStorage `user`, метод `isLoggedIn()`.

## Внешние данные
Сетевого слоя нет, бэкенда в проекте нет (SH-D04): всё состояние в Redux в памяти браузера.

## AI-контекст
Правила работы — `.ai/rules/`, память — `.ai/memory/`, маршрутизатор «задача → файлы» — `.ai/README.md`; `CLAUDE.md` — только индекс.
