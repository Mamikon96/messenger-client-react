# Тесты
Читать: при написании/правке тестов и перед реализацией любой задачи с новым поведением.

- Порядок: **сначала unit- и e2e-тесты, потом реализация** (тесты должны падать до кода).
- Новое поведение = unit и/или e2e-тест в рамках той же задачи.
- Unit: Jest + Testing Library, рядом с кодом, `src/**/*.test.js` (пример: `src/app/reducers/chats.test.js`). Запуск: `npm test`.
- e2e: Playwright, папка `e2e/` (пример: `e2e/smoke.spec.js`), конфиг `playwright.config.js` (chromium, dev-сервер на порту 3100).
- Целиком: `npm run accept` (см. `acceptance.md`).
- **User-кейсы (FE-D16):** источник истины — `docs/user-cases.md`; менять его можно только с разрешения пользователя (утверждает он сам: `! bash scripts/approve-usecases.sh`). Каждый `active`-кейс покрыт e2e-тестом с тегом `[UC-…]` в названии: `test('[UC-AUTH-01] вход …', …)`. Нужен кейс, которого нет в документе, — спроси пользователя, не добавляй сам.
- Запрещены `test.skip`/`fixme`/`only`, тесты без `expect`; `retries: 0`, `forbidOnly` (`playwright.config.js`). Тест на `planned`-кейс писать нельзя, пока пользователь не перевёл его в `active`.
- Рассинхрон кейсов, API-контракта, кода и поведения ловит `bash scripts/check-state.sh` (`--behavior` — с прогоном e2e). Его тесты: `node --test scripts/check-state.test.js`.
