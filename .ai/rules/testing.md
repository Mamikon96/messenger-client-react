# Тесты
Читать: при написании/правке тестов и перед реализацией любой задачи с новым поведением.

- Порядок: **сначала unit- и e2e-тесты, потом реализация** (тесты должны падать до кода).
- Новое поведение = unit и/или e2e-тест в рамках той же задачи.
- Unit: Jest + Testing Library, рядом с кодом, `src/**/*.test.js` (пример: `src/app/reducers/chats.test.js`). Запуск: `npm test`.
- e2e: Playwright, папка `e2e/` (пример: `e2e/smoke.spec.js`), конфиг `playwright.config.js` (chromium, dev-сервер на порту 3100).
- Целиком: `npm run accept` (см. `acceptance.md`).
