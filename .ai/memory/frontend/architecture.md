# Архитектура frontend
> Проверено: 2026-10-05 @ 83c8cea+dirty

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
Сетевого слоя в приложении пока нет, бэкенда в проекте нет (SH-D04): всё состояние в Redux в памяти браузера.

## mock-BFF (`mock-bff/server.js`)
Локальный Node-сервер (только `http`, без пакетов) по `auth-contract.md`: фейковый провайдер `/mock-provider/{provider}/authorize` (`?deny=1` — отказ), сессии и state в памяти. Запуск: `npm run mock-bff` (порт `MOCK_BFF_PORT`, по умолчанию 3200). Dev-сервер проксирует `/api` и `/mock-provider` на него через `src/setupProxy.js` (`http-proxy-middleware` 2.x, devDependency). `playwright.config.js` поднимает mock-BFF и dev (3100) и задаёт `MOCK_BFF_URL`; тесты — `e2e/mock-bff.contract.spec.js` (прямо в mock-BFF), `e2e/mock-bff-proxy.spec.js` (через dev-сервер). Cookie `Secure` на `http://localhost` принимают Chromium и Firefox — для e2e (Chromium) достаточно.

## AI-контекст
Правила работы — `.ai/rules/`, память — `.ai/memory/`, маршрутизатор «задача → файлы» — `.ai/README.md`; `CLAUDE.md` — только индекс.
