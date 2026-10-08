# Состояние frontend
> Проверено: 2026-10-09 @ 27d0cb8+dirty

## Общее
Ранний прототип UI мессенджера (React 18, CRA, Redux Toolkit). Сетевого слоя и персистентности сообщений нет; бэкенда в проекте нет. Тесты: unit (`chats`, `messages`, `Dialog`, `auth`, `store`, `UserMenu`, `apiClient`, `authApi`, `App`, `tokens`, `useTheme`, `authError`, `Login`, `Button`, `IconButton`, `Input`, `Avatar`, `globalStyles`), e2e: `smoke`, `tokens`, `theme`, `ui-primitives`, `messages`, `login` (вход через оба провайдера, сбой проверки сессии), `logout`, mock-BFF контрактные и proxy.

## Что работает
- Redux store с пятью слайсами: `chats`, `activeChat`, `messages` (`addMessage`), `users` (только `addChat`, `setActiveChat`, `addUser`) и `auth` (`status`: loading/anonymous/authenticated/error + `user`, thunks `checkSession`, `logout`); `rootReducer` сбрасывает весь store на `logout.fulfilled`
- `src/app/services/apiClient.js` и `authApi.js` (`fetchSession`, `logout`); csrfToken хранится только в apiClient
- Хедер с кнопкой «Join» → popover с формой `JoinForm`, создающей чат (`addChat`), и кнопкой с именем пользователя → popover `UserMenu` с «Выйти» (FE-15)
- Список чатов, выбор активного чата, подсветка `_active`
- Окно диалога: сообщения активного чата, отправка по Send/Enter (Shift+Enter — перенос), свои сообщения справа (`_own`)
- Дизайн-токены `src/styles/tokens.css` (светлая тема в `:root`, тёмная в `[data-theme="dark"]`, AA проверен тестом); компоненты пока на старых цветах (FE-24…FE-29) (FE-22)
- Тема light/dark/system: `useTheme`, `data-theme` на `<html>` до отрисовки, выбор в localStorage (FE-23); переключателя в UI ещё нет (FE-28)
- Экран входа: карточка, провайдеры из данных с иконками, «Переход…», ошибки OAuth по `?auth_error` (FE-25)
- UI-примитивы `Button`/`IconButton`/`Input`/`Avatar` в `src/app/modules/ui/`; кнопки и поля приложения на них (FE-24)
- mock-BFF (`mock-bff/server.js`, `npm run mock-bff`) по `auth-contract.md`; dev-сервер и e2e проксируют на него `/api` (FE-11)
- Гейт входа в `src/App.js` по `auth.status`: «Загрузка…» / экран `Login` (ссылки «Войти через Google/GitHub» на `/api/auth/{provider}/start`) / мессенджер / ошибка с кнопкой «Повторить»

## Известные проблемы
1. `src/app/modules/form/join-form/JoinForm.js`: `<label htmlFor="name">` без соответствующего `id` у инпутов; поле `title` без подписи; форма не очищается и не закрывает popover после Join; нет валидации.
2. `src/app/modules/messenger/components/dialog/Dialog.js`: автор сообщения не показывается (имена — FE-04), нет автопрокрутки вниз.
3. `src/app/modules/messenger/components/chat/Chat.js`: количество участников захардкожено `{0}`.
4. `src/app/modules/form/Form.js` (+ css) — пустой файл.
5. `src/app/modules/header/components/action/Action.js`: `OVERLAY_OPACITY` объявлена внутри компонента; пустая ветка рендера `""`.
6. `console.log` в: `Chats.js` (2), `JoinForm.js`.
7. `src/app/modules/messenger/components/chats/Chats.js`: `handleClick.bind(this, chat)` в функциональном компоненте, лишний параметр `index`.
8. `README.md` пустой (одна строка).
9. Промежуточно, до FE-24…FE-29: фоны компонентов захардкожены (`Chat.css`, `Actions.css`, `Dialog.css`), поэтому в тёмной теме светлый текст стоит на светло-сером фоне и контраст нарушен; сама тема работает, переключателя в UI нет (FE-28).

## Последняя приёмка
`npm run accept` → код выхода 0 (проверка памяти ✓, 206 unit ✓, 53 e2e ✓) · FE-25 · 2026-10-08

## Фокус сейчас
Задача не взята. Следующие по редизайну UI — FE-25, FE-26, FE-28, FE-29, см. `tasks.md`.
