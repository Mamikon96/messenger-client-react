# Задачи frontend
> Проверено: 2026-10-15 @ dce097d+dirty

Формат: `FE-NN` — название. Приоритет P1 (важно) … P3. «Зависит от» — задачи другой стороны/контракты.
Готовность — только после зелёного `npm run accept` И APPROVE ревьюера (см. `decisions.md` SH-D02, `CLAUDE.md`).

## В работе
Нет.

## Бэклог
> Контекст решений по бэклогу — `.ai/memory/backlog/README.md`; подробности задачи — файл .ai/memory/backlog/FE-NN.md (читать, когда задачу берут в работу).
- **FE-102 (P3)** Удалить ветку `href` из `Button` и её тесты: после FE-90 нигде не используется. Подробности: `.ai/memory/backlog/FE-102.md`
- **FE-101 (P2)** Экран входа на низком окне (~460px): карточка `Login` обрезается без прокрутки, сделать целиком достижимой. Подробности: `.ai/memory/backlog/FE-101.md`
- **FE-100 (P3, харнес)** `approve-usecases.sh` без TTY молча завершается: выдавать ошибку с подсказкой `--yes` и поправить подсказки. Подробности: `.ai/memory/backlog/FE-100.md`
- **FE-99 (P3, харнес)** `git-task.sh commit`: добавлять футер `Co-Authored-By` без дублирования, как в бэкенде (BE-28). Подробности: `.ai/memory/backlog/FE-99.md`
- **FE-103 (P3)** `Button`: пробрасывать `ref` (`forwardRef`) и использовать его в `Login` для фокуса на кнопку отправки. Подробности: `.ai/memory/backlog/FE-103.md`
- **FE-104 (P3)** `Input`: у ошибки поля `role="alert"` вместе с `aria-describedby` озвучивается дважды; решить с пользователем. Подробности: `.ai/memory/backlog/FE-104.md`
- **FE-82 (P3)** `doneCaseIds` в `check-state.js`: привязать поле «Кейсы:» к разделителю записи `done.md`, чтобы не терять кейсы. Подробности: `.ai/memory/backlog/FE-82.md`
- **FE-83 (P3)** Приёмка не ловит невалидный `.claude/settings.json`: добавить проверку `JSON.parse` в `check-memory.sh` или `check-state.sh`. Подробности: `.ai/memory/backlog/FE-83.md`
- **FE-26 (P1)** Каркас `Messenger` и список чатов: две панели, `Chat` с аватаром, активный чат, пустое состояние; правки по аудиту FE-46. Подробности: `.ai/memory/backlog/FE-26.md`
- **FE-27 (P1)** `Dialog`: пузыри, статусы `sending`/`failed` и «Повторить», Enter/Shift+Enter, автопрокрутка, пустые состояния, селекторы. Подробности: `.ai/memory/backlog/FE-27.md`
- **FE-28 (P1)** Header и `UserMenu`: аватар с инициалами, переключатель темы, выход, закрытие по Esc/клику снаружи; правки по аудиту FE-46. Подробности: `.ai/memory/backlog/FE-28.md`
- **FE-33 (P1)** Dev-окружение с реальным бэкендом: прокси `/api` (`BACKEND_URL`), WS через `REACT_APP_WS_URL`, `.env.example`, README. Подробности: `.ai/memory/backlog/FE-33.md`
- **FE-35 (P1)** apiClient: 401-хук `setUnauthorizedHandler` (сброс store, экран входа) и строгая модель `SessionUser` из `authApi`. Подробности: `.ai/memory/backlog/FE-35.md`
- **FE-37 (P1)** Нормализованный стор: слайсы `chats`/`messages`/`users`, `activeChatId`, мемоизированные селекторы, убрать `nanoid`. Подробности: `.ai/memory/backlog/FE-37.md`
- **FE-38 (P1)** Список чатов с сервера (`GET /api/chats`): сортировка, `unreadCount`, `peer`, состояния загрузки/ошибки/пусто. Подробности: `.ai/memory/backlog/FE-38.md`
- **FE-39 (P1)** Открытие чата: `GET /api/chats/:id` и история сообщений (последние 50, подкачка `before`), имена отправителей. Подробности: `.ai/memory/backlog/FE-39.md`
- **FE-40 (P1)** Оптимистичная отправка сообщений: `clientId`, статусы `sending`/`sent`/`failed`, ретраи, `429`, лимит 4000 символов. Подробности: `.ai/memory/backlog/FE-40.md`
- **FE-41 (P1)** WS-сервис: подключение, события `message.new`/`chat.*` в store, дедуп по `seq`, коды закрытия, backoff, баннер при `4008`. Подробности: `.ai/memory/backlog/FE-41.md`
- **FE-42 (P1)** Догонка при реконнекте: сверка `GET /api/chats`, `since` с подкачкой, реакция на `online`/`visibilitychange`. Подробности: `.ai/memory/backlog/FE-42.md`
- **FE-96 (P1)** apiClient: после `403 csrf_invalid` перечитать сессию (single-flight), повторить запрос раз, при смене `user.id` сбросить store. Подробности: `.ai/memory/backlog/FE-96.md`
- **FE-98 (P1)** Перейти на итоговый контракт бэкенда: заменить `docs/client-integration.md`, сверить mock-BFF, пройти `qa-tester` на реальном сервере. Подробности: `.ai/memory/backlog/FE-98.md`
- **FE-05 (P2)** Удалить пустой `modules/form/Form.js` и мёртвый код; исправить устаревшие ссылки на `auth-contract.md` в mock-BFF и e2e. Подробности: `.ai/memory/backlog/FE-05.md`
- **FE-06 (P2)** Тесты на долг по существующему коду, не покрытому FE-26…FE-45 (`Chat`, `Popover`, `Overlay`, `Header`, `Messenger` и др.). Подробности: `.ai/memory/backlog/FE-06.md`
- **FE-29 (P2)** `Popover`/`Overlay` в `ui/`: Esc, фокус внутрь и возврат, `role=dialog`, закрытие поповера после создания чата. Подробности: `.ai/memory/backlog/FE-29.md`
- **FE-30 (P2)** Адаптив: ниже ~768px одна панель за раз (список чатов или диалог) и кнопка «назад» в заголовке диалога. Подробности: `.ai/memory/backlog/FE-30.md`
- **FE-31 (P2)** Полировка UI: скелетоны загрузки, токены вместо литералов в `Login.css`, фокус `Button` в `loading`, reduced-motion, контраст AA. Подробности: `.ai/memory/backlog/FE-31.md`
- **FE-43 (P2)** Прочтение: `POST /api/chats/:id/read` по max `seq` с debounce, обнуление `unreadCount`, перечитывание списка при фокусе. Подробности: `.ai/memory/backlog/FE-43.md`
- **FE-44 (P2)** Новый чат: `GET /api/users`, создание direct/group (`POST /api/chats`) с валидацией, замена `JoinForm`. Подробности: `.ai/memory/backlog/FE-44.md`
- **FE-45 (P2)** Управление группой: переименование (owner), добавление/удаление участников, выход, `chat.removed`, ошибки 403/409. Подробности: `.ai/memory/backlog/FE-45.md`
- **FE-47 (P2)** Error Boundary (свой класс-компонент) на корне и крупных областях: fallback вместо белого экрана; решение в `decisions.md`. Подробности: `.ai/memory/backlog/FE-47.md`
- **FE-59 (P2)** Маршрутизация на `react-router` 7.x (FE-D31): сначала спросить пользователя, нужен ли роутер после FE-D38. Подробности: `.ai/memory/backlog/FE-59.md`
- **FE-67 (P2)** Админка: раздел виден только админу (`GET /api/admin/users`: 200 — есть, 403 — нет), mock-BFF с признаком админа. Подробности: `.ai/memory/backlog/FE-67.md`
- **FE-93 (P2)** Настройки профиля: имя и фамилия (`PATCH /api/me`) и логин только для чтения; ошибки по `details`, mock-BFF. Подробности: `.ai/memory/backlog/FE-93.md`
- **FE-94 (P2)** Смена пароля в настройках (`POST /api/me/password`): проверка нового до отправки, `401`/`400`/`429`, mock-BFF. Подробности: `.ai/memory/backlog/FE-94.md`
- **FE-95 (P2)** «Выйти на всех устройствах» в меню (`POST /api/auth/logout-all`): сброс store, mock-BFF, нужно ли подтверждение — вопрос. Подробности: `.ai/memory/backlog/FE-95.md`
- **FE-97 (P2)** Память и правила после перехода на пароль: убрать OAuth/passkey из `auth-contract.md`, `architecture.md`, правил и `check-state.js`. Подробности: `.ai/memory/backlog/FE-97.md`
- **FE-70 (P2)** Админка: список пользователей, назначение админа и отключение/включение через `PATCH /api/admin/users/:id`, mock-BFF. Подробности: `.ai/memory/backlog/FE-70.md`
- **FE-48 (P3)** `check-memory.sh`: проверять наличие обязательных разделов `state.md` (сначала тест на отсутствующий раздел). Подробности: `.ai/memory/backlog/FE-48.md`
- **FE-53 (P3)** Контрактные тесты mock-BFF: убрать условный `test.skip` и устаревший комментарий в `e2e/mock-bff.contract.spec.js`. Подробности: `.ai/memory/backlog/FE-53.md`
- **FE-54 (P3)** `IconButton.test.js`: заменить проверку `innerHTML` регуляркой на `isInaccessible(getByTestId("icon"))`. Подробности: `.ai/memory/backlog/FE-54.md`
- **FE-55 (P3)** ESLint `console.log`: закрыть обход через `console["log"](x)` селектором в `no-restricted-syntax` и тестом правила. Подробности: `.ai/memory/backlog/FE-55.md`
- **FE-20 (P3)** Доработки по ревью FE-13/FE-14: убрать предупреждение `act` в `App.test.js`, фокус после «Повторить», `condition` для `checkSession`. Подробности: `.ai/memory/backlog/FE-20.md`
- **FE-08 (P3)** Заполнить README: запуск, команды, структура, запуск с реальным бэкендом и вход при разработке. Подробности: `.ai/memory/backlog/FE-08.md`
