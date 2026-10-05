# Состояние frontend
> Проверено: 2026-10-05 @ 2c63ef5+dirty

## Общее
Ранний прототип UI мессенджера (React 18, CRA, Redux Toolkit). Сетевого слоя и персистентности сообщений нет; бэкенда в проекте нет. Тесты: unit (`chats`, `auth`, `store`, `UserMenu`, `apiClient`, `authApi`, `App`), e2e: `smoke`, `login` (вход через оба провайдера, сбой проверки сессии), `logout`, mock-BFF контрактные и proxy.

## Что работает
- Redux store с четырьмя слайсами: `chats`, `activeChat`, `users` (только `addChat`, `setActiveChat`, `addUser`) и `auth` (`status`: loading/anonymous/authenticated/error + `user`, thunks `checkSession`, `logout`); `rootReducer` сбрасывает весь store на `logout.fulfilled`
- `src/app/services/apiClient.js` и `authApi.js` (`fetchSession`, `logout`); csrfToken хранится только в apiClient
- Хедер с кнопкой «Join» → popover с формой `JoinForm`, создающей чат (`addChat`), и кнопкой с именем пользователя → popover `UserMenu` с «Выйти» (FE-15)
- Список чатов, выбор активного чата, подсветка `_active`
- Каркас окна диалога (заголовок = title активного чата, поле ввода, кнопка Send)
- mock-BFF (`mock-bff/server.js`, `npm run mock-bff`) по `auth-contract.md`; dev-сервер и e2e проксируют на него `/api` (FE-11)
- Гейт входа в `src/App.js` по `auth.status`: «Загрузка…» / экран `Login` (ссылки «Войти через Google/GitHub» на `/api/auth/{provider}/start`) / мессенджер / ошибка с кнопкой «Повторить»

## Известные проблемы
1. `src/app/modules/form/join-form/JoinForm.js`: `<label htmlFor="name">` без соответствующего `id` у инпутов; поле `title` без подписи; форма не очищается и не закрывает popover после Join; нет валидации.
2. `src/app/modules/messenger/components/dialog/Dialog.js`: нет сообщений, `Send` только логирует; неиспользуемый проп `chat`.
3. `src/app/modules/messenger/components/chat/Chat.js`: количество участников захардкожено `{0}`.
4. `src/app/modules/form/Form.js` (+ css) — пустой файл.
5. `src/app/modules/header/components/action/Action.js`: `OVERLAY_OPACITY` объявлена внутри компонента; пустая ветка рендера `""`.
6. `console.log` в: `Chats.js` (2), `JoinForm.js`, `Dialog.js`.
7. `src/app/modules/messenger/components/chats/Chats.js`: `handleClick.bind(this, chat)` в функциональном компоненте, лишний параметр `index`.
8. `README.md` пустой (одна строка).

## Последняя приёмка
`npm run accept` → код выхода 0 (проверка памяти ✓, unit 50/50 ✓, e2e 30/30 ✓) · FE-15 · 2026-10-05

## Фокус сейчас
Не определён — выбрать из `tasks.md` (P1: FE-02; затем FE-16, FE-17).
