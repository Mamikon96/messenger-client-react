# Тесты
Читать: при написании/правке тестов и перед реализацией любой задачи с новым поведением.
Источник: FE-D16, FE-D24; исполняет `scripts/check-state.sh`. Пересмотреть, когда меняется состав тестов или правила кейсов.

- Порядок: **сначала unit- и e2e-тесты, потом реализация** (тесты должны падать до кода).
- Новое поведение = unit и/или e2e-тест в рамках той же задачи.
- Unit: Jest + Testing Library, рядом с кодом, `src/**/*.test.js` (пример: `src/app/reducers/chats.test.js`). Запуск: `npm test`.
- e2e: Playwright, папка `e2e/` (пример: `e2e/smoke.spec.js`), конфиг `playwright.config.js` (chromium, dev-сервер на порту 3100).
- Цикл разработки (FE-D35): после каждой итерации правок — `bash scripts/check-fast.sh` (`--dry-run` — показать выбор): проверка контракта, ESLint по изменённым `.js`, Jest `--findRelatedTests` по изменённым `src/**/*.js`, тесты `scripts/` для изменённых скриптов, e2e по тегам active-кейсов контракта задачи ветки и изменённым спекам (изменён общий файл `e2e/` — весь e2e). Изменения — относительно точки ответвления от `develop`, с незакоммиченными. Это не приёмка: штамп не пишет.
- Целиком: `npm run accept` — один раз, когда `check-fast.sh` зелёный (см. `acceptance.md`), включая ESLint с `--max-warnings=0`; ложные срабатывания правил Testing Library/Jest в `e2e/` и тестах `scripts/` сняты `overrides` в `package.json` (FE-D24), `eslint-disable` в коде не используется.
- **User-кейсы (FE-D16):** источник истины — `docs/user-cases.md`; менять его можно только с разрешения пользователя (утверждает он сам: `! bash scripts/approve-usecases.sh`). Каждый `active`-кейс покрыт e2e-тестом с тегом `[UC-…]` в названии: `test('[UC-AUTH-01] вход …', …)`. Нужен кейс, которого нет в документе, — спроси пользователя, не добавляй сам.
- Запрещены `test.skip`/`fixme`/`only`, тесты без `expect`; `retries: 0`, `forbidOnly` (`playwright.config.js`). Тест на `planned`-кейс писать нельзя, пока пользователь не перевёл его в `active`.
- Рассинхрон кейсов, API-контракта, кода и поведения ловит `bash scripts/check-state.sh` (`--behavior` — с прогоном e2e). Его тесты: `node --test scripts/check-state.test.js`.
