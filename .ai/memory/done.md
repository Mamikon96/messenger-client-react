# Сделано (архив)
> Проверено: 2026-10-18 @ 0beed45+dirty

Роутер архива закрытых задач (FE-D52): тексты записей лежат по одному файлу на задачу в `.ai/memory/done/<ID>.md` (несколько записей одного ID — в одном файле; записи без ID — `done/<ГГГГ-ММ-ДД>-<слаг>.md`). Читать только за историей: найти строку по ID и открыть один файл.

Запись добавляется при закрытии задачи по `.ai/rules/acceptance.md`: в файл `done/<ID>.md` — одна строка `- ГГГГ-ММ-ДД — FE-NN: что сделано · Кейсы: <UC-… из контракта> | нет · …` (формат `memory-protocol.md`), и одновременно в конец таблицы — строка `| Дата | ID | Суть | Файл |` (по строке на запись, дата и ID совпадают с записью). Файлы архива неизменяемы, штампа «Проверено» в них нет.

| Дата | ID | Суть | Файл |
|---|---|---|---|
| 2026-10-04 | — | Создана AI-структура: CLAUDE.md и .ai/memory | `done/2026-10-04-ai-structure.md` |
| 2026-10-04 | — | Скрипт приёмки npm run accept, смоук-тесты | `done/2026-10-04-accept-script.md` |
| 2026-10-05 | — | Память разделена на frontend/backend, check-memory в приёмке | `done/2026-10-05-memory-split-fe-be.md` |
| 2026-10-05 | — | Удалены файлы, связанные с бэкендом | `done/2026-10-05-remove-backend-files.md` |
| 2026-10-05 | — | Правила: актуализация tasks.md и согласование новых технологий | `done/2026-10-05-process-rules-tasks-sync.md` |
| 2026-10-05 | — | Правило: «Сделано» только при зелёной приёмке и APPROVE ревьюера | `done/2026-10-05-rule-done-requires-approve.md` |
| 2026-10-05 | — | Контекст AI разложен по файлам .ai/rules/ | `done/2026-10-05-rules-split-files.md` |
| 2026-10-05 | — | Правила git: git-flow, Conventional Commits, цикл ветки задачи | `done/2026-10-05-git-rules.md` |
| 2026-10-05 | — | Добавлен агент solution-architect | `done/2026-10-05-agent-solution-architect.md` |
| 2026-10-05 | — | Добавлен агент task-planner | `done/2026-10-05-agent-task-planner.md` |
| 2026-10-05 | — | Решения фиксируются сразу после выбора пользователя | `done/2026-10-05-decisions-immediately.md` |
| 2026-10-05 | — | Правило для агентов: не придумывать, спрашивать пользователя | `done/2026-10-05-rule-dont-invent-ask.md` |
| 2026-10-05 | — | Правила git: после коммита задачи автоматический push и PR | `done/2026-10-05-git-auto-push-pr.md` |
| 2026-10-05 | — | Ветка develop запушена, PR задач идут в develop | `done/2026-10-05-develop-branch.md` |
| 2026-10-05 | FE-09 | Контракт auth API зафиксирован (эндпоинты, тело сессии, коды ошибок) | `done/FE-09.md` |
| 2026-10-05 | FE-10 | Локальный mock-BFF по контракту auth API и контрактный тест | `done/FE-10.md` |
| 2026-10-05 | FE-11 | mock-BFF подключён к dev и e2e (setupProxy, playwright.config) | `done/FE-11.md` |
| 2026-10-05 | FE-12 | Единый apiClient: apiRequest, ApiError, CSRF, обработчик 401 | `done/FE-12.md` |
| 2026-10-05 | FE-13 | Слайс auth со статусами loading/anonymous/authenticated/error | `done/FE-13.md` |
| 2026-10-05 | FE-14 | Гейт входа в App.js по auth.status | `done/FE-14.md` |
| 2026-10-05 | FE-15 | Выход через меню пользователя, thunk logout | `done/FE-15.md` |
| 2026-10-05 | FE-02 | Слайс messages и Dialog: отправка по Send/Enter | `done/FE-02.md` |
| 2026-10-05 | — | Продукт и бэкенд: исследование предметной области | `done/2026-10-05-product-backend-research.md` |
| 2026-10-05 | — | Память: плоская раскладка .ai/memory/ | `done/2026-10-05-memory-flat-layout.md` |
| 2026-10-08 | — | Планирование редизайна UI: решения FE-D07…FE-D10 | `done/2026-10-08-ui-redesign-planning.md` |
| 2026-10-08 | FE-22 | Дизайн-токены src/styles/tokens.css (светлая и тёмная темы) | `done/FE-22.md` |
| 2026-10-08 | FE-23 | Тема light/dark/system: хранилище theme.js и хук useTheme | `done/FE-23.md` |
| 2026-10-08 | FE-24 | UI-примитивы Button, IconButton, Input, Avatar | `done/FE-24.md` |
| 2026-10-09 | FE-25 | Экран входа: карточка и провайдеры кнопками-ссылками | `done/FE-25.md` |
| 2026-10-09 | FE-32 | Интеграция с реальным бэкендом: анализ client-integration.md и план задач | `done/FE-32.md` |
| 2026-10-09 | — | chore user-cases-state-check: user-кейсы как источник истины, проверка состояния | `done/2026-10-09-user-cases-state-check.md` |
| 2026-10-09 | — | chore agent-patterns: паттерны для react-engineer и react-reviewer | `done/2026-10-09-agent-patterns.md` |
| 2026-10-09 | — | chore narrow-deny-mask: deny в settings.json сужен | `done/2026-10-09-narrow-deny-mask.md` |
| 2026-10-09 | FE-46 | Рефакторинг по паттернам (FE-D18): аудит и правки | `done/FE-46.md` |
| 2026-10-12 | — | chore harness-audit: аудит AI-харнеса | `done/2026-10-12-harness-audit.md` |
| 2026-10-12 | FE-51 | Харнес по аудиту (FE-D20…FE-D23): контракт задачи и проверки | `done/FE-51.md` |
| 2026-10-13 | FE-49 | ESLint в приёмке (FE-D24) | `done/FE-49.md` |
| 2026-10-13 | FE-50 | Архитектурные правила в ESLint (FE-D25, FE-D26) | `done/FE-50.md` |
| 2026-10-13 | FE-52 | Вторая часть аудита харнеса (FE-D27): hooks, архив done.md | `done/FE-52.md` |
| 2026-10-13 | — | chore passkeys-plan: подготовка перехода на вход по passkey | `done/2026-10-13-passkeys-plan.md` |
| 2026-10-13 | FE-57 | Хелпер сериализации WebAuthn (FE-D30) | `done/FE-57.md` |
| 2026-10-13 | FE-58 | Общий хелпер входа для e2e e2e/helpers/auth.js | `done/FE-58.md` |
| 2026-10-13 | FE-80 | Каскад проверок от дешёвых к дорогим: check-fast.sh (FE-D35) | `done/FE-80.md` |
| 2026-10-13 | FE-81 | mock-BFF для тестов по умолчанию на порту 3334 | `done/FE-81.md` |
| 2026-10-13 | — | chore qa-runs: отчёт qa-tester пишется в .qa/runs/<задача>.md | `done/2026-10-13-qa-runs.md` |
| 2026-10-13 | FE-84 | qa-tester: меньше вызовов Playwright и ошибок (FE-D37) | `done/FE-84.md` |
| 2026-10-13 | FE-86 | check-state.js: контрактные эндпоинты также из §2.1–§2.8 auth-password-spec.md | `done/FE-86.md` |
| 2026-10-13 | — | Синхронизация docs/auth-password-spec.md с бэкендом после BE-30 | `done/2026-10-13-sync-auth-spec-be30.md` |
| 2026-10-13 | FE-56 | ApiError получил code и details | `done/FE-56.md` |
| 2026-10-14 | — | Синхронизация §4.3 auth-password-spec.md после BE-31 | `done/2026-10-14-sync-auth-spec-be31.md` |
| 2026-10-14 | FE-88 | mock-BFF: вход и регистрация по паролю | `done/FE-88.md` |
| 2026-10-14 | FE-87 | user-cases.md под вход по паролю (спека §12.4) | `done/FE-87.md` |
| 2026-10-14 | FE-89 | Экран входа: форма логин + пароль с вкладками «Вход» / «Регистрация» | `done/FE-89.md` |
| 2026-10-14 | FE-90 | Удалены OAuth и задел passkey, экран входа только с формой пароля | `done/FE-90.md` |
| 2026-10-15 | FE-91 | Ошибки сервера на экране входа по коду ответа | `done/FE-91.md` |
| 2026-10-15 | FE-92 | Проверка полей экрана входа до отправки | `done/FE-92.md` |
| 2026-10-15 | FE-35 | Закрытая вне вкладки сессия ведёт на экран входа (хук 401) | `done/FE-35.md` |
| 2026-10-15 | FE-105 | Экономия токенов (FE-D41…FE-D44): индекс бэклога, backlog/, лимиты контекста | `done/FE-105.md` |
| 2026-10-15 | FE-105 | Проверка после слияния: замер первого хода новой сессии | `done/FE-105.md` |
| 2026-10-15 | FE-37 | Нормализованный стор по разделу 4 client-integration.md | `done/FE-37.md` |
| 2026-10-15 | FE-38 | Список чатов с сервера: chatsApi, fetchChats | `done/FE-38.md` |
| 2026-10-17 | FE-39 | Открытие чата: загрузка чата и истории сообщений | `done/FE-39.md` |
| 2026-10-17 | FE-40 | Оптимистичная отправка сообщений: статусы, автоповторы, лимит | `done/FE-40.md` |
| 2026-10-17 | FE-115 | qa-tester в дешёвом режиме (FE-D47) | `done/FE-115.md` |
| 2026-10-17 | FE-117 | Кейсы про отказы сети и тайминги: qa-tester не проходит в браузере | `done/FE-117.md` |
| 2026-10-17 | — | chore context-trim: сокращение стартового контекста | `done/2026-10-17-context-trim.md` |
| 2026-10-17 | FE-33 | Dev-окружение с реальным бэкендом: прокси и WS-URL | `done/FE-33.md` |
| 2026-10-17 | FE-41 | WS-сервис wsService и слайс realtime | `done/FE-41.md` |
| 2026-10-18 | FE-125 | architecture.md стал роутером, содержание в architecture/ | `done/FE-125.md` |
| 2026-10-18 | FE-126 | Чистка памяти: удалён auth-contract.md, актуализирован product-agreements.md | `done/FE-126.md` |
| 2026-10-18 | FE-128 | user-cases.md стал индексом, кейсы разнесены по docs/user-cases/*.md | `done/FE-128.md` |
| 2026-10-18 | FE-129 | Хвосты FE-128: сверка названий индекса, isFile для файлов кейсов | `done/FE-129.md` |
| 2026-10-18 | FE-130 | decisions.md стал роутером, тексты решений в decisions/*.md | `done/FE-130.md` |
| 2026-10-18 | FE-131 | done.md стал роутером, тексты записей в done/*.md | `done/FE-131.md` |
| 2026-10-18 | FE-132 | Лимит «Бэклога» tasks.md в 7 задач, остальные в queue.md | `done/FE-132.md` |
| 2026-10-18 | FE-133 | `git-task.sh start`: изменённый queue.md не блокирует старт | `done/FE-133.md` |
| 2026-10-18 | FE-42 | Догонка при реконнекте: сверка чатов, `since`, `online`/`visibilitychange` | `done/FE-42.md` |
