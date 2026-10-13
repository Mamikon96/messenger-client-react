// Тесты порта mock-BFF по умолчанию (FE-81): 3334, чтобы e2e и QA не конфликтовали с реальным бэкендом на 3333.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

// Конфиг Playwright читается в отдельном процессе: он пишет в process.env, а MOCK_BFF_* не должны прийти из окружения теста.
const loadPlaywrightConfig = () => {
  const env = { ...process.env };
  delete env.MOCK_BFF_PORT;
  delete env.MOCK_BFF_URL;
  const out = execFileSync(
    process.execPath,
    ['-e', "process.stdout.write(JSON.stringify(require('./playwright.config.js')))"],
    { cwd: ROOT, env, encoding: 'utf8' },
  );
  return JSON.parse(out);
};

test('mock-BFF по умолчанию слушает 3334, а не порт реального бэкенда 3333', () => {
  const { DEFAULT_PORT } = require('../mock-bff/server');
  assert.equal(DEFAULT_PORT, 3334);
});

test('playwright.config.js без MOCK_BFF_PORT поднимает mock-BFF и направляет dev-сервер e2e на 3334', () => {
  const config = loadPlaywrightConfig();
  const [bff, dev] = config.webServer;
  assert.equal(bff.url, 'http://localhost:3334/api/auth/session');
  assert.match(dev.command, /BACKEND_URL=http:\/\/localhost:3334 /);
  assert.doesNotMatch(JSON.stringify(config.webServer), /:3333/);
});
