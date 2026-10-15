# Архитектура frontend
> Проверено: 2026-10-15 @ 2d55915+dirty

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
- `Login` (FE-25, FE-89, FE-90) — карточка по центру: заголовок, вкладки «Вход» / «Регистрация» (WAI-ARIA Tabs: `tablist`/`tab`/`aria-selected`, стрелки и Home/End, форма — `tabpanel`), форма «Логин» + «Пароль» (`Input`, `useState`) — submit диспатчит thunk `login`/`register` и через `unwrap()` получает модель ошибки (payload отклонённого thunk) и до отправки проверяет поля `validateCredentials` (FE-92; модель `fields` того же вида, что у `toFormError`, поэтому тексты общие), показывает тексты из `loginErrors.js`: общее сообщение в `role=alert` над формой или ошибки у полей `Input` (`error`, снимается правкой поля); одна отправка за раз: `Button loading`, ref-флаг в обработчике, вкладки `disabled` на время запроса, после ошибки фокус на первом поле с ошибкой или на кнопке (`useEffect` по `focusRequest`); ссылок OAuth нет (FE-90)

## Стили и темы
- Дизайн-токены (FE-D07) — `src/styles/tokens.css` (CSS custom properties: цвета, типографика, отступы, радиусы, тени, анимации), подключены первым импортом в `src/index.js`. Светлая тема в `:root`, тёмная в `[data-theme="dark"]` (атрибут на `<html>`, переключение — `src/app/modules/theme/`). Компоненты пока используют старые литеральные цвета; миграция на токены — FE-24…FE-29.

## UI-примитивы (FE-24)
`src/app/modules/ui/` — `button/Button` (`variant` primary/secondary/ghost, `loading` → disabled + `aria-busy` + индикатор), `icon-button/IconButton` (обязательный `label` → `aria-label`), `input/Input` (input или textarea при `multiline`; `label`/`error` необязательны, без них рендерится голое поле; `aria-invalid`/`aria-describedby`; `forwardRef`), `avatar/Avatar` (картинка → при ошибке/без `src` инициалы на цвете из `id`; `size` sm/md/lg). Именованные экспорты, только токены, `:focus-visible` с обводкой акцентом, `className` пробрасывается. Глобальных стилей `button`/`input` больше нет (`App.css`); на примитивы переведены `App` (Повторить), `Action`, `UserMenu`, `JoinForm`, `Dialog`. `Button` с `href` рендерит ссылку (неактивная — `aria-disabled`, переход отменяется). `Avatar`/`IconButton` пока нигде не используются (FE-26, FE-28).

## Тема (FE-23, FE-D08)
- `src/app/modules/theme/theme.js` — внешнее хранилище вне Redux: режим `light`/`dark`/`system`, применённая тема, `initTheme()` (вызывается в `src/index.js` до рендера: читает localStorage `theme`, слушает `prefers-color-scheme`), `setMode`, `subscribe`/`getSnapshot`; хук `useTheme()` (`useSyncExternalStore`) отдаёт `{ mode, theme, setMode }` любому компоненту без провайдера.
- Тема ставится атрибутом `data-theme` на `<html>`. До загрузки React её выставляет инлайн-скрипт в `public/index.html` (та же логика, без вспышки). Выбор хранится в localStorage (сбой доступа — try/catch) и при logout не сбрасывается.
- UI переключателя — FE-28.

## Сервисы
- `apiClient.js` (`apiRequest`, CSRF, хук 401), `authApi.js` (`fetchSession`, `login`, `register` — `user` и `csrfToken` из ответа без повторного `GET /api/auth/session`, хук 401 не вызывают; `logout`), `authFormValidation.js` (`validateCredentials(mode, {login, password})` — проверка полей до отправки по спеке §4.1, §4.2, пароль в байтах UTF-8), `authFormError.js` (`toFormError` — `ApiError` → сериализуемая модель ошибки формы по `status`/`code`/`details`/`retryAfter`, не по `message`; thunks `login`/`register` отклоняются с ней через `rejectWithValue`); `loginService` и ключ localStorage `user` удалены (FE-14).

## Внешние данные
Бэкенд `messenger-server` — отдельный проект (SH-D04); контракт — `docs/client-integration.md` (FE-D12), REST под `/api`, WebSocket `/ws`. Сейчас в клиенте подключён только auth; чаты и сообщения пока локально в Redux, нормализованный стор и сетевой слой — FE-35…FE-42 (`tasks.md`). Состояние в памяти браузера, персистентности нет (FE-D04, FE-D15).

## mock-BFF (`mock-bff/server.js`)
Локальный Node-сервер (только `http`, без пакетов). Вход по паролю (`docs/auth-password-spec.md`): `POST /api/auth/register` (`201`, нормализация логина, `409 login_taken`, `400` с `details`, имя по кругу из 5 пар, частые пароли — короткий список) и `POST /api/auth/login` (`200`, `401 auth_failed`, `403 user_disabled` после верного пароля, `400`); пользователи в памяти (засеяны `alice`, `bob`, `admin`, `disabled`, пароль `correct-horse-1`); новая сессия уничтожает прежнюю из cookie запроса; cookie сессии без `Secure`, срок 400 дней, сессии в памяти; OAuth-маршрутов нет (FE-90). Запуск: `npm run mock-bff` (порт `MOCK_BFF_PORT`, по умолчанию 3334 — `DEFAULT_PORT`, его же берёт `playwright.config.js`; FE-81). Dev-сервер проксирует `/api` через `src/setupProxy.js` (`http-proxy-middleware` 2.x, devDependency) на `BACKEND_URL`, по умолчанию — реальный бэкенд `http://localhost:3333`. `playwright.config.js` поднимает mock-BFF и dev (3100) с `BACKEND_URL` на mock-BFF и задаёт `MOCK_BFF_URL`; для ручной работы с mock-BFF — `BACKEND_URL=http://localhost:3334 npm start`; тесты — `e2e/mock-bff.contract.spec.js` (прямо в mock-BFF), `e2e/mock-bff-proxy.spec.js` (через dev-сервер).

## AI-контекст
Правила работы — `.ai/rules/`, память — `.ai/memory/`, маршрутизатор «задача → файлы» — `.ai/README.md`; `CLAUDE.md` — только индекс.
