# User-кейсы messenger-client-react

> ЧЕРНОВИК. Документ вступает в силу после утверждения пользователем: `bash scripts/approve-usecases.sh`.
> После утверждения менять только с явного разрешения пользователя (CLAUDE.md, правило 8).

Источник истины о том, что умеет продукт. Набор кейсов — этот индекс и файлы по областям в `docs/user-cases/`; утверждение (хэш) охватывает индекс и все файлы. Каждый кейс со статусом `active` покрыт e2e-тестом с тегом `[UC-…]` в названии; кейсы `planned` — в планах (задачи в `.ai/memory/tasks.md`), тестов у них нет, пока пользователь не переведёт их в `active`. Кейсы `planned` лежат в файле своей области, в разделе «Запланированные кейсы (planned)».

Формат кейса: `Статус`, `Описание` (простым языком, для читателя без техподготовки), `Шаги`, `Ожидается`, необязательные строки `API:`. В файле области кейс начинается с заголовка `### UC-… — Название`. Статус в индексе и в файле должен совпадать (проверяет `scripts/check-state.js`).

Вход и регистрация по логину и паролю (FE-D38, контракт `docs/client-integration.md`): кейсы UC-SESSION-08, UC-SESSION-09, UC-PROFILE-01, UC-PROFILE-02 (UC-AUTH-09, UC-AUTH-12…UC-AUTH-20 уже действуют, раздел «Вход»; кейсы входа через OAuth удалены в FE-90). Тексты сообщений — черновик, окончательные утверждает пользователь.

---

## Кейсы по областям

### Вход (AUTH)

| ID | Название | Статус | Файл |
|---|---|---|---|
| UC-AUTH-12 | Вход по логину и паролю | active | docs/user-cases/auth.md |
| UC-AUTH-13 | Регистрация | active | docs/user-cases/auth.md |
| UC-AUTH-14 | Неверный логин или пароль | active | docs/user-cases/auth.md |
| UC-AUTH-15 | Логин занят | active | docs/user-cases/auth.md |
| UC-AUTH-16 | Проверка полей до отправки | active | docs/user-cases/auth.md |
| UC-AUTH-17 | Слишком много попыток | active | docs/user-cases/auth.md |
| UC-AUTH-18 | Одна попытка за раз | active | docs/user-cases/auth.md |
| UC-AUTH-19 | Сервер отклонил пароль при регистрации | active | docs/user-cases/auth.md |
| UC-AUTH-20 | Сервер недоступен при входе | active | docs/user-cases/auth.md |
| UC-AUTH-09 | Вход отключённого пользователя | active | docs/user-cases/auth.md |

### Сессия (SESSION)

| ID | Название | Статус | Файл |
|---|---|---|---|
| UC-SESSION-01 | Сессия переживает перезагрузку | active | docs/user-cases/session.md |
| UC-SESSION-02 | Сбой проверки сессии и «Повторить» | active | docs/user-cases/session.md |
| UC-SESSION-03 | Выход из аккаунта | active | docs/user-cases/session.md |
| UC-SESSION-04 | Сбой выхода | active | docs/user-cases/session.md |
| UC-SESSION-05 | Данные прошлого пользователя не видны после выхода | active | docs/user-cases/session.md |
| UC-SESSION-06 | Возврат на экран входа, когда сессия закрыта | active | docs/user-cases/session.md |
| UC-SESSION-08 | Выйти на всех устройствах | planned | docs/user-cases/session.md |
| UC-SESSION-09 | Несколько вкладок | active | docs/user-cases/session.md |

### Тема оформления (THEME)

| ID | Название | Статус | Файл |
|---|---|---|---|
| UC-THEME-01 | Тема следует настройке системы | active | docs/user-cases/theme.md |
| UC-THEME-02 | Выбранная тема запоминается | active | docs/user-cases/theme.md |
| UC-THEME-03 | Без вспышки неверной темы | active | docs/user-cases/theme.md |
| UC-THEME-04 | Экран входа в тёмной теме | active | docs/user-cases/theme.md |
| UC-THEME-05 | Переключатель темы в интерфейсе | active | docs/user-cases/theme.md |

### Чаты (CHAT)

| ID | Название | Статус | Файл |
|---|---|---|---|
| UC-CHAT-01 | Поиск человека и личный чат | active | docs/user-cases/chat.md |
| UC-CHAT-02 | Выбор чата | active | docs/user-cases/chat.md |
| UC-CHAT-03 | Список чатов с сервера | active | docs/user-cases/chat.md |
| UC-CHAT-04 | Создание личного чата или группы | planned | docs/user-cases/chat.md |
| UC-CHAT-05 | Управление группой | planned | docs/user-cases/chat.md |

### Сообщения (MSG)

| ID | Название | Статус | Файл |
|---|---|---|---|
| UC-MSG-01 | Отправка сообщения | active | docs/user-cases/msg.md |
| UC-MSG-02 | Перенос строки и пустые сообщения | active | docs/user-cases/msg.md |
| UC-MSG-03 | Сообщения не смешиваются между чатами | active | docs/user-cases/msg.md |
| UC-MSG-05 | Надёжная отправка с повтором | active | docs/user-cases/msg.md |
| UC-MSG-06 | Новые сообщения без перезагрузки | active | docs/user-cases/msg.md |
| UC-MSG-08 | Слишком длинное сообщение | active | docs/user-cases/msg.md |
| UC-MSG-09 | Догрузка пропущенного после обрыва связи | active | docs/user-cases/msg.md |
| UC-MSG-04 | История переписки | active | docs/user-cases/msg.md |
| UC-MSG-07 | Отметка о прочтении | planned | docs/user-cases/msg.md |
| UC-MSG-10 | Статус «прочитано собеседником» | planned | docs/user-cases/msg.md |

### Доступность и оформление (UI)

| ID | Название | Статус | Файл |
|---|---|---|---|
| UC-UI-01 | Видимый фокус при работе с клавиатуры | active | docs/user-cases/ui.md |
| UC-UI-02 | Адаптивная раскладка | active | docs/user-cases/ui.md |

### Профиль (PROFILE)

| ID | Название | Статус | Файл |
|---|---|---|---|
| UC-PROFILE-01 | Смена имени в настройках | planned | docs/user-cases/profile.md |
| UC-PROFILE-02 | Смена пароля | planned | docs/user-cases/profile.md |

### Администрирование (ADMIN)

| ID | Название | Статус | Файл |
|---|---|---|---|
| UC-ADMIN-01 | Администрирование видно только администратору | planned | docs/user-cases/admin.md |
| UC-ADMIN-04 | Управление пользователями | planned | docs/user-cases/admin.md |
