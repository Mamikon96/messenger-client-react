# Архитектура frontend
> Проверено: 2026-10-09 @ 8b57504+dirty

## Поток данных
`src/index.js` → `<Provider store>` → `App`: при монтировании `useEffect` диспатчит `checkSession` (cleanup — `abort`, StrictMode зовёт эффект дважды), дальше гейт по `auth.status`: `loading` — «Загрузка…», `anonymous` — `Login`, `authenticated` — `Header` + `Messenger`, `error` — сообщение и кнопка «Повторить» (повторный `checkSession`).

## Store (`src/app/store.js`)
| Слайс | Состояние | Actions |
|---|---|---|
| chats | `[]` чатов `{id, title, name}` | `addChat` (id = nanoid) |
| activeChat | `{}` — копия выбранного чата | `setActiveChat` (merge) |
| messages | `[]` `{id, chatId, authorId, text, ts}` | `addMessage` (id = nanoid, ts = Date.now()) |
| users | `[]` `{id, name}` | `addUser` |
| auth | `{status, user}` | thunks `checkSession`, `logout` |

`default` экспорт `store.js` построен на `rootReducer` (`combineReducers` + сброс): на `logout.fulfilled` состояние `undefined` → все слайсы в начальное, `auth` → `anonymous`.

Примечание: `activeChat` хранит копию чата, а не id; `Chat` сравнивает `activeChat.id === chat.id`.

## Компоненты
- `Header` → `Actions` → `Action` (кнопка + `Popover`) → контент `JoinForm` (создаёт чат); вторая `Action` с именем пользователя → `UserMenu` («Выйти», ошибка выхода — `role=alert`)
- `Popover` = `InnerPopover` (контент) + `Overlay` (затемнение, клик закрывает)
- `Messenger` = `Chats` (список `Chat`) + `Dialog` (заголовок, сообщения активного чата, ввод; автор = `auth.user.id`)
- `Login` (FE-25) — карточка по центру: заголовок, ошибка OAuth (`role=alert`, проп `error` — готовый текст), провайдеры из данных `providers.js` (`id`, `name`) кнопками-ссылками (`Button` с `href`) на `/api/auth/{id}/start` с инлайн-SVG `ProviderIcon`; клик → «Переход…» + `aria-busy`, остальные `aria-disabled`; `pageshow` с `persisted` сбрасывает состояние. Диспатча нет

## Стили и темы
- Дизайн-токены (FE-D07) — `src/styles/tokens.css` (CSS custom properties: цвета, типографика, отступы, радиусы, тени, анимации), подключены первым импортом в `src/index.js`. Светлая тема в `:root`, тёмная в `[data-theme="dark"]` (атрибут на `<html>`, переключение — `src/app/modules/theme/`). Компоненты пока используют старые литеральные цвета; миграция на токены — FE-24…FE-29.

## UI-примитивы (FE-24)
`src/app/modules/ui/` — `button/Button` (`variant` primary/secondary/ghost, `loading` → disabled + `aria-busy` + индикатор), `icon-button/IconButton` (обязательный `label` → `aria-label`), `input/Input` (input или textarea при `multiline`; `label`/`error` необязательны, без них рендерится голое поле; `aria-invalid`/`aria-describedby`; `forwardRef`), `avatar/Avatar` (картинка → при ошибке/без `src` инициалы на цвете из `id`; `size` sm/md/lg). Именованные экспорты, только токены, `:focus-visible` с обводкой акцентом, `className` пробрасывается. Глобальных стилей `button`/`input` больше нет (`App.css`); на примитивы переведены `App` (Повторить), `Action`, `UserMenu`, `JoinForm`, `Dialog`. `Button` с `href` рендерит ссылку (неактивная — `aria-disabled`, переход отменяется). `Avatar`/`IconButton` пока нигде не используются (FE-26, FE-28).

## Тема (FE-23, FE-D08)
- `src/app/modules/theme/theme.js` — внешнее хранилище вне Redux: режим `light`/`dark`/`system`, применённая тема, `initTheme()` (вызывается в `src/index.js` до рендера: читает localStorage `theme`, слушает `prefers-color-scheme`), `setMode`, `subscribe`/`getSnapshot`; хук `useTheme()` (`useSyncExternalStore`) отдаёт `{ mode, theme, setMode }` любому компоненту без провайдера.
- Тема ставится атрибутом `data-theme` на `<html>`. До загрузки React её выставляет инлайн-скрипт в `public/index.html` (та же логика, без вспышки). Выбор хранится в localStorage (сбой доступа — try/catch) и при logout не сбрасывается.
- UI переключателя — FE-28.

## Сервисы
- `src/app/services/authError.js` (FE-25): `readAuthError(search)` → текст ошибки OAuth или `null`, `clearAuthErrorFromUrl()` (`history.replaceState`); `App` читает параметр один раз при старте (`useState`-инициализатор) и передаёт в `Login`.
- `apiClient.js` (`apiRequest`, CSRF, хук 401), `authApi.js` (`fetchSession`, `logout`); `loginService` и ключ localStorage `user` удалены (FE-14).

## Внешние данные
Бэкенд `messenger-server` — отдельный проект (SH-D04); контракт — `docs/client-integration.md` (FE-D12), REST под `/api`, WebSocket `/ws`. Сейчас в клиенте подключён только auth; чаты и сообщения пока локально в Redux, нормализованный стор и сетевой слой — FE-35…FE-42 (`tasks.md`). Состояние в памяти браузера, персистентности нет (FE-D04, FE-D15).

## mock-BFF (`mock-bff/server.js`)
Локальный Node-сервер (только `http`, без пакетов) по прежнему контракту auth (`auth-contract.md`, история; расхождения с docs — FE-34): фейковый провайдер `/mock-provider/{provider}/authorize` (`?deny=1` — отказ), сессии и state в памяти. Запуск: `npm run mock-bff` (порт `MOCK_BFF_PORT`, по умолчанию 3333). Dev-сервер проксирует `/api` и `/mock-provider` через `src/setupProxy.js` (`http-proxy-middleware` 2.x, devDependency) на `BACKEND_URL`, по умолчанию — реальный бэкенд `http://localhost:3333`. `playwright.config.js` поднимает mock-BFF и dev (3100) с `BACKEND_URL` на mock-BFF и задаёт `MOCK_BFF_URL`; для ручной работы с mock-BFF — `BACKEND_URL=http://localhost:3333 npm start`; тесты — `e2e/mock-bff.contract.spec.js` (прямо в mock-BFF), `e2e/mock-bff-proxy.spec.js` (через dev-сервер). Cookie `Secure` на `http://localhost` принимают Chromium и Firefox — для e2e (Chromium) достаточно.

## AI-контекст
Правила работы — `.ai/rules/`, память — `.ai/memory/`, маршрутизатор «задача → файлы» — `.ai/README.md`; `CLAUDE.md` — только индекс.
