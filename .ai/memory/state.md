# Состояние frontend
> Проверено: 2026-10-15 @ 2d55915+dirty

## Общее
Ранний прототип UI мессенджера (React 18, CRA, Redux Toolkit). Сетевой слой — только auth (`src/app/services/apiClient.js`, `src/app/services/authApi.js`: проверка сессии, вход и регистрация по паролю, выход); чаты и сообщения живут только в Redux, без запросов к серверу и персистентности; бэкенд — отдельный проект `messenger-server`. Тесты: unit (`chats`, `messages`, `Dialog`, `auth`, `store`, `UserMenu`, `apiClient`, `authApi`, `App`, `tokens`, `useTheme`, `Login`, `Button`, `IconButton`, `Input`, `Avatar`, `globalStyles`), e2e: `smoke`, `chats`, `tokens`, `theme`, `ui-primitives`, `messages`, `login` (сессия после перезагрузки, сбой проверки сессии, тёмная тема экрана входа), `password-auth` (вход и регистрация по паролю, FE-89), `logout`, mock-BFF proxy и контрактные (контрактные в приёмке пропускаются без `MOCK_BFF_URL` — FE-53); вход и имя пользователя в e2e — через общий хелпер `e2e/helpers/auth.js` (FE-58; с FE-89 — форма логина и пароля, засеянный `alice` mock-BFF).

## Что работает
- Redux store с пятью слайсами: `chats`, `activeChat`, `messages` (`addMessage`), `users` (только `addChat`, `setActiveChat`, `addUser`) и `auth` (`status`: loading/anonymous/authenticated/error + `user`, thunks `checkSession`, `logout`); `rootReducer` сбрасывает весь store на `logout.fulfilled`
- `src/app/services/apiClient.js` и `authApi.js` (`fetchSession`, `login`, `register`, `logout`); csrfToken хранится только в apiClient
- Хедер с кнопкой «Join» → popover с формой `JoinForm`, создающей чат (`addChat`), и кнопкой с именем пользователя → popover `UserMenu` с «Выйти» (FE-15)
- Список чатов, выбор активного чата, подсветка `_active`
- Окно диалога: сообщения активного чата, отправка по Send/Enter (Shift+Enter — перенос), свои сообщения справа (`_own`)
- Дизайн-токены `src/styles/tokens.css` (светлая тема в `:root`, тёмная в `[data-theme="dark"]`, AA проверен тестом); компоненты пока на старых цветах (FE-24…FE-29) (FE-22)
- Тема light/dark/system: `useTheme`, `data-theme` на `<html>` до отрисовки, выбор в localStorage (FE-23); переключателя в UI ещё нет (FE-28)
- Экран входа: вкладки «Вход» / «Регистрация», форма логина и пароля, ошибки сервера по кодам: поля — по `details` (`field` + `code`), «Неверный логин или пароль», «Этот логин уже занят» у поля, отключение, `429` с секундами из `Retry-After` (секунды или минуты), «Не удалось войти. Проверьте соединение…» для сети, `5xx`, `403 forbidden` (FE-91); неожиданные ответы — «Не удалось войти. Попробуйте ещё раз.», `429` от минуты — в минутах (FE-89, FE-91); OAuth и задел passkey удалены (FE-90)
- UI-примитивы `Button`/`IconButton`/`Input`/`Avatar` в `src/app/modules/ui/`; кнопки и поля приложения на них (FE-24)
- mock-BFF (`mock-bff/server.js`, `npm run mock-bff`): вход и регистрация по паролю по `docs/auth-password-spec.md` (`POST /api/auth/register`, `/login`, засеянные `alice`, `bob`, `admin`, `disabled`, пароль `correct-horse-1`; FE-88); OAuth-маршрутов нет (FE-90); `logout-all`, `PATCH /api/me`, `me/password` ещё нет (FE-93…FE-95); dev-сервер и e2e проксируют на него `/api` (FE-11)
- Гейт входа в `src/App.js` по `auth.status`: «Загрузка…» / экран `Login` (форма логина и пароля) / мессенджер / ошибка с кнопкой «Повторить»

