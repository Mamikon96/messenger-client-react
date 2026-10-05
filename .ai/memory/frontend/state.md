# Состояние frontend
> Проверено: 2026-10-05 @ 83c8cea+dirty

## Общее
Ранний прототип UI мессенджера (React 18, CRA, Redux Toolkit). Сетевого слоя и персистентности сообщений нет; бэкенда в проекте нет. Тесты: 1 unit (`src/app/reducers/chats.test.js`), 1 e2e smoke (`e2e/smoke.spec.js`).

## Что работает
- Redux store с тремя слайсами: `chats`, `activeChat`, `users` (только `addChat`, `setActiveChat`, `addUser`)
- Хедер с кнопкой «Join» → popover с формой `JoinForm`, создающей чат (`addChat`)
- Список чатов, выбор активного чата, подсветка `_active`
- Каркас окна диалога (заголовок = title активного чата, поле ввода, кнопка Send)
- mock-BFF (`mock-bff/server.js`, `npm run mock-bff`) по `auth-contract.md`; dev-сервер и e2e проксируют на него `/api` (FE-11), приложение его ещё не вызывает

## Известные проблемы
1. `src/App.js`: условие инвертировано — при `isLoggedIn()` показывается `Login`, иначе мессенджер; плюс закомментированный дубль JSX.
2. `src/app/modules/login/Login.js` не сохраняет пользователя в localStorage (ключ `user` из `src/app/services/loginService.js`), только `addUser` в Redux; `loginService` умеет только читать — вход не завершается.
3. `src/app/modules/form/join-form/JoinForm.js`: `<label htmlFor="name">` без соответствующего `id` у инпутов; поле `title` без подписи; форма не очищается и не закрывает popover после Join; нет валидации.
4. `src/app/modules/messenger/components/dialog/Dialog.js`: нет сообщений, `Send` только логирует; неиспользуемый проп `chat`.
5. `src/app/modules/messenger/components/chat/Chat.js`: количество участников захардкожено `{0}`.
6. `src/app/modules/form/Form.js` (+ css) — пустой файл.
7. `src/app/modules/header/components/action/Action.js`: `OVERLAY_OPACITY` объявлена внутри компонента; пустая ветка рендера `""`.
8. `console.log` в: `loginService.js`, `Chats.js` (2), `Login.js`, `JoinForm.js`, `Dialog.js`.
9. `src/app/modules/messenger/components/chats/Chats.js`: `handleClick.bind(this, chat)` в функциональном компоненте, лишний параметр `index`.
10. `README.md` пустой (одна строка).

## Последняя приёмка
`npm run accept` → код выхода 0 (проверка памяти ✓, unit 1/1 ✓, e2e 22/22 ✓ (смоук 1, контрактные 18, proxy 3)) · FE-11

## Фокус сейчас
Не определён — выбрать из `tasks.md` (цепочка авторизации: FE-11 → FE-12 → FE-13 → FE-14; также FE-02).