## Известные проблемы
Каждая проблема — со ссылкой на задачу бэклога (→ FE-NN), где описано исправление; подробности — там, здесь не дублируются.
1. `src/app/modules/form/join-form/JoinForm.js`: `<label htmlFor="name">` без соответствующего `id` у инпутов; поле `title` без подписи; форма не очищается и не закрывает popover после Join; нет валидации. → FE-44
2. `src/app/modules/messenger/components/dialog/Dialog.js`: автор сообщения не показывается (имена — FE-04), нет автопрокрутки вниз. → FE-27
3. `src/app/modules/messenger/components/chat/Chat.js`: количество участников захардкожено `{0}`. → FE-26
4. `src/app/modules/form/Form.js` (+ css) — пустой файл. → FE-05
5. `src/app/modules/header/components/action/Action.js`: `OVERLAY_OPACITY` объявлена внутри компонента; пустая ветка рендера `""`. → FE-29
6. `src/app/modules/messenger/components/chats/Chats.js`: `handleClick.bind(this, chat)` в функциональном компоненте, лишний параметр `index`. → FE-26
7. `README.md` пустой (одна строка). → FE-08
8. Промежуточно, до FE-24…FE-29: фоны компонентов захардкожены (`Chat.css`, `Actions.css`, `Dialog.css`), поэтому в тёмной теме светлый текст стоит на светло-сером фоне и контраст нарушен; сама тема работает, переключателя в UI нет (FE-28). → FE-26…FE-29
9. Расхождение с `docs/client-integration.md` (FE-D12; план — FE-33…FE-45):
    - `src/app/services/apiClient.js`: хук 401 (`setUnauthorizedHandler`, вызывается только при `401 unauthorized` — FE-56) нигде не зарегистрирован — закрытая сессия не ведёт на экран входа (FE-35); нет повтора на `403 csrf_invalid` (FE-96).
    - `src/app/reducers/chats.js`, `messages.js`, `users.js`, `activeChat.js`: модель стора не совпадает с API (`nanoid`, `authorId`/`text`/`ts` вместо `senderId`/`body`/`createdAt`/`seq`, `activeChat` — копия чата).
    - `mock-bff/server.js`: `401` без сессии (`session`, `logout`, прочие `/api/*`) — `{error:{code:"unauthorized"}}`; `403` при неверном CSRF (нет `csrf_invalid` — FE-96) и `404` — с пустым телом; cookie сессии без `Secure`, только auth; остальные `/api/*` — 404; проверки `Origin` и rate limit нет (`429` в e2e — `page.route`).
    - `src/setupProxy.js`: `/api` проксируется на `BACKEND_URL` (по умолчанию `http://localhost:3333`), `/ws` нет; путь `/ws` бэкенда совпадает с HMR-сокетом CRA (гипотеза, проверить запуском — FE-33, FE-D14). Порт реального бэкенда — всегда 3333 (решено пользователем 2026-10-09); e2e и qa-tester задают `BACKEND_URL` на mock-BFF (3334, `DEFAULT_PORT` в `mock-bff/server.js`, FE-81); `/ws` и `.env.example` — FE-33.
10. Форма Join (QA-проход 2026-10-09, QA-1 MINOR, QA-2 NIT): после создания чата popover остаётся открытым с прежними значениями — повторное нажатие создаст дубликат; Escape форму не закрывает, только клик по оверлею. Кейс UC-CHAT-01 о закрытии формы молчит. Исправление — FE-29. → FE-44, FE-29

## Последняя приёмка
`npm run accept` → код выхода 0 (штамп `.qa/accept.json` 2026-10-15 17:09:45; unit ✓, e2e ✓) · ревью react-reviewer APPROVE (2 раунда) · QA PASS (`.qa/runs/FE-92.md`) · FE-92 · 2026-10-15

## Фокус сейчас
Задача не взята. Эпик входа по логину/паролю (FE-D38, SH-D18; эпик passkey отменён): FE-56, FE-88, FE-87, FE-89, FE-90, FE-91, FE-92 закрыты; дальше FE-35 → FE-37 → …; копия `docs/auth-password-spec.md` (§1–11) синхронизирована с бэкендом в FE-91; при новых правках спеки бэкенда сверять снова.
